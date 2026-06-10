# Called: when user opens Patterns screen (once per session
#         is usually enough given 1hr cache).
# Cached 1hr.
from __future__ import annotations

from fastapi import APIRouter

from cache import TTL_HISTORICAL, get_cached
from models import DowBar, HeatmapCell, MonthlyPoint, PatternsResponse, SpendCategory
from routers.utils import COMBINED_CTE, DAY_NAMES, as_float, as_int, fetch_rows

router = APIRouter()


async def _fetch_dow_bars() -> list[DowBar]:
    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT dow,
               COALESCE(AVG(total_debit), 0) AS avg_spend,
               COALESCE(SUM(total_debit), 0) AS total_spend,
               COUNT(*) AS days_recorded
        FROM combined
        GROUP BY dow
        ORDER BY dow ASC
        """
    )
    return [
        DowBar(
            dow=as_int(row["dow"]),
            day_name=DAY_NAMES[as_int(row["dow"])] if 0 <= as_int(row["dow"]) < len(DAY_NAMES) else "",
            avg_spend=as_float(row["avg_spend"]),
            total_spend=as_float(row["total_spend"]),
            days_recorded=as_int(row["days_recorded"]),
        )
        for row in rows
    ]


async def _fetch_monthly_points() -> list[MonthlyPoint]:
    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT EXTRACT(YEAR FROM date)::int AS year,
               month,
               TO_CHAR(MIN(date), 'Mon') AS month_label,
               COALESCE(SUM(total_debit), 0) AS total_spend
        FROM combined
        GROUP BY year, month
        ORDER BY year ASC, month ASC
        """
    )
    points = []
    previous_total = 0.0
    for index, row in enumerate(rows):
        total = as_float(row["total_spend"])
        change = 0.0 if index == 0 or previous_total == 0 else ((total - previous_total) / previous_total) * 100
        points.append(MonthlyPoint(
            month=as_int(row["month"]),
            year=as_int(row["year"]),
            month_label=str(row["month_label"]),
            total_spend=total,
            pct_change=change,
        ))
        previous_total = total
    return points


async def _fetch_heatmap() -> list[HeatmapCell]:
    rows = await fetch_rows(
        """
        -- Heatmap requires hour-level granularity.
        -- statement_transactions stores trans_date as DATE (no time component),
        -- so only transactions (which has TIMESTAMP) contributes here.
        SELECT EXTRACT(hour FROM trans_date)::int AS hour,
               EXTRACT(dow  FROM trans_date)::int AS dow_pg,
               COUNT(*) AS transaction_count
        FROM (
            SELECT trans_date FROM transactions WHERE debit > 0
            UNION ALL
            SELECT trans_date FROM statement_transactions
            WHERE debit > 0
              AND trans_date::text ~ '\\d{2}:\\d{2}:\\d{2}'
        ) AS txns
        GROUP BY hour, dow_pg
        ORDER BY dow_pg ASC, hour ASC
        """
    )
    return [
        HeatmapCell(
            hour=as_int(row["hour"]),
            dow=(as_int(row["dow_pg"]) - 1) % 7,
            transaction_count=as_int(row["transaction_count"]),
        )
        for row in rows
    ]


async def _fetch_spend_composition() -> tuple[list[SpendCategory], int, int]:
    row = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT
            COALESCE(AVG(total_debit),  0) AS avg_total,
            COALESCE(AVG(p2p_spend),    0) AS avg_p2p,
            COALESCE(AVG(pos_spend),    0) AS avg_pos,
            COALESCE(AVG(data_spend),   0) AS avg_data,
            COALESCE(AVG(airtime_spend),0) AS avg_airtime,
            COALESCE(AVG(online_spend), 0) AS avg_online,
            COALESCE(AVG(family_spend), 0) AS avg_family,
            COUNT(*) AS total_days,
            SUM(CASE WHEN high_spend THEN 1 ELSE 0 END) AS high_spend_days
        FROM combined
        """
    )
    if not row:
        return [], 0, 0
    r = row[0]
    avg_total      = as_float(r["avg_total"]) or 1.0
    avg_p2p        = as_float(r["avg_p2p"])
    avg_pos        = as_float(r["avg_pos"])
    avg_data       = as_float(r["avg_data"])
    avg_airtime    = as_float(r["avg_airtime"])
    avg_online     = as_float(r["avg_online"])
    avg_family     = as_float(r["avg_family"])
    avg_other      = max(0.0, avg_total - avg_p2p - avg_pos - avg_data - avg_airtime - avg_online - avg_family)

    CATS = [
        ("p2p",     "Person-to-Person", avg_p2p),
        ("pos",     "POS / Shop",       avg_pos),
        ("data",    "Data Bundles",     avg_data),
        ("airtime", "Airtime",          avg_airtime),
        ("online",  "Online Payments",  avg_online),
        ("family",  "Family",           avg_family),
        ("other",   "Other",            avg_other),
    ]
    composition = [
        SpendCategory(
            key=key,
            label=label,
            avg_daily=round(avg, 2),
            share_pct=round(avg / avg_total * 100, 1),
        )
        for key, label, avg in CATS
        if avg > 0
    ]
    composition.sort(key=lambda c: c.avg_daily, reverse=True)
    return composition, as_int(r["high_spend_days"]), as_int(r["total_days"])


async def _fetch_weekday_weekend_avgs() -> tuple[float, float]:
    rows = await fetch_rows(
        f"""
        {COMBINED_CTE}
        SELECT is_weekend, COALESCE(AVG(total_debit), 0) AS avg_spend
        FROM combined
        GROUP BY is_weekend
        """
    )
    weekend_avg = 0.0
    weekday_avg = 0.0
    for row in rows:
        if bool(row["is_weekend"]):
            weekend_avg = as_float(row["avg_spend"])
        else:
            weekday_avg = as_float(row["avg_spend"])
    return weekend_avg, weekday_avg


async def _fetch_patterns() -> PatternsResponse:
    dow_bars = await _fetch_dow_bars()
    monthly_points = await _fetch_monthly_points()
    heatmap = await _fetch_heatmap()
    weekend_avg, weekday_avg = await _fetch_weekday_weekend_avgs()
    composition, high_spend_days, total_days = await _fetch_spend_composition()
    return PatternsResponse(
        dow_bars=dow_bars,
        monthly_points=monthly_points,
        heatmap=heatmap,
        weekend_avg=weekend_avg,
        weekday_avg=weekday_avg,
        spend_composition=composition,
        total_high_spend_days=high_spend_days,
        total_days_recorded=total_days,
    )


@router.get("/patterns", response_model=PatternsResponse)
async def get_patterns() -> PatternsResponse:
    return await get_cached("patterns", TTL_HISTORICAL, _fetch_patterns)
