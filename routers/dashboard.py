# Called: app launch, every foreground resume,
#         after POST /log succeeds.
# Cached 5 min. Safe to call on every app focus.
from __future__ import annotations

import asyncio
import calendar
from datetime import date

from fastapi import APIRouter, Request

from cache import TTL_PREDICTION, TTL_ROLLING, get_cached
from models import DailyBar, DashboardResponse, RecentTransaction, SpendHealth
from routers.prediction import _fetch_prediction
from routers.utils import COMBINED_CTE, DAY_LABELS, as_float, as_int, fetch_row, fetch_rows, pct_change, truncate_description

router = APIRouter()


async def _fetch_month_totals() -> tuple[float, float, str]:
    row = await fetch_row(
        """
        SELECT
          COALESCE(SUM(debit) FILTER (WHERE DATE_TRUNC('month', trans_date) = DATE_TRUNC('month', NOW())), 0) AS current_total,
          COALESCE(SUM(debit) FILTER (
            WHERE DATE_TRUNC('month', trans_date) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          ), 0) AS previous_total,
          TO_CHAR(NOW(), 'FMMonth YYYY') AS month_label
        FROM transactions
        WHERE category NOT IN ('Savings', 'Bank Charges')
        """
    )
    if row is None:
        return 0.0, 0.0, date.today().strftime("%B %Y").upper()
    return as_float(row["current_total"]), as_float(row["previous_total"]), str(row["month_label"]).upper()


async def _fetch_daily_stats() -> tuple[float, int]:
    row = await fetch_row(
        f"""
        {COMBINED_CTE}
        SELECT COALESCE(AVG(total_debit), 0) AS avg_daily,
               COALESCE(SUM(CASE WHEN high_spend THEN 1 ELSE 0 END), 0) AS high_spend_days
        FROM combined
        WHERE month = EXTRACT(MONTH FROM NOW())::int
          AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
        """
    )
    if row is None:
        return 0.0, 0
    return as_float(row["avg_daily"]), as_int(row["high_spend_days"])


async def _fetch_seven_day_bars() -> list[DailyBar]:
    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT date::text AS date, total_debit, high_spend, dow
        FROM combined
        ORDER BY date DESC
        LIMIT 7
        """
    )
    bars = [
        DailyBar(
            date=str(row["date"]),
            total_debit=as_float(row["total_debit"]),
            is_high_spend=bool(row["high_spend"]),
            day_label=DAY_LABELS[as_int(row["dow"])] if 0 <= as_int(row["dow"]) < len(DAY_LABELS) else "",
        )
        for row in rows
    ]
    return sorted(bars, key=lambda bar: bar.date)


async def _fetch_spend_health(total_current: float, total_previous: float) -> SpendHealth:
    today = date.today()
    days_elapsed = max(today.day, 1)
    days_last_month = calendar.monthrange(today.year if today.month > 1 else today.year - 1, today.month - 1 or 12)[1]
    current_rate = total_current / days_elapsed if days_elapsed else 0.0
    previous_rate = total_previous / days_last_month if days_last_month else 0.0
    if previous_rate == 0:
        pace = "On Track"
    elif current_rate > previous_rate * 1.1:
        pace = "Ahead"
    elif current_rate >= previous_rate * 0.9:
        pace = "On Track"
    else:
        pace = "Over"

    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT date::text AS date, high_spend
        FROM combined
        WHERE date <= CURRENT_DATE
        ORDER BY date DESC
        """
    )
    streak_days = 0
    for row in rows:
        if bool(row["high_spend"]):
            break
        streak_days += 1

    saved = await fetch_row(
        f"""
        {COMBINED_CTE}
        SELECT COALESCE(SUM(savings_out), 0) AS saved_this_month
        FROM combined
        WHERE month = EXTRACT(MONTH FROM NOW())::int
          AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
        """
    )
    return SpendHealth(pace=pace, streak_days=streak_days, saved_this_month=as_float(saved["saved_this_month"] if saved else 0))


async def _fetch_recent_transactions() -> list[RecentTransaction]:
    rows = await fetch_rows(
        """
        SELECT trans_date, description, category, debit, credit
        FROM transactions
        ORDER BY trans_date DESC
        LIMIT 5
        """
    )
    return [
        RecentTransaction(
            trans_date=row["trans_date"].isoformat(timespec="seconds") if hasattr(row["trans_date"], "isoformat") else str(row["trans_date"]),
            description=truncate_description(str(row["description"] or "")),
            category=str(row["category"] or ""),
            debit=as_float(row["debit"]),
            credit=as_float(row["credit"]),
        )
        for row in rows
    ]


async def _fetch_dashboard(request: Request) -> DashboardResponse:
    month_totals_task = _fetch_month_totals()
    daily_stats_task = _fetch_daily_stats()
    seven_day_task = _fetch_seven_day_bars()
    recent_task = _fetch_recent_transactions()

    (total_current, total_previous, month_label), (avg_daily, high_days), seven_day_bars, recent_transactions = await asyncio.gather(
        month_totals_task,
        daily_stats_task,
        seven_day_task,
        recent_task,
    )
    spend_health, prediction = await asyncio.gather(
        _fetch_spend_health(total_current, total_previous),
        get_cached("prediction", TTL_PREDICTION, lambda: _fetch_prediction(request)),
    )

    return DashboardResponse(
        total_spent_this_month=total_current,
        month_label=month_label,
        pct_change_vs_last_month=pct_change(total_current, total_previous),
        avg_daily=avg_daily,
        high_spend_days=high_days,
        prediction_risk=prediction.risk_level,
        prediction_prob=prediction.probability,
        seven_day_bars=seven_day_bars,
        spend_health=spend_health,
        recent_transactions=recent_transactions,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(request: Request) -> DashboardResponse:
    return await get_cached("dashboard", TTL_ROLLING, lambda: _fetch_dashboard(request))
