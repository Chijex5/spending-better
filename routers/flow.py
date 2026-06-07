"""
routers/flow.py  (v2 — extended insights)
──────────────────────────────────────────
GET /flow   — net flow by month + velocity + recurring transfers
             + day-of-week spend profile + burn rate + income consistency
             + month-over-month changes + peak spend day + cashflow health score
"""
from __future__ import annotations

import calendar
import math
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

import pandas as pd
from fastapi import APIRouter, Request

from cache import TTL_PREDICTION, get_cached
from routers.utils import as_float, fetch_rows

router = APIRouter()


# ─── Response models ──────────────────────────────────────────────────────────

from pydantic import BaseModel


class MonthFlow(BaseModel):
    month_label: str        # "JAN 2026"
    year: int
    month: int
    total_credit: float
    total_debit: float
    net: float              # credit - debit (positive = surplus)
    mom_change_pct: float   # NEW: % change in debit vs prior month (None if first month)
    # None sentinel: use 0.0 and set a flag; frontend checks prior-month existence


class FlowStats(BaseModel):
    avg_monthly_in: float
    avg_monthly_out: float
    avg_net: float


class VelocityPoint(BaseModel):
    date: str               # "2026-01-15"
    rolling_7d: float
    rolling_14d: float
    is_high_spend: bool


class RecurringTransfer(BaseModel):
    recipient: str
    avg_weekly_amount: float
    typical_dow: int        # 0=Mon…6=Sun
    last_three_dates: list[str]
    total_this_month: float


# NEW: Day-of-week spend profile
class DowProfile(BaseModel):
    dow: int                # 0=Mon…6=Sun
    label: str              # "Mon", "Tue", …
    avg_debit: float
    is_peak: bool           # True for the single highest-spend day


# NEW: Burn rate projection
class BurnRate(BaseModel):
    daily_burn: float           # current 7d avg spend per day
    monthly_income: float       # current month's credit so far
    days_elapsed: int           # days into the current month
    days_remaining_in_month: int
    projected_month_spend: float
    projected_surplus: float    # negative = deficit projected
    pct_income_burned: float    # % of monthly income already spent
    on_track: bool              # True if projected_surplus >= 0


# NEW: Income consistency
class IncomeProfile(BaseModel):
    monthly_credits: list[float]     # one per month in order
    avg: float
    std_dev: float
    cv: float                         # coefficient of variation (lower = more consistent)
    consistency_label: str            # "Very Consistent" | "Moderate" | "Volatile"


# NEW: Peak single-day spend
class PeakDay(BaseModel):
    date: str
    amount: float
    formatted_date: str   # e.g. "14 Jan 2026"


# NEW: Cashflow health score (0–100)
class HealthScore(BaseModel):
    score: int                    # 0–100
    label: str                    # "Excellent" | "Good" | "Fair" | "Needs Work" | "Critical"
    color_key: str                # "green" | "blue" | "amber" | "red"
    components: dict[str, int]    # component name → score contribution (sums to 100)
    insight: str                  # one-line human explanation


class FlowResponse(BaseModel):
    months: list[MonthFlow]
    stats: FlowStats
    velocity: list[VelocityPoint]
    current_7d_avg: float
    current_14d_avg: float
    momentum: str           # "ACCELERATING" | "STABLE" | "DECELERATING"
    recurring: list[RecurringTransfer]
    total_recurring_weekly: float
    total_monthly_spend: float
    # NEW fields
    dow_profile: list[DowProfile]
    burn_rate: BurnRate
    income_profile: IncomeProfile
    peak_day: PeakDay | None
    health_score: HealthScore


# ─── Helpers (existing) ───────────────────────────────────────────────────────

def _month_label(year: int, month: int) -> str:
    return f"{calendar.month_abbr[month].upper()} {year}"


def _build_monthly_flow(daily_df: pd.DataFrame) -> list[MonthFlow]:
    daily_df = daily_df.copy()
    daily_df["date"] = pd.to_datetime(daily_df["date"])
    groups = daily_df.groupby(
        [daily_df["date"].dt.year.rename("year"), daily_df["date"].dt.month.rename("month")]
    )
    raw: list[tuple[tuple[int, int], float, float]] = []
    for (year, month), grp in sorted(groups, key=lambda x: x[0]):
        credit = as_float(grp["total_credit"].sum())
        debit  = as_float(grp["total_debit"].sum())
        raw.append(((int(year), int(month)), credit, debit))

    result: list[MonthFlow] = []
    for i, ((year, month), credit, debit) in enumerate(raw):
        if i == 0:
            mom = 0.0
        else:
            prev_debit = raw[i - 1][2]
            mom = ((debit - prev_debit) / prev_debit * 100) if prev_debit else 0.0
        result.append(MonthFlow(
            month_label=_month_label(year, month),
            year=year, month=month,
            total_credit=credit, total_debit=debit,
            net=credit - debit,
            mom_change_pct=round(mom, 1),
        ))
    return result


def _build_velocity(daily_df: pd.DataFrame) -> tuple[list[VelocityPoint], float, float, str]:
    df = daily_df.copy().sort_values("date")
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").asfreq("D", fill_value=0).reset_index()

    debits = df["total_debit"].astype(float)
    df["r7"]  = debits.rolling(7,  min_periods=1).mean()
    df["r14"] = debits.rolling(14, min_periods=1).mean()

    high_col = df["high_spend"].astype(bool) if "high_spend" in df.columns else pd.Series([False] * len(df))

    points: list[VelocityPoint] = []
    for _, row in df.iterrows():
        points.append(VelocityPoint(
            date=str(row["date"].date()),
            rolling_7d=round(float(row["r7"]), 2),
            rolling_14d=round(float(row["r14"]), 2),
            is_high_spend=bool(high_col[row.name]) if row.name in high_col.index else False,
        ))

    current_7d  = float(df["r7"].iloc[-1])  if len(df) else 0.0
    current_14d = float(df["r14"].iloc[-1]) if len(df) else 0.0

    diff = current_7d - current_14d
    threshold = current_14d * 0.08
    if diff > threshold:
        momentum = "ACCELERATING"
    elif diff < -threshold:
        momentum = "DECELERATING"
    else:
        momentum = "STABLE"

    return points, round(current_7d, 2), round(current_14d, 2), momentum


def _build_recurring(txn_rows: list[dict[str, Any]]) -> tuple[list[RecurringTransfer], float]:
    if not txn_rows:
        return [], 0.0

    week_amounts: dict[str, dict[int, list[tuple[str, float]]]] = defaultdict(lambda: defaultdict(list))

    today = date.today()
    cutoff = today - timedelta(days=90)

    for row in txn_rows:
        recipient = str(row.get("recipient") or "").strip()
        if not recipient or recipient.lower() in ("", "nan", "none"):
            continue
        debit = as_float(row.get("debit", 0))
        if debit <= 0:
            continue
        try:
            d = date.fromisoformat(str(row["trans_date"])[:10])
        except (ValueError, KeyError):
            continue
        if d < cutoff:
            continue
        iso_week = d.isocalendar()[1]
        week_amounts[recipient][iso_week].append((str(d), debit))

    recurring: list[RecurringTransfer] = []
    for recipient, weeks in week_amounts.items():
        sorted_weeks = sorted(weeks.keys())
        consecutive = 1
        max_consecutive = 1
        for i in range(1, len(sorted_weeks)):
            if sorted_weeks[i] - sorted_weeks[i - 1] == 1:
                consecutive += 1
                max_consecutive = max(max_consecutive, consecutive)
            else:
                consecutive = 1
        if max_consecutive < 3:
            continue

        all_entries = [(d, amt) for entries in weeks.values() for d, amt in entries]
        all_entries.sort(key=lambda x: x[0])
        all_amounts = [amt for _, amt in all_entries]
        avg_weekly  = sum(all_amounts) / len(weeks)

        dow_counts: dict[int, int] = defaultdict(int)
        for d_str, _ in all_entries:
            dow_counts[date.fromisoformat(d_str).weekday()] += 1
        typical_dow = max(dow_counts, key=lambda k: dow_counts[k])

        last_three = [d for d, _ in all_entries[-3:]]
        this_month_total = sum(
            amt for d_str, amt in all_entries
            if date.fromisoformat(d_str).month == today.month
            and date.fromisoformat(d_str).year == today.year
        )

        recurring.append(RecurringTransfer(
            recipient=recipient,
            avg_weekly_amount=round(avg_weekly, 2),
            typical_dow=typical_dow,
            last_three_dates=last_three,
            total_this_month=round(this_month_total, 2),
        ))

    recurring.sort(key=lambda r: r.avg_weekly_amount, reverse=True)
    total_weekly = sum(r.avg_weekly_amount for r in recurring)
    return recurring, round(total_weekly, 2)


# ─── NEW Helpers ──────────────────────────────────────────────────────────────

_DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _build_dow_profile(daily_df: pd.DataFrame) -> list[DowProfile]:
    """Average debit per calendar day-of-week across all history."""
    df = daily_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["dow"] = df["date"].dt.dayofweek  # 0=Mon, 6=Sun
    df["total_debit"] = df["total_debit"].astype(float)

    avgs = df.groupby("dow")["total_debit"].mean()
    # Ensure all 7 days present
    all_avgs = {d: round(float(avgs.get(d, 0.0)), 2) for d in range(7)}
    peak_dow = max(all_avgs, key=lambda k: all_avgs[k])

    return [
        DowProfile(
            dow=d,
            label=_DOW_LABELS[d],
            avg_debit=all_avgs[d],
            is_peak=(d == peak_dow),
        )
        for d in range(7)
    ]


def _build_burn_rate(daily_df: pd.DataFrame, current_7d_avg: float) -> BurnRate:
    """
    Project end-of-month outcome based on:
    - current month's credit (income so far)
    - current 7d avg daily spend × remaining days
    """
    today = date.today()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_elapsed = today.day
    days_remaining = days_in_month - days_elapsed

    df = daily_df.copy()
    df["date"] = pd.to_datetime(df["date"])

    # Current month's credit and debit so far
    this_month = df[(df["date"].dt.year == today.year) & (df["date"].dt.month == today.month)]
    monthly_income = float(this_month["total_credit"].sum()) if len(this_month) else 0.0
    spent_so_far   = float(this_month["total_debit"].sum())  if len(this_month) else 0.0

    projected_remaining = current_7d_avg * days_remaining
    projected_total_spend = spent_so_far + projected_remaining
    projected_surplus = monthly_income - projected_total_spend

    pct_burned = (spent_so_far / monthly_income * 100) if monthly_income > 0 else 0.0

    return BurnRate(
        daily_burn=round(current_7d_avg, 2),
        monthly_income=round(monthly_income, 2),
        days_elapsed=days_elapsed,
        days_remaining_in_month=days_remaining,
        projected_month_spend=round(projected_total_spend, 2),
        projected_surplus=round(projected_surplus, 2),
        pct_income_burned=round(pct_burned, 1),
        on_track=projected_surplus >= 0,
    )


def _build_income_profile(months: list[MonthFlow]) -> IncomeProfile:
    """Coefficient of variation on monthly credit to measure income predictability."""
    credits = [m.total_credit for m in months]
    if not credits:
        return IncomeProfile(
            monthly_credits=[], avg=0, std_dev=0, cv=0,
            consistency_label="No Data",
        )
    avg = sum(credits) / len(credits)
    variance = sum((c - avg) ** 2 for c in credits) / max(len(credits) - 1, 1)
    std_dev = math.sqrt(variance)
    cv = (std_dev / avg * 100) if avg > 0 else 0.0

    if cv < 15:
        label = "Very Consistent"
    elif cv < 30:
        label = "Moderate"
    else:
        label = "Volatile"

    return IncomeProfile(
        monthly_credits=[round(c, 2) for c in credits],
        avg=round(avg, 2),
        std_dev=round(std_dev, 2),
        cv=round(cv, 1),
        consistency_label=label,
    )


def _build_peak_day(daily_df: pd.DataFrame) -> PeakDay | None:
    """Single highest-debit day across all history."""
    df = daily_df.copy()
    df["total_debit"] = df["total_debit"].astype(float)
    if df.empty:
        return None
    idx = df["total_debit"].idxmax()
    row = df.loc[idx]
    d = str(row["date"])[:10]
    parsed = date.fromisoformat(d)
    formatted = f"{parsed.day} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parsed.month - 1]} {parsed.year}"
    return PeakDay(date=d, amount=round(float(row["total_debit"]), 2), formatted_date=formatted)


def _build_health_score(
    months: list[MonthFlow],
    income_profile: IncomeProfile,
    burn_rate: BurnRate,
    recurring_weekly: float,
    momentum: str,
) -> HealthScore:
    """
    Composite 0–100 cashflow health score.
    Components (max points each):
      - Surplus ratio      : 30pts  (% of months with positive net)
      - Income consistency : 25pts  (lower CV = higher score)
      - Burn rate          : 25pts  (on track = full, partial otherwise)
      - Recurring burden   : 10pts  (recurring as % of monthly spend)
      - Momentum           : 10pts  (DECELERATING=10, STABLE=5, ACCEL=0)
    """
    components: dict[str, int] = {}

    # 1. Surplus ratio (30pts)
    if months:
        surplus_months = sum(1 for m in months if m.net >= 0)
        surplus_ratio = surplus_months / len(months)
        surplus_score = round(surplus_ratio * 30)
    else:
        surplus_score = 0
    components["Surplus Months"] = surplus_score

    # 2. Income consistency (25pts) — lower CV is better
    cv = income_profile.cv
    if cv < 10:
        consistency_score = 25
    elif cv < 20:
        consistency_score = 20
    elif cv < 35:
        consistency_score = 13
    elif cv < 50:
        consistency_score = 6
    else:
        consistency_score = 0
    components["Income Consistency"] = consistency_score

    # 3. Burn rate (25pts)
    if burn_rate.monthly_income == 0:
        burn_score = 12  # neutral — no data
    elif burn_rate.on_track:
        # How comfortable is the projected surplus?
        surplus_pct = burn_rate.projected_surplus / burn_rate.monthly_income * 100
        if surplus_pct > 20:
            burn_score = 25
        elif surplus_pct > 5:
            burn_score = 18
        else:
            burn_score = 12
    else:
        # How bad is the projected deficit?
        deficit_pct = abs(burn_rate.projected_surplus) / burn_rate.monthly_income * 100
        if deficit_pct < 10:
            burn_score = 8
        elif deficit_pct < 25:
            burn_score = 4
        else:
            burn_score = 0
    components["Burn Rate"] = burn_score

    # 4. Recurring burden (10pts)
    monthly_spend = burn_rate.projected_month_spend
    if monthly_spend > 0:
        recurring_monthly = recurring_weekly * 4.33
        burden_pct = recurring_monthly / monthly_spend * 100
        if burden_pct < 20:
            burden_score = 10
        elif burden_pct < 40:
            burden_score = 7
        elif burden_pct < 60:
            burden_score = 4
        else:
            burden_score = 1
    else:
        burden_score = 10
    components["Recurring Burden"] = burden_score

    # 5. Momentum (10pts)
    momentum_score = {"DECELERATING": 10, "STABLE": 5, "ACCELERATING": 0}[momentum]
    components["Spend Momentum"] = momentum_score

    total = sum(components.values())

    if total >= 80:
        label, color_key = "Excellent", "green"
        insight = "Your cashflow is in great shape — income is stable and spend is under control."
    elif total >= 65:
        label, color_key = "Good", "blue"
        insight = "Solid cashflow, with a few areas to keep an eye on."
    elif total >= 45:
        label, color_key = "Fair", "amber"
        insight = "Room to improve — focus on the weakest components below."
    elif total >= 25:
        label, color_key = "Needs Work", "red"
        insight = "Your cashflow shows signs of stress. Review burn rate and recurring spend."
    else:
        label, color_key = "Critical", "red"
        insight = "Multiple cashflow signals are in the red. Immediate review recommended."

    return HealthScore(
        score=total,
        label=label,
        color_key=color_key,
        components=components,
        insight=insight,
    )


# ─── Route ────────────────────────────────────────────────────────────────────

@router.get("/flow", response_model=FlowResponse)
async def get_flow(request: Request) -> FlowResponse:
    async def _fetch() -> FlowResponse:
        daily_rows = await fetch_rows(
            """
            SELECT date::text AS date, total_debit, total_credit,
                COALESCE(high_spend, false) AS high_spend
            FROM daily_log
            ORDER BY date ASC
            """
        )
        txn_rows = await fetch_rows(
            """
            SELECT trans_date::text AS trans_date, recipient, debit
            FROM statement_transactions
            WHERE debit > 0
            AND recipient IS NOT NULL
            AND recipient != ''
            ORDER BY trans_date DESC
            """
        )

        if not daily_rows:
            empty_burn = BurnRate(
                daily_burn=0, monthly_income=0, days_elapsed=0,
                days_remaining_in_month=0, projected_month_spend=0,
                projected_surplus=0, pct_income_burned=0, on_track=True,
            )
            empty_income = IncomeProfile(
                monthly_credits=[], avg=0, std_dev=0, cv=0, consistency_label="No Data",
            )
            empty_health = HealthScore(
                score=0, label="No Data", color_key="amber",
                components={}, insight="Not enough data yet.",
            )
            return FlowResponse(
                months=[], stats=FlowStats(avg_monthly_in=0, avg_monthly_out=0, avg_net=0),
                velocity=[], current_7d_avg=0, current_14d_avg=0, momentum="STABLE",
                recurring=[], total_recurring_weekly=0, total_monthly_spend=0,
                dow_profile=[], burn_rate=empty_burn, income_profile=empty_income,
                peak_day=None, health_score=empty_health,
            )

        daily_df = pd.DataFrame([dict(r) for r in daily_rows])
        txn_list = [dict(r) for r in txn_rows]

        months = _build_monthly_flow(daily_df)
        velocity, cur7, cur14, momentum = _build_velocity(daily_df)
        recurring, total_recurring = _build_recurring(txn_list)

        avg_in  = sum(m.total_credit for m in months) / max(len(months), 1)
        avg_out = sum(m.total_debit  for m in months) / max(len(months), 1)

        today = date.today()
        current_month_spend = sum(
            m.total_debit for m in months
            if m.year == today.year and m.month == today.month
        )

        # NEW
        dow_profile    = _build_dow_profile(daily_df)
        burn_rate      = _build_burn_rate(daily_df, cur7)
        income_profile = _build_income_profile(months)
        peak_day       = _build_peak_day(daily_df)
        health_score   = _build_health_score(
            months, income_profile, burn_rate, total_recurring, momentum
        )

        return FlowResponse(
            months=months,
            stats=FlowStats(
                avg_monthly_in=round(avg_in, 2),
                avg_monthly_out=round(avg_out, 2),
                avg_net=round(avg_in - avg_out, 2),
            ),
            velocity=velocity,
            current_7d_avg=cur7,
            current_14d_avg=cur14,
            momentum=momentum,
            recurring=recurring,
            total_recurring_weekly=total_recurring,
            total_monthly_spend=round(current_month_spend, 2),
            # NEW
            dow_profile=dow_profile,
            burn_rate=burn_rate,
            income_profile=income_profile,
            peak_day=peak_day,
            health_score=health_score,
        )
    return await get_cached("flow", TTL_PREDICTION, _fetch)