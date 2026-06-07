"""
routers/log_upload.py
─────────────────────
POST /log/upload        — kick off a background parse + insert job, returns job_id
GET  /ws/upload/{job_id} — WebSocket stream of progress events for that job

Deduplication happens at two layers:
  1. Python: hash-check against existing statement_transactions keys (fast, in-memory)
  2. DB:     ON CONFLICT on the unique index (safety net for race conditions)

Progress events (JSON) emitted over the WebSocket:
  { "event": "started",    "total": <int> }
  { "event": "progress",   "phase": "transactions"|"daily", "done": <int>, "total": <int> }
  { "event": "dedup",      "skipped": <int>, "kept": <int> }
  { "event": "complete",   "result": <UploadResult as dict> }
  { "event": "error",      "message": <str> }
"""
from __future__ import annotations

import asyncio
import io
import json
import uuid
from datetime import datetime, date as date_cls
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from analyze_statement import analyze
from cache import invalidate
from routers.utils import execute, fetch_rows

router = APIRouter()

# ─── In-process job registry ─────────────────────────────────────────────────
# Maps job_id → asyncio.Queue of progress event dicts.
# A real production setup would use Redis pub/sub here; for a single-process
# FastAPI app (uvicorn) this is perfectly sufficient.

_job_queues: dict[str, asyncio.Queue] = {}


# ─── Response / event models ──────────────────────────────────────────────────

class UploadJobStarted(BaseModel):
    job_id: str


class UploadResult(BaseModel):
    total_rows_in_file: int
    new_days_inserted: int
    days_updated: int
    duplicate_transactions_skipped: int
    date_range_start: str
    date_range_end: str
    high_spend_days_detected: int


# ─── File reading ─────────────────────────────────────────────────────────────

def _read_file(content: bytes, fname: str) -> pd.DataFrame:
    if fname.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content), header=None)
    xls   = pd.ExcelFile(io.BytesIO(content))
    sheet = (
        "Wallet Account Transactions"
        if "Wallet Account Transactions" in xls.sheet_names
        else xls.sheet_names[0]
    )
    return pd.read_excel(io.BytesIO(content), sheet_name=sheet, header=None)


# ─── Deduplication helpers ────────────────────────────────────────────────────

def _txn_key(row: pd.Series) -> str:
    """
    Canonical deduplication key — must match the DB unique index expression:
        date(trans_date AT TIME ZONE 'Africa/Lagos'), lower(trim(description)), debit, credit
    """
    date_str = str(row["Trans_Date"].date())
    desc     = str(row["Description"]).lower().strip()
    debit    = float(row["Debit"])
    credit   = float(row["Credit"])
    return f"{date_str}|{desc}|{debit:.2f}|{credit:.2f}"


async def _existing_keys() -> set[str]:
    rows = await fetch_rows(
        """
        SELECT date(trans_date AT TIME ZONE 'Africa/Lagos')::text AS d,
               lower(trim(description)) AS desc,
               debit,
               credit
        FROM   statement_transactions
        """
    )
    return {
        f"{r['d']}|{r['desc']}|{float(r['debit']):.2f}|{float(r['credit']):.2f}"
        for r in rows
    }


async def _existing_daily_dates() -> set[str]:
    rows = await fetch_rows("SELECT date::text FROM daily_log")
    return {r["date"] for r in rows}


# ─── Date coercion ────────────────────────────────────────────────────────────

def _to_dt(val: Any):
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    if isinstance(val, (datetime, date_cls)):
        return val
    return pd.to_datetime(val).to_pydatetime()


# ─── Bulk insert — transactions ───────────────────────────────────────────────

async def _insert_transactions(
    df: pd.DataFrame,
    queue: asyncio.Queue,
) -> int:
    """
    Insert rows one by one, emitting progress every 25 rows.
    Returns the number of rows actually inserted (ON CONFLICT DO NOTHING
    means the DB may still skip a tiny number that the Python check missed).
    """
    total   = len(df)
    inserted = 0

    for idx, (_, row) in enumerate(df.iterrows(), start=1):
        rec       = row.get("Recipient")
        recipient = str(rec) if rec and pd.notna(rec) else None

        await execute(
            """
            INSERT INTO statement_transactions
              (trans_date, value_date, description, debit, credit,
               balance, channel, ref, category, direction,
               amount, is_real_spend, recipient, created_at)
            VALUES
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
            ON CONFLICT (
              date(trans_date AT TIME ZONE 'Africa/Lagos'),
              lower(trim(description)),
              debit,
              credit
            ) DO NOTHING
            """,
            row["Trans_Date"].to_pydatetime(),
            _to_dt(row.get("Value_Date")),
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
        inserted += 1

        # Emit progress every 25 rows or on the final row
        if idx % 25 == 0 or idx == total:
            await queue.put({
                "event": "progress",
                "phase": "transactions",
                "done":  idx,
                "total": total,
            })
            # Yield to the event loop so the WS sender can flush
            await asyncio.sleep(0)

    return inserted


# ─── Bulk upsert — daily rows ─────────────────────────────────────────────────

async def _upsert_daily(
    daily: pd.DataFrame,
    existing_dates: set[str],
    queue: asyncio.Queue,
) -> tuple[int, int]:
    total         = len(daily)
    new_count     = 0
    updated_count = 0

    for idx, (_, row) in enumerate(daily.iterrows(), start=1):
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
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW()
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
            float(row.get("p2p_spend",     0)),
            float(row.get("pos_spend",     0)),
            float(row.get("data_spend",    0)),
            float(row.get("savings_out",   0)),
            float(row.get("online_spend",  0)),
            float(row.get("family_spend",  0)),
            float(row.get("airtime_spend", 0)),
            float(row.get("discretionary", 0)),
            int(row["dow"]),
            int(row["dom"]),
            int(row["month_num"]),
            bool(row["is_weekend"]),
            bool(row["high_spend"]),
            "statement",
        )

        if is_new:
            new_count += 1
        else:
            updated_count += 1

        if idx % 10 == 0 or idx == total:
            await queue.put({
                "event": "progress",
                "phase": "daily",
                "done":  idx,
                "total": total,
            })
            await asyncio.sleep(0)

    return new_count, updated_count


# ─── Background job ───────────────────────────────────────────────────────────

async def _run_job(
    job_id: str,
    content: bytes,
    fname: str,
) -> None:
    queue = _job_queues[job_id]

    try:
        # ── Parse ────────────────────────────────────────────────────────
        df_raw = _read_file(content, fname)
        transactions_df, daily_df = analyze(df_raw, has_headers=False)

        if transactions_df.empty:
            await queue.put({"event": "error", "message": "No transactions found in file."})
            return

        total_rows = len(transactions_df)
        await queue.put({"event": "started", "total": total_rows})

        # ── Python-level deduplication ───────────────────────────────────
        existing_keys = await _existing_keys()
        transactions_df["_key"] = transactions_df.apply(_txn_key, axis=1)

        before         = len(transactions_df)
        new_txn_df     = transactions_df[~transactions_df["_key"].isin(existing_keys)].copy()
        new_txn_df     = new_txn_df.drop(columns=["_key"])
        skipped        = before - len(new_txn_df)

        await queue.put({
            "event":   "dedup",
            "skipped": skipped,
            "kept":    len(new_txn_df),
        })

        # ── Only process daily rows for dates that have new transactions ──
        dates_with_new = {str(d.date()) for d in new_txn_df["Trans_Date"].dropna()}
        daily_to_upsert = daily_df[
            daily_df["date"].apply(lambda d: str(d.date())).isin(dates_with_new)
        ].copy()

        # ── Insert transactions ──────────────────────────────────────────
        if not new_txn_df.empty:
            await _insert_transactions(new_txn_df, queue)

        # ── Upsert daily ─────────────────────────────────────────────────
        existing_dates = await _existing_daily_dates()
        new_days, updated_days = 0, 0
        if not daily_to_upsert.empty:
            new_days, updated_days = await _upsert_daily(daily_to_upsert, existing_dates, queue)

        # ── Cache invalidation ───────────────────────────────────────────
        if new_days + updated_days > 0:
            affected = {
                f"summary_{r['date'].year}_{r['date'].month}"
                for _, r in daily_to_upsert.iterrows()
            }
            invalidate("dashboard", "prediction", "spend_health", *affected)

        # ── Complete ─────────────────────────────────────────────────────
        result = UploadResult(
            total_rows_in_file=total_rows,
            new_days_inserted=new_days,
            days_updated=updated_days,
            duplicate_transactions_skipped=skipped,
            date_range_start=str(transactions_df["Trans_Date"].min().date()),
            date_range_end=str(transactions_df["Trans_Date"].max().date()),
            high_spend_days_detected=int(daily_to_upsert["high_spend"].sum()) if not daily_to_upsert.empty else 0,
        )
        await queue.put({"event": "complete", "result": result.model_dump()})

    except Exception as exc:
        await queue.put({"event": "error", "message": str(exc)})

    finally:
        # Give the WS sender a moment to drain, then clean up
        await asyncio.sleep(5)
        _job_queues.pop(job_id, None)


# ─── HTTP: kick off the job ───────────────────────────────────────────────────

@router.post("/log/upload", response_model=UploadJobStarted)
async def upload_statement(file: UploadFile = File(...)) -> UploadJobStarted:
    """
    Accepts the file, validates extension, creates a job queue, fires the
    background task and immediately returns the job_id so the client can
    open a WebSocket to /ws/upload/{job_id}.
    """
    fname = (file.filename or "").lower()
    if not any(fname.endswith(ext) for ext in (".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload .xlsx, .xls, or .csv",
        )

    # Read file bytes synchronously before handing off to background task
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    job_id = str(uuid.uuid4())
    _job_queues[job_id] = asyncio.Queue()

    # Fire and forget — asyncio.create_task schedules it on the running loop
    asyncio.create_task(_run_job(job_id, content, fname))

    return UploadJobStarted(job_id=job_id)


# ─── WebSocket: stream progress ──────────────────────────────────────────────

@router.websocket("/ws/upload/{job_id}")
async def upload_progress_ws(websocket: WebSocket, job_id: str) -> None:
    """
    Stream progress events for a running upload job.

    The client connects immediately after receiving the job_id from POST
    /log/upload.  Events are JSON objects; the stream closes after a
    "complete" or "error" event.
    """
    await websocket.accept()

    queue = _job_queues.get(job_id)
    if queue is None:
        await websocket.send_text(json.dumps({
            "event":   "error",
            "message": f"No job found for id {job_id}. It may have already finished.",
        }))
        await websocket.close()
        return

    try:
        while True:
            # Wait for next event with a 60-second timeout
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({
                    "event":   "error",
                    "message": "Job timed out waiting for progress.",
                }))
                break

            await websocket.send_text(json.dumps(event))

            if event["event"] in ("complete", "error"):
                break

    except WebSocketDisconnect:
        pass  # Client closed early — job continues in background
    finally:
        await websocket.close()