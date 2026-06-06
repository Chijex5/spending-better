"""
routers/log_upload.py
─────────────────────
POST /log/upload  — accept an OPay/Zenith Excel or CSV statement,
                    deduplicate against rows already in daily_log,
                    run analyze_statement.analyze(), bulk-upsert.

Returns a UploadResult summary so the frontend can show the user
exactly what was new vs what was already present.
"""
from __future__ import annotations

import io
from datetime import datetime, date as date_cls
from typing import Optional

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from analyze_statement import analyze
from cache import invalidate
from routers.utils import execute, fetch_rows

router = APIRouter()


# ─── Response model ──────────────────────────────────────────────────────────

class UploadResult(BaseModel):
    total_rows_in_file: int          # transaction rows parsed from the file
    new_days_inserted: int           # calendar days that didn't exist in DB
    days_updated: int                # calendar days that already existed (overwritten)
    duplicate_transactions_skipped: int  # exact-match rows that were already in DB
    date_range_start: str
    date_range_end: str
    high_spend_days_detected: int


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _existing_transaction_keys() -> set[str]:
    """
    Pull every (date, description, debit, credit) tuple already in the DB
    and return them as a frozenset of strings we can hash-check against.

    We keep the description lowercase + stripped so minor whitespace
    differences don't sneak duplicates through.
    """
    rows = await fetch_rows(
        """
        SELECT t.trans_date::text,
               lower(trim(t.description))   AS description,
               t.debit,
               t.credit
        FROM   statement_transactions t
        """
    )
    return {
        f"{r['trans_date']}|{r['description']}|{r['debit']}|{r['credit']}"
        for r in rows
    }


async def _existing_daily_dates() -> set[str]:
    """Return the set of date strings that already have a row in daily_log."""
    rows = await fetch_rows("SELECT date::text FROM daily_log")
    return {r["date"] for r in rows}


def _make_txn_key(row: pd.Series) -> str:
    date_str = str(row["Trans_Date"].date())
    desc     = str(row["Description"]).lower().strip()
    debit    = float(row["Debit"])
    credit   = float(row["Credit"])
    return f"{date_str}|{desc}|{debit}|{credit}"


def _read_file(upload: UploadFile) -> pd.DataFrame:
    """
    Read an uploaded file into a raw DataFrame.
    Supports .xlsx, .xls, and .csv.
    """
    content = upload.file.read()
    fname   = (upload.filename or "").lower()

    if fname.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content), header=None)

    # Excel — try the known OPay sheet name first, fall back to first sheet
    xls = pd.ExcelFile(io.BytesIO(content))
    sheet = (
        "Wallet Account Transactions"
        if "Wallet Account Transactions" in xls.sheet_names
        else xls.sheet_names[0]
    )
    return pd.read_excel(io.BytesIO(content), sheet_name=sheet, header=None)

def to_date(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (datetime, date_cls)):
        return val
    return pd.to_datetime(val).to_pydatetime()

async def _bulk_insert_transactions(df_txn: pd.DataFrame) -> None:
    """
    Insert every row of df_txn into statement_transactions.
    This table is the raw ledger — we use ON CONFLICT DO NOTHING so
    exact duplicates are silently skipped at the DB level too.
    """
    for _, row in df_txn.iterrows():
        print(f"Inserting transaction: {row['Recipient']}")
        rec = row.get("Recipient")
        recipient = str(rec) if rec and pd.notna(rec) else None
        await execute(
            """
            INSERT INTO statement_transactions
            (trans_date, value_date, description, debit, credit,
            balance, channel, ref, category, direction,
            amount, is_real_spend, recipient, created_at)
            VALUES
            ($1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, NOW())
            ON CONFLICT (
            date(trans_date AT TIME ZONE 'Africa/Lagos'),
            lower(trim(description)),
            debit,
            credit
            )
            DO NOTHING
            """,
            row["Trans_Date"].to_pydatetime(),
            to_date(row.get("Value_Date")),
            str(row["Description"]),
            float(row["Debit"]),
            float(row["Credit"]),
            float(row["Balance"]) if pd.notna(row.get("Balance")) else None,
            str(row.get("Channel", "")),
            str(row.get("Ref", "")),
            str(row["Category"]),
            str(row["Direction"]),
            float(row["Amount"]),
            int(row["IsRealSpend"]),
            recipient,
        )


async def _upsert_daily_rows(
    daily: pd.DataFrame,
    existing_dates: set[str],
) -> tuple[int, int]:
    """
    Upsert each row from the daily feature matrix into daily_log.
    Returns (new_count, updated_count).
    """
    new_count     = 0
    updated_count = 0

    for _, row in daily.iterrows():
        date_str = str(row["date"].date())
        is_new   = date_str not in existing_dates

        await execute(
            """
            INSERT INTO daily_log (
              date, total_debit, total_credit, num_transactions, max_single,
              p2p_spend, pos_spend, data_spend, savings_out, online_spend,
              family_spend, airtime_spend, discretionary, dow, dom, month,
              is_weekend, high_spend, source, created_at, updated_at
            ) VALUES (
              $1,  $2,  $3,  $4,  $5,
              $6,  $7,  $8,  $9,  $10,
              $11, $12, $13, $14, $15, $16,
              $17, $18, $19, NOW(), NOW()
            )
            ON CONFLICT (date) DO UPDATE SET
              total_debit      = EXCLUDED.total_debit,
              total_credit     = EXCLUDED.total_credit,
              num_transactions = EXCLUDED.num_transactions,
              max_single       = EXCLUDED.max_single,
              p2p_spend        = EXCLUDED.p2p_spend,
              pos_spend        = EXCLUDED.pos_spend,
              data_spend       = EXCLUDED.data_spend,
              savings_out      = EXCLUDED.savings_out,
              online_spend     = EXCLUDED.online_spend,
              family_spend     = EXCLUDED.family_spend,
              airtime_spend    = EXCLUDED.airtime_spend,
              discretionary    = EXCLUDED.discretionary,
              dow              = EXCLUDED.dow,
              dom              = EXCLUDED.dom,
              month            = EXCLUDED.month,
              is_weekend       = EXCLUDED.is_weekend,
              high_spend       = EXCLUDED.high_spend,
              source           = EXCLUDED.source,
              updated_at       = NOW()
            """,
            date_cls.fromisoformat(date_str),
            float(row["total_debit"]),
            float(row["total_credit"]),
            int(row["num_transactions"]),
            float(row["max_single"]),
            float(row.get("p2p_spend",    0)),
            float(row.get("pos_spend",    0)),
            float(row.get("data_spend",   0)),
            float(row.get("savings_out",  0)),
            float(row.get("online_spend", 0)),
            float(row.get("family_spend", 0)),
            float(row.get("airtime_spend",0)),
            float(row.get("discretionary",0)),
            int(row["dow"]),
            int(row["dom"]),
            int(row["month_num"]),
            bool(row["is_weekend"]),
            bool(row["high_spend"]),
            "statement",        # source = statement (not manual)
        )

        if is_new:
            new_count += 1
        else:
            updated_count += 1

    return new_count, updated_count


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/log/upload", response_model=UploadResult)
async def upload_statement(file: UploadFile = File(...)) -> UploadResult:
    """
    Accept an OPay/Zenith account statement (xlsx / xls / csv).

    Pipeline
    ────────
    1. Parse the file into a raw DataFrame.
    2. Run analyze_statement.analyze() → transactions_df, daily_df.
    3. Pull existing transaction keys from statement_transactions.
    4. Remove exact-duplicate transactions (same date + description + amounts).
    5. Bulk-insert the de-duplicated transaction rows.
    6. Upsert daily_log rows (new dates inserted, existing dates updated).
    7. Invalidate relevant caches.
    8. Return an UploadResult summary.
    """
    # ── 1. Read file ──────────────────────────────────────────────────────
    fname = (file.filename or "").lower()
    if not any(fname.endswith(ext) for ext in (".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload .xlsx, .xls, or .csv",
        )

    try:
        df_raw = _read_file(file)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}") from exc

    # ── 2. Analyze ────────────────────────────────────────────────────────
    try:
        transactions_df, daily_df = analyze(df_raw, has_headers=False)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse statement: {exc}",
        ) from exc

    if transactions_df.empty:
        raise HTTPException(status_code=422, detail="No transactions found in file")

    total_rows = len(transactions_df)
    print(f"Parsed {total_rows} transactions from file, dated {transactions_df['Trans_Date'].min().date()} to {transactions_df['Trans_Date'].max().date()}")

    # ── 3. Deduplicate against existing transactions ───────────────────────
    existing_keys     = await _existing_transaction_keys()
    transactions_df["_key"] = transactions_df.apply(_make_txn_key, axis=1)
    duplicates_count  = transactions_df["_key"].isin(existing_keys).sum()
    new_txn_df        = transactions_df[~transactions_df["_key"].isin(existing_keys)].copy()
    new_txn_df        = new_txn_df.drop(columns=["_key"])

    # ── 4. Filter daily_df to only dates that have new transactions ────────
    #
    # We still upsert ALL daily rows derived from the file — even dates that
    # had some transactions already — because the aggregate totals may change
    # now that new transactions for that day exist.
    # Only fully-duplicate days (zero new transactions) are skipped.
    dates_with_new_txns = set(
        str(d.date()) for d in new_txn_df["Trans_Date"].dropna()
    )
    daily_to_upsert = daily_df[
        daily_df["date"].apply(lambda d: str(d.date())).isin(dates_with_new_txns)
    ].copy()

    # ── 5. Insert new transactions ─────────────────────────────────────────
    if not new_txn_df.empty:
        await _bulk_insert_transactions(new_txn_df)

    # ── 6. Upsert daily rows ───────────────────────────────────────────────
    existing_dates             = await _existing_daily_dates()
    new_days, updated_days     = (0, 0)

    if not daily_to_upsert.empty:
        new_days, updated_days = await _upsert_daily_rows(daily_to_upsert, existing_dates)

    # ── 7. Invalidate caches ───────────────────────────────────────────────
    if new_days + updated_days > 0:
        affected_months = {
            f"summary_{row['date'].year}_{row['date'].month}"
            for _, row in daily_to_upsert.iterrows()
        }
        invalidate("dashboard", "prediction", "spend_health", *affected_months)

    # ── 8. Return summary ──────────────────────────────────────────────────
    date_min = str(transactions_df["Trans_Date"].min().date())
    date_max = str(transactions_df["Trans_Date"].max().date())
    high_days = int(daily_to_upsert["high_spend"].sum()) if not daily_to_upsert.empty else 0

    return UploadResult(
        total_rows_in_file=total_rows,
        new_days_inserted=new_days,
        days_updated=updated_days,
        duplicate_transactions_skipped=int(duplicates_count),
        date_range_start=date_min,
        date_range_end=date_max,
        high_spend_days_detected=high_days,
    )