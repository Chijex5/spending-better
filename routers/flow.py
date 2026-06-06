# Called: when user opens Flow & Velocity screen.
# Cached 1hr.
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter

from cache import TTL_HISTORICAL, get_cached
from models import FlowResponse, NetFlowMonth, RecurringTransfer, VelocityPoint
from routers.utils import COMBINED_CTE, as_float, fetch_rows, mean

router = APIRouter()


async def _fetch_monthly_net_flows() -> list[NetFlowMonth]:
    rows = await fetch_rows(
        """
        SELECT TO_CHAR(DATE_TRUNC('month', trans_date), 'Mon YYYY') AS month_label,
               COALESCE(SUM(credit), 0) AS total_credits,
               COALESCE(SUM(CASE WHEN category NOT IN ('Savings', 'Bank Charges') THEN debit ELSE 0 END), 0) AS total_debits
        FROM transactions
        GROUP BY DATE_TRUNC('month', trans_date)
        ORDER BY DATE_TRUNC('month', trans_date) ASC
        """
    )
    return [
        NetFlowMonth(
            month_label=str(row["month_label"] or ""),
            total_credits=as_float(row["total_credits"]),
            total_debits=as_float(row["total_debits"]),
            net=as_float(row["total_credits"]) - as_float(row["total_debits"]),
        )
        for row in rows
    ]


async def _fetch_velocity_points() -> list[VelocityPoint]:
    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT date::text AS date, rolling_7d_avg, rolling_14d_avg
        FROM combined
        ORDER BY date ASC
        """
    )
    return [
        VelocityPoint(date=str(row["date"]), rolling_7d=as_float(row["rolling_7d_avg"]), rolling_14d=as_float(row["rolling_14d_avg"]))
        for row in rows
    ]


async def _fetch_transfer_weeks() -> list:
    return await fetch_rows(
        r"""
        SELECT REGEXP_REPLACE(description, '^Transfer to (.+?) \|.*$', '\1') AS name,
               DATE_TRUNC('week', trans_date)::date AS week_start,
               COALESCE(SUM(debit), 0) AS week_total,
               MAX(trans_date::date)::text AS latest_date
        FROM transactions
        WHERE debit > 0 AND description ILIKE 'Transfer to%'
        GROUP BY name, week_start
        ORDER BY name, week_start
        """
    )


def _has_three_consecutive_weeks(week_starts: list) -> bool:
    sorted_weeks = sorted(set(week_starts))
    run = 1
    for previous, current in zip(sorted_weeks, sorted_weeks[1:]):
        if current - previous == timedelta(days=7):
            run += 1
            if run >= 3:
                return True
        else:
            run = 1
    return False


async def _fetch_recurring_transfers() -> list[RecurringTransfer]:
    rows = await _fetch_transfer_weeks()
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        grouped[str(row["name"] or "")].append(row)

    recurring = []
    for name, items in grouped.items():
        if not _has_three_consecutive_weeks([item["week_start"] for item in items]):
            continue
        avg_weekly = mean(as_float(item["week_total"]) for item in items)
        latest_dates = sorted([str(item["latest_date"] or "") for item in items if item["latest_date"]], reverse=True)[:3]
        recurring.append(RecurringTransfer(
            recipient_name=name,
            avg_weekly_amount=avg_weekly,
            last_3_dates=latest_dates,
            monthly_total_estimate=avg_weekly * 4.33,
        ))
    return recurring


def _momentum(velocity_points: list[VelocityPoint]) -> str:
    if not velocity_points:
        return "STABLE"
    last = velocity_points[-1]
    if last.rolling_14d == 0:
        return "STABLE"
    if last.rolling_7d > last.rolling_14d * 1.08:
        return "ACCELERATING"
    if last.rolling_7d < last.rolling_14d * 0.92:
        return "DECELERATING"
    return "STABLE"


async def _fetch_flow() -> FlowResponse:
    monthly_net_flows = await _fetch_monthly_net_flows()
    velocity_points = await _fetch_velocity_points()
    recurring_transfers = await _fetch_recurring_transfers()
    return FlowResponse(
        monthly_net_flows=monthly_net_flows,
        velocity_points=velocity_points,
        avg_monthly_in=mean(month.total_credits for month in monthly_net_flows),
        avg_monthly_out=mean(month.total_debits for month in monthly_net_flows),
        avg_net=mean(month.net for month in monthly_net_flows),
        momentum=_momentum(velocity_points),
        recurring_transfers=recurring_transfers,
    )


@router.get("/flow", response_model=FlowResponse)
async def get_flow() -> FlowResponse:
    return await get_cached("flow", TTL_HISTORICAL, _fetch_flow)
