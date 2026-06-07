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


async def _fetch_streak_and_saved() -> dict:
    """
    Single query replacing the two sequential DB calls that were inside
    _fetch_spend_health. Streak is computed set-wise in Postgres instead
    of fetching all rows into Python and looping.
    """
    row = await fetch_row(
        f"""
        {COMBINED_CTE},
        streak AS (
            SELECT COALESCE(
                MIN(grp.pos) - 1,
                COUNT(*)
            ) AS streak_days
            FROM (
                SELECT
                    ROW_NUMBER() OVER (ORDER BY date DESC) AS pos,
                    high_spend
                FROM combined
                WHERE date <= CURRENT_DATE
            ) grp
            WHERE grp.high_spend = TRUE
        ),
        saved AS (
            SELECT COALESCE(SUM(savings_out), 0) AS saved_this_month
            FROM combined
            WHERE month = EXTRACT(MONTH FROM NOW())::int
              AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
        )
        SELECT
            (SELECT streak_days FROM streak)       AS streak_days,
            (SELECT saved_this_month FROM saved)   AS saved_this_month
        """
    )
    return {
        "streak_days": as_int(row["streak_days"] if row else 0),
        "saved_this_month": as_float(row["saved_this_month"] if row else 0.0),
    }


def _build_spend_health(
    total_current: float,
    total_previous: float,
    today: date,
    streak_days: int,
    saved_this_month: float,
) -> SpendHealth:
    """Pure Python — no DB calls. Called after all queries resolve."""
    days_elapsed = max(today.day, 1)
    days_last_month = calendar.monthrange(
        today.year if today.month > 1 else today.year - 1,
        today.month - 1 or 12,
    )[1]
    current_rate = total_current / days_elapsed
    previous_rate = total_previous / days_last_month if days_last_month else 0.0

    if previous_rate == 0:
        pace = "On Track"
    elif current_rate > previous_rate * 1.1:
        pace = "Ahead"
    elif current_rate >= previous_rate * 0.9:
        pace = "On Track"
    else:
        pace = "Over"

    return SpendHealth(
        pace=pace,
        streak_days=streak_days,
        saved_this_month=saved_this_month,
    )


async def _fetch_dashboard(request: Request) -> DashboardResponse:
    today = date.today()

    # All 6 DB calls fire simultaneously — total latency = slowest single query.
    # Previously: gather1 finished → gather2 started → spend_health ran 2 more
    # serial queries inside. That was 3 sequential round-trips minimum.
    (
        (total_current, total_previous, month_label),
        (avg_daily, high_days),
        seven_day_bars,
        recent_transactions,
        streak_and_saved,
        prediction,
    ) = await asyncio.gather(
        _fetch_month_totals(),
        _fetch_daily_stats(),
        _fetch_seven_day_bars(),
        _fetch_recent_transactions(),
        _fetch_streak_and_saved(),
        get_cached("prediction", TTL_PREDICTION, lambda: _fetch_prediction(request)),
    )

    spend_health = _build_spend_health(
        total_current,
        total_previous,
        today,
        streak_and_saved["streak_days"],
        streak_and_saved["saved_this_month"],
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