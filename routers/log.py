# Called: when user opens Spending Log screen.
# NOT cached — always fresh.
# Called: when user taps Save on Log Spend screen.
# Invalidates dashboard + prediction + summary caches.
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, HTTPException, Path

from cache import invalidate
from config import HIGH_SPEND_THRESHOLD
from models import DeleteLogResponse, LogEntry, LogListItem, LogWriteRequest
from routers.utils import as_float, execute, fetch_row, fetch_rows

router = APIRouter()


SPEND_FIELDS = [
    "p2p_spend",
    "pos_spend",
    "data_spend",
    "airtime_spend",
    "food_spend",
    "online_spend",
    "family_spend",
    "electricity_spend",
    "subscription_spend",
    "loan_spend",
    "other_spend",
    "savings_out",
]


def _entry_from_row(row) -> LogEntry:
    return LogEntry(
        date=str(row["date"]),
        total_debit=as_float(row["total_debit"]),
        total_credit=as_float(row["total_credit"]),
        p2p_spend=as_float(row["p2p_spend"]),
        pos_spend=as_float(row["pos_spend"]),
        data_spend=as_float(row["data_spend"]),
        airtime_spend=as_float(row["airtime_spend"]),
        online_spend=as_float(row["online_spend"]),
        family_spend=as_float(row["family_spend"]),
        savings_out=as_float(row["savings_out"]),
        high_spend=bool(row["high_spend"]),
        source=str(row["source"] or "manual"),
    )


async def _fetch_log_list() -> list[LogListItem]:
    rows = await fetch_rows(
        """
        SELECT date::text AS date, total_debit, high_spend, p2p_spend,
               pos_spend, data_spend, airtime_spend
        FROM daily_log
        ORDER BY date DESC
        """
    )
    return [
        LogListItem(
            date=str(row["date"]),
            total_debit=as_float(row["total_debit"]),
            high_spend=bool(row["high_spend"]),
            p2p_spend=as_float(row["p2p_spend"]),
            pos_spend=as_float(row["pos_spend"]),
            data_spend=as_float(row["data_spend"]),
            airtime_spend=as_float(row["airtime_spend"]),
        )
        for row in rows
    ]


async def _fetch_log_entry(date_str: str) -> LogEntry:
    row = await fetch_row("SELECT * FROM daily_log WHERE date = $1", date_cls.fromisoformat(date_str))
    if row is None:
        raise HTTPException(status_code=404, detail="No entry for date")
    return _entry_from_row(row)


def _derive_log_values(request: LogWriteRequest) -> dict:
    entry_date = date_cls.fromisoformat(request.date)
    spend_values = [float(getattr(request, field)) for field in SPEND_FIELDS]
    total_debit = sum(spend_values)
    dow = entry_date.weekday()
    return {
        "date": entry_date,
        "total_debit": total_debit,
        "total_credit": request.total_credit,
        "num_transactions": sum(1 for value in spend_values if value > 0.0),
        "max_single": max(spend_values) if spend_values else 0.0,
        "p2p_spend": request.p2p_spend,
        "pos_spend": request.pos_spend,
        "data_spend": request.data_spend,
        "savings_out": request.savings_out,
        "online_spend": request.online_spend,
        "family_spend": request.family_spend,
        "airtime_spend": request.airtime_spend,
        "discretionary": request.p2p_spend + request.pos_spend + request.online_spend,
        "dow": dow,
        "dom": entry_date.day,
        "month": entry_date.month,
        "is_weekend": dow >= 5,
        "high_spend": total_debit > HIGH_SPEND_THRESHOLD,
        "source": "manual",
    }


async def _write_log_entry(request: LogWriteRequest) -> LogEntry:
    values = _derive_log_values(request)
    await execute(
        """
        INSERT INTO daily_log (
          date, total_debit, total_credit, num_transactions, max_single,
          p2p_spend, pos_spend, data_spend, savings_out, online_spend,
          family_spend, airtime_spend, discretionary, dow, dom, month,
          is_weekend, high_spend, source, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16,
          $17, $18, $19, NOW(), NOW()
        )
        ON CONFLICT (date) DO UPDATE SET
          total_debit = EXCLUDED.total_debit,
          total_credit = EXCLUDED.total_credit,
          num_transactions = EXCLUDED.num_transactions,
          max_single = EXCLUDED.max_single,
          p2p_spend = EXCLUDED.p2p_spend,
          pos_spend = EXCLUDED.pos_spend,
          data_spend = EXCLUDED.data_spend,
          savings_out = EXCLUDED.savings_out,
          online_spend = EXCLUDED.online_spend,
          family_spend = EXCLUDED.family_spend,
          airtime_spend = EXCLUDED.airtime_spend,
          discretionary = EXCLUDED.discretionary,
          dow = EXCLUDED.dow,
          dom = EXCLUDED.dom,
          month = EXCLUDED.month,
          is_weekend = EXCLUDED.is_weekend,
          high_spend = EXCLUDED.high_spend,
          source = EXCLUDED.source,
          updated_at = NOW()
        """,
        values["date"],
        values["total_debit"],
        values["total_credit"],
        values["num_transactions"],
        values["max_single"],
        values["p2p_spend"],
        values["pos_spend"],
        values["data_spend"],
        values["savings_out"],
        values["online_spend"],
        values["family_spend"],
        values["airtime_spend"],
        values["discretionary"],
        values["dow"],
        values["dom"],
        values["month"],
        values["is_weekend"],
        values["high_spend"],
        values["source"],
    )
    y = values["date"].year
    m = values["date"].month
    invalidate("dashboard", "prediction", "spend_health", f"summary_{y}_{m}")
    return await _fetch_log_entry(request.date)


async def _delete_log_entry(date_str: str) -> DeleteLogResponse:
    entry_date = date_cls.fromisoformat(date_str)
    status = await execute("DELETE FROM daily_log WHERE date = $1", entry_date)
    deleted_count = int(status.split()[-1]) if status else 0
    if deleted_count == 0:
        raise HTTPException(status_code=404, detail="No entry for date")
    invalidate("dashboard", "prediction", f"summary_{entry_date.year}_{entry_date.month}")
    return DeleteLogResponse(deleted=True, date=date_str)


@router.get("/log", response_model=list[LogListItem])
async def get_log() -> list[LogListItem]:
    return await _fetch_log_list()


@router.get("/log/{date}", response_model=LogEntry)
async def get_log_entry(date: str = Path(...)) -> LogEntry:
    return await _fetch_log_entry(date)


@router.post("/log", response_model=LogEntry)
async def post_log(request: LogWriteRequest) -> LogEntry:
    return await _write_log_entry(request)


@router.delete("/log/{date}", response_model=DeleteLogResponse)
async def delete_log_entry(date: str = Path(...)) -> DeleteLogResponse:
    return await _delete_log_entry(date)
