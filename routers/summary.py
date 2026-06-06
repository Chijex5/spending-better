# Called: when user opens Monthly Summary screen,
#         on month swipe left/right.
# Past months cached 1hr. Current month cached 5min.
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Path

from cache import TTL_HISTORICAL, TTL_ROLLING, get_cached
from config import HIGH_SPEND_THRESHOLD
from models import CalendarDay, KeyStats, SummaryResponse, WeekComparison, WeeklyBucket
from routers.utils import COMBINED_CTE, as_float, as_int, fetch_row, fetch_rows, pct_change

router = APIRouter()


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    days = calendar.monthrange(year, month)[1]
    return start, date(year, month, days)


def _previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _format_range(start: date, end: date) -> str:
    if start.month == end.month:
        return f"{start.strftime('%b')} {start.day}–{end.day}"
    return f"{start.strftime('%b')} {start.day}–{end.strftime('%b')} {end.day}"


async def _fetch_real_spend(year: int, month: int) -> tuple[float, float]:
    prev_year, prev_month = _previous_month(year, month)
    row = await fetch_row(
        """
        SELECT
          COALESCE(SUM(debit) FILTER (WHERE EXTRACT(YEAR FROM trans_date) = $1 AND EXTRACT(MONTH FROM trans_date) = $2), 0) AS current_total,
          COALESCE(SUM(debit) FILTER (WHERE EXTRACT(YEAR FROM trans_date) = $3 AND EXTRACT(MONTH FROM trans_date) = $4), 0) AS previous_total
        FROM transactions
        WHERE category NOT IN ('Savings', 'Bank Charges')
        """,
        year,
        month,
        prev_year,
        prev_month,
    )
    if row is None:
        return 0.0, 0.0
    return as_float(row["current_total"]), as_float(row["previous_total"])


async def _fetch_budget_limit() -> float:
    columns = await fetch_rows(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
        """
    )
    available = {str(row["column_name"]) for row in columns}
    for column in ("budget_limit", "daily_threshold", "high_spend_threshold", "monthly_budget"):
        if column in available:
            row = await fetch_row(f"SELECT COALESCE(MAX({column}), 0) AS budget_limit FROM settings")
            return as_float(row["budget_limit"] if row else 0)
    return 0.0


async def _fetch_month_daily_rows(year: int, month: int) -> list:
    return await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT date, date::text AS date_text, total_debit, total_credit, num_transactions, high_spend
        FROM combined
        WHERE EXTRACT(YEAR FROM date) = $1 AND month = $2
        ORDER BY date ASC
        """,
        year,
        month,
    )


async def _fetch_week_comparison() -> WeekComparison:
    row = await fetch_row(
        f"""
        {COMBINED_CTE}
        SELECT
          COALESCE(SUM(total_debit) FILTER (WHERE date > CURRENT_DATE - INTERVAL '7 days' AND date <= CURRENT_DATE), 0) AS last_7_total,
          COALESCE(SUM(total_debit) FILTER (WHERE date > CURRENT_DATE - INTERVAL '14 days' AND date <= CURRENT_DATE - INTERVAL '7 days'), 0) AS prev_7_total
        FROM combined
        """
    )
    last_7 = as_float(row["last_7_total"] if row else 0)
    prev_7 = as_float(row["prev_7_total"] if row else 0)
    return WeekComparison(last_7_total=last_7, prev_7_total=prev_7, pct_change=pct_change(last_7, prev_7))


def _weekly_buckets(rows: list, year: int, month: int) -> list[WeeklyBucket]:
    if not rows:
        return []
    buckets: dict[int, dict[str, object]] = defaultdict(lambda: {"dates": [], "total": 0.0, "count": 0})
    for row in rows:
        row_date = row["date"]
        week_number = ((row_date.day + date(year, month, 1).weekday() - 1) // 7) + 1
        buckets[week_number]["dates"].append(row_date)
        buckets[week_number]["total"] = as_float(buckets[week_number]["total"]) + as_float(row["total_debit"])
        buckets[week_number]["count"] = as_int(buckets[week_number]["count"]) + as_int(row["num_transactions"])

    result = []
    for week_number in sorted(buckets):
        dates = buckets[week_number]["dates"]
        result.append(WeeklyBucket(
            week_number=week_number,
            date_range=_format_range(min(dates), max(dates)),
            total_debit=as_float(buckets[week_number]["total"]),
            transaction_count=as_int(buckets[week_number]["count"]),
        ))
    return result


def _key_stats(rows: list) -> KeyStats:
    if not rows:
        return KeyStats(avg_daily=0.0, peak_day_amount=0.0, peak_day_date="", lowest_day_amount=0.0, lowest_day_date="", high_spend_days=0, total_days=0, total_credits=0.0, net_flow=0.0)
    total_debits = [as_float(row["total_debit"]) for row in rows]
    peak = max(rows, key=lambda row: as_float(row["total_debit"]))
    positive = [row for row in rows if as_float(row["total_debit"]) > 0]
    lowest = min(positive, key=lambda row: as_float(row["total_debit"])) if positive else peak
    total_credit = sum(as_float(row["total_credit"]) for row in rows)
    total_debit = sum(total_debits)
    return KeyStats(
        avg_daily=total_debit / len(rows),
        peak_day_amount=as_float(peak["total_debit"]),
        peak_day_date=str(peak["date_text"]),
        lowest_day_amount=as_float(lowest["total_debit"]),
        lowest_day_date=str(lowest["date_text"]),
        high_spend_days=sum(1 for row in rows if bool(row["high_spend"])),
        total_days=len(rows),
        total_credits=total_credit,
        net_flow=total_credit - total_debit,
    )


def _calendar_days(rows: list, year: int, month: int) -> list[CalendarDay]:
    by_date = {row["date"]: row for row in rows}
    start, end = _month_bounds(year, month)
    days = []
    current = start
    while current <= end:
        row = by_date.get(current)
        if row is None:
            days.append(CalendarDay(date=current.isoformat(), total_debit=0.0, level=0))
        else:
            amount = as_float(row["total_debit"])
            if amount == 0:
                level = 1
            elif amount < HIGH_SPEND_THRESHOLD * 0.5:
                level = 2
            elif amount < HIGH_SPEND_THRESHOLD:
                level = 3
            elif amount < HIGH_SPEND_THRESHOLD * 2:
                level = 4
            else:
                level = 5
            days.append(CalendarDay(date=current.isoformat(), total_debit=amount, level=level))
        current += timedelta(days=1)
    return days


def _over_under_pace(total_real_spend: float, year: int, month: int) -> float:
    today = date.today()
    if today.year != year or today.month != month:
        return 0.0
    _, end = _month_bounds(year, month)
    projected = (total_real_spend / max(today.day, 1)) * end.day
    return projected - total_real_spend


async def _fetch_summary(year: int, month: int) -> SummaryResponse:
    total_real_spend, previous_total = await _fetch_real_spend(year, month)
    rows = await _fetch_month_daily_rows(year, month)
    budget_limit = await _fetch_budget_limit()
    week_comparison = await _fetch_week_comparison()
    month_label = date(year, month, 1).strftime("%B %Y")

    return SummaryResponse(
        month_label=month_label,
        year=year,
        month=month,
        total_real_spend=total_real_spend,
        pct_change_vs_prev_month=pct_change(total_real_spend, previous_total),
        over_under_pace=_over_under_pace(total_real_spend, year, month),
        budget_limit=budget_limit,
        weekly_buckets=_weekly_buckets(rows, year, month),
        key_stats=_key_stats(rows),
        week_comparison=week_comparison,
        calendar_days=_calendar_days(rows, year, month),
    )


@router.get("/summary/{year}/{month}", response_model=SummaryResponse)
async def get_summary(year: int = Path(...), month: int = Path(..., ge=1, le=12)) -> SummaryResponse:
    today = date.today()
    ttl = TTL_ROLLING if today.year == year and today.month == month else TTL_HISTORICAL
    return await get_cached(f"summary_{year}_{month}", ttl, lambda: _fetch_summary(year, month))
