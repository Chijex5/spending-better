# routers/explore.py
from __future__ import annotations

import calendar
from datetime import date
from typing import Any

import pandas as pd
from fastapi import APIRouter, Query, Request

from cache import TTL_PREDICTION, get_cached
import config
from models import (
    DailyCell,
    DayTransaction,
    ExploreMonth,
    ExploreMonthsResponse,
    ExploreSummaryResponse,
    WeekBreakdown,
)
from routers.utils import as_float, combined_dataframe

router = APIRouter()

# ─── Category classifier ──────────────────────────────────────────────────────

_CATEGORY_COLS: list[tuple[str, str]] = [
    ("p2p_spend",     "Person-to-Person"),
    ("pos_spend",     "POS Purchase"),
    ("data_spend",    "Data"),
    ("airtime_spend", "Airtime"),
    ("online_spend",  "Online Payment"),
    ("family_spend",  "Person-to-Person"),
]


def _classify_category(row: dict[str, Any]) -> str:
    best_cat, best_val = "Other", 0.0
    for col, cat in _CATEGORY_COLS:
        val = as_float(row.get(col, 0))
        if val > best_val:
            best_val, best_cat = val, cat
    return best_cat


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _risk(total: float, threshold: float) -> str:
    if total > threshold * 1.5:
        return "HIGH"
    if total > threshold * 0.7:
        return "MEDIUM"
    return "LOW"


def _fmt_day(d: date) -> str:
    """'5 Jun' — avoids %-d which is Linux-only."""
    return f"{d.day} {d.strftime('%b')}"


def _week_ranges(year: int, month: int) -> list[tuple[int, str, date, date]]:
    _, days_in_month = calendar.monthrange(year, month)
    weeks: list[tuple[int, str, date, date]] = []
    week_num, day = 1, 1
    while day <= days_in_month:
        start    = date(year, month, day)
        end_day  = min(day + 6, days_in_month)
        end      = date(year, month, end_day)
        label    = f"{start.strftime('%b')} {start.day}–{end_day}"
        weeks.append((week_num, label, start, end))
        week_num += 1
        day      += 7
    return weeks


def _describe(col: str) -> str:
    return {
        "p2p_spend":     "Person-to-person transfers",
        "pos_spend":     "POS purchases",
        "data_spend":    "Data bundle spend",
        "airtime_spend": "Airtime recharge",
        "online_spend":  "Online payments",
        "family_spend":  "Family transfers",
        "savings_out":   "Moved to savings",
    }.get(col, col.replace("_", " ").title())


# ─── Main builder ─────────────────────────────────────────────────────────────

def _build_summary(df: pd.DataFrame, year: int, month: int) -> ExploreSummaryResponse:
    today = date.today()
    _, days_in_month = calendar.monthrange(year, month)

    # ── Coerce date column to datetime64 so .dt accessor always works ──────────
    # combined_dataframe() may return plain Python date objects or strings;
    # pd.to_datetime handles both safely.
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])

    # ── Filter to requested month ──────────────────────────────────────────────
    month_mask = (df["date"].dt.year == year) & (df["date"].dt.month == month)
    mdf = df[month_mask].copy().sort_values("date")

    # ── Previous month ─────────────────────────────────────────────────────────
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    prev_mask = (df["date"].dt.year == prev_year) & (df["date"].dt.month == prev_month)
    prev_df   = df[prev_mask]

    real_spend     = as_float(mdf["total_debit"].sum())
    previous_spend = as_float(prev_df["total_debit"].sum())
    credits        = as_float(mdf["total_credit"].sum())
    budget = (
        float(config.MONTHLY_BUDGET)
        if config.MONTHLY_BUDGET is not None and config.MONTHLY_BUDGET > 0
        else float(config.HIGH_SPEND_THRESHOLD * days_in_month)
        if config.HIGH_SPEND_THRESHOLD
        else real_spend * 1.3
    )

    is_current_month = (year == today.year and month == today.month)
    if is_current_month:
        to_date_mask  = mdf["date"].dt.date <= today
        spend_to_date = as_float(mdf[to_date_mask]["total_debit"].sum())
    else:
        spend_to_date = real_spend

    daily_threshold = budget / days_in_month if days_in_month else 1.0

    # ── Daily cells ────────────────────────────────────────────────────────────
    daily_map: dict[int, float] = {
        int(row["date"].day): as_float(row["total_debit"])
        for _, row in mdf.iterrows()
    }
    daily: list[DailyCell] = [
        DailyCell(
            day=d,
            date=_fmt_day(date(year, month, d)),
            total=daily_map.get(d, 0.0),
            is_today=(is_current_month and d == today.day),
            risk=_risk(daily_map.get(d, 0.0), daily_threshold),
        )
        for d in range(1, days_in_month + 1)
    ]

    # ── Weekly breakdown ───────────────────────────────────────────────────────
    weekly: list[WeekBreakdown] = []
    for wnum, label, wstart, wend in _week_ranges(year, month):
        wmask = (mdf["date"].dt.date >= wstart) & (mdf["date"].dt.date <= wend)
        wdf   = mdf[wmask]
        txns  = int(wdf["num_transactions"].sum()) if "num_transactions" in wdf.columns else len(wdf)
        weekly.append(WeekBreakdown(
            week=wnum,
            range=label,
            spend=as_float(wdf["total_debit"].sum()),
            txns=txns,
        ))

    # ── 7-day windows ──────────────────────────────────────────────────────────
    all_dates = sorted(mdf["date"].dt.date.unique())
    if len(all_dates) >= 7:
        last7_set = set(all_dates[-7:])
        prev7_set = set(all_dates[-14:-7]) if len(all_dates) >= 14 else set(all_dates[:-7])
    else:
        last7_set = set(all_dates)
        prev7_set = set()

    last7 = as_float(mdf[mdf["date"].dt.date.isin(last7_set)]["total_debit"].sum())
    prev7 = (
        as_float(mdf[mdf["date"].dt.date.isin(prev7_set)]["total_debit"].sum())
        if prev7_set
        else previous_spend / 4
    )

    # ── Day transactions (one row per non-zero category per daily_log entry) ───
    day_transactions: list[DayTransaction] = []
    for _, row in mdf.iterrows():
        row_date = row["date"].date()
        date_str = _fmt_day(row_date)
        dow_str  = row_date.strftime("%a")
        tx_base  = row_date.strftime("%Y%m%d")

        for col, cat in _CATEGORY_COLS:
            val = as_float(row.get(col, 0))
            if val <= 0:
                continue
            day_transactions.append(DayTransaction(
                id=f"{tx_base}-{col}",
                description=_describe(col),
                category=cat,
                date=date_str,
                day=dow_str,
                time="",
                amount=-val,
            ))

        credit_val = as_float(row.get("total_credit", 0))
        if credit_val > 0:
            day_transactions.append(DayTransaction(
                id=f"{tx_base}-credit",
                description="Incoming transfer / credit",
                category="Other",
                date=date_str,
                day=dow_str,
                time="",
                amount=credit_val,
            ))

    return ExploreSummaryResponse(
        year=year,
        month=month,
        month_label=date(year, month, 1).strftime("%B %Y").upper(),
        real_spend=real_spend,
        previous_spend=previous_spend,
        credits=credits,
        budget=budget,
        spend_to_date=spend_to_date,
        daily_pace_reference=daily_threshold,
        weekly=weekly,
        daily=daily,
        day_transactions=day_transactions,
        previous7=prev7,
        last7=last7,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/explore/months", response_model=ExploreMonthsResponse)
async def get_available_months(request: Request) -> ExploreMonthsResponse:
    async def _fetch() -> ExploreMonthsResponse:
        df = await combined_dataframe()
        if df.empty:
            return ExploreMonthsResponse(months=[])

        # Coerce here too so groupby works regardless of column type
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])

        months_df = (
            df.groupby([df["date"].dt.year.rename("year"), df["date"].dt.month.rename("month")])
            .size()
            .reset_index(name="count")
            .sort_values(["year", "month"], ascending=False)
        )
        months = [
            ExploreMonth(
                year=int(row["year"]),
                month=int(row["month"]),
                label=date(int(row["year"]), int(row["month"]), 1).strftime("%B %Y").upper(),
            )
            for _, row in months_df.iterrows()
        ]
        return ExploreMonthsResponse(months=months)
    cache = await get_cached("explore_months", TTL_PREDICTION, _fetch)
    return cache


@router.get("/explore/summary", response_model=ExploreSummaryResponse)
async def get_explore_summary(
    request: Request,
    year:  int = Query(..., description="4-digit year"),
    month: int = Query(..., ge=1, le=12),
) -> ExploreSummaryResponse:
    cache_key = f"explore_summary_{year}_{month}"

    async def _fetch() -> ExploreSummaryResponse:
        df = await combined_dataframe()
        if df.empty:
            return _empty_summary(year, month)
        return _build_summary(df, year, month)
    cache = await get_cached(cache_key, TTL_PREDICTION, _fetch)
    return cache


def _empty_summary(year: int, month: int) -> ExploreSummaryResponse:
    return ExploreSummaryResponse(
        year=year, month=month,
        month_label=date(year, month, 1).strftime("%B %Y").upper(),
        real_spend=0, previous_spend=0, credits=0,
        budget=0, spend_to_date=0, daily_pace_reference=0,
        weekly=[], daily=[], day_transactions=[],
        previous7=0, last7=0,
    )