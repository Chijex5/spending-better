from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

import asyncpg
import pandas as pd
from fastapi import HTTPException

from database import get_pool

DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONEY_FEATURES = {
    "rolling_7d_avg",
    "prev_day_spend",
    "rolling_14d_avg",
    "max_single",
    "discretionary",
    "total_credit",
    "savings_out",
    "p2p_spend",
    "pos_spend",
    "data_spend",
    "airtime_spend",
    "online_spend",
    "family_spend",
}

COMBINED_CTE = """
WITH combined AS (
  SELECT date, total_debit, total_credit,
         num_transactions, max_single, p2p_spend,
         pos_spend, data_spend, savings_out,
         online_spend, family_spend, airtime_spend,
         discretionary, dow, dom, month, is_weekend,
         rolling_7d_avg, rolling_14d_avg,
         prev_day_spend, prev_week_same_day, high_spend
  FROM daily_log
  UNION ALL
  SELECT date, total_debit, total_credit,
         num_transactions, max_single, p2p_spend,
         pos_spend, data_spend, savings_out,
         online_spend, family_spend, airtime_spend,
         discretionary, dow, dom, month, is_weekend,
         rolling_7d_avg, rolling_14d_avg,
         prev_day_spend, prev_week_same_day, high_spend
  FROM all_daily ad
  WHERE NOT EXISTS (
    SELECT 1 FROM daily_log dl WHERE dl.date = ad.date
  )
)
"""


def as_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def as_int(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def iso_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return ((current - previous) / previous) * 100


def risk_from_probability(probability: float) -> str:
    if probability >= 0.70:
        return "HIGH"
    if probability >= 0.40:
        return "MEDIUM"
    return "LOW"


def truncate_description(description: str, limit: int = 40) -> str:
    if len(description) <= limit:
        return description
    return description[: limit - 1].rstrip() + "…"


async def fetch_rows(sql: str, *args: Any) -> list[Any]:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return list(await conn.fetch(sql, *args))
    except asyncpg.PostgresError as exc:
        print(f"Database error: {exc}")
        raise HTTPException(status_code=500, detail="Database error") from exc


async def fetch_row(sql: str, *args: Any) -> Any:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await conn.fetchrow(sql, *args)
    except asyncpg.PostgresError as exc:
        print(f"Database error: {exc}")
        raise HTTPException(status_code=500, detail="Database error") from exc


async def fetch_value(sql: str, *args: Any) -> Any:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(sql, *args)
    except asyncpg.PostgresError as exc:
        print(f"Database error: {exc}")
        raise HTTPException(status_code=500, detail="Database error") from exc


async def execute(sql: str, *args: Any) -> str:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await conn.execute(sql, *args)
    except asyncpg.PostgresError as exc:
        print(f"Database error: {exc}")
        raise HTTPException(status_code=500, detail="Database error") from exc


async def combined_dataframe() -> pd.DataFrame:
    rows = await fetch_rows(f"{COMBINED_CTE} SELECT * FROM combined ORDER BY date ASC")
    return pd.DataFrame([dict(row) for row in rows])


def mean(values: Iterable[float]) -> float:
    numbers = list(values)
    if not numbers:
        return 0.0
    return sum(numbers) / len(numbers)
