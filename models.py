from __future__ import annotations

from pydantic import BaseModel


class DailyBar(BaseModel):
    date: str
    total_debit: float
    is_high_spend: bool
    day_label: str


class SpendHealth(BaseModel):
    pace: str
    streak_days: int
    saved_this_month: float


class RecentTransaction(BaseModel):
    trans_date: str
    description: str
    category: str
    debit: float
    credit: float


class DashboardResponse(BaseModel):
    total_spent_this_month: float
    month_label: str
    pct_change_vs_last_month: float
    avg_daily: float
    high_spend_days: int
    prediction_risk: str
    prediction_prob: float
    seven_day_bars: list[DailyBar]
    spend_health: SpendHealth
    recent_transactions: list[RecentTransaction]


class WeeklyBucket(BaseModel):
    week_number: int
    date_range: str
    total_debit: float
    transaction_count: int


class KeyStats(BaseModel):
    avg_daily: float
    peak_day_amount: float
    peak_day_date: str
    lowest_day_amount: float
    lowest_day_date: str
    high_spend_days: int
    total_days: int
    total_credits: float
    net_flow: float


class WeekComparison(BaseModel):
    last_7_total: float
    prev_7_total: float
    pct_change: float


class CalendarDay(BaseModel):
    date: str
    total_debit: float
    level: int


class SummaryResponse(BaseModel):
    month_label: str
    year: int
    month: int
    total_real_spend: float
    pct_change_vs_prev_month: float
    over_under_pace: float
    budget_limit: float
    weekly_buckets: list[WeeklyBucket]
    key_stats: KeyStats
    week_comparison: WeekComparison
    calendar_days: list[CalendarDay]


class CategoryItem(BaseModel):
    category: str
    total: float
    share_pct: float
    transaction_count: int
    avg_per_transaction: float


class CategoriesResponse(BaseModel):
    period_label: str
    total_real_spend: float
    items: list[CategoryItem]


class DowBar(BaseModel):
    dow: int
    day_name: str
    avg_spend: float
    total_spend: float
    days_recorded: int


class MonthlyPoint(BaseModel):
    month: int
    year: int
    month_label: str
    total_spend: float
    pct_change: float


class HeatmapCell(BaseModel):
    hour: int
    dow: int
    transaction_count: int


class PatternsResponse(BaseModel):
    dow_bars: list[DowBar]
    monthly_points: list[MonthlyPoint]
    heatmap: list[HeatmapCell]
    weekend_avg: float
    weekday_avg: float


class MonthlyTransferBar(BaseModel):
    month_label: str
    total_sent: float


class RecipientItem(BaseModel):
    name: str
    total_sent: float
    transfer_count: int
    avg_per_transfer: float
    last_transfer_date: str
    monthly_bars: list[MonthlyTransferBar]


class RecipientsResponse(BaseModel):
    items: list[RecipientItem]


class FeatureImportance(BaseModel):
    feature_key: str
    label: str
    importance: float
    current_value: str

class SpendVelocity(BaseModel):
    last_7_total: float
    prev_7_total: float
    pct_change: float
    direction: str      # "up" | "down" | "flat"
    narrative: str  

class WeekOutlookDay(BaseModel):
    date: str
    day_label: str
    risk: str
    avg_spend: float    # NEW — historical average for that day-of-week
    probability: int     

class PredictionResponse(BaseModel):
    target_date: str
    day_name: str
    probability: float          # 0.0 – 1.0  (gauge uses * 100)
    risk_level: str
    rolling_7d_avg: float
    rolling_14d_avg: float
    top_features: list[FeatureImportance]
    week_outlook: list[WeekOutlookDay]
 
    # ── new fields ───────────────────────────────────────────────────────────
    velocity: SpendVelocity                # 7d vs prev-7d comparison + narrative
    advisor_tips: list[str]               # contextual, number-aware tips
    prev_day_spend: float                 # yesterday's actual total
    high_spend_threshold: float           # so frontend can show the threshold
 
class LogEntry(BaseModel):
    date: str
    total_debit: float
    total_credit: float
    p2p_spend: float
    pos_spend: float
    data_spend: float
    airtime_spend: float
    online_spend: float
    family_spend: float
    savings_out: float
    high_spend: bool
    source: str


class LogListItem(BaseModel):
    date: str
    total_debit: float
    high_spend: bool
    p2p_spend: float
    pos_spend: float
    data_spend: float
    airtime_spend: float


class LogWriteRequest(BaseModel):
    date: str
    p2p_spend: float = 0.0
    pos_spend: float = 0.0
    data_spend: float = 0.0
    airtime_spend: float = 0.0
    food_spend: float = 0.0
    online_spend: float = 0.0
    family_spend: float = 0.0
    electricity_spend: float = 0.0
    subscription_spend: float = 0.0
    loan_spend: float = 0.0
    other_spend: float = 0.0
    savings_out: float = 0.0
    total_credit: float = 0.0


class NetFlowMonth(BaseModel):
    month_label: str
    total_credits: float
    total_debits: float
    net: float


class VelocityPoint(BaseModel):
    date: str
    rolling_7d: float
    rolling_14d: float


class RecurringTransfer(BaseModel):
    recipient_name: str
    avg_weekly_amount: float
    last_3_dates: list[str]
    monthly_total_estimate: float


class FlowResponse(BaseModel):
    monthly_net_flows: list[NetFlowMonth]
    velocity_points: list[VelocityPoint]
    avg_monthly_in: float
    avg_monthly_out: float
    avg_net: float
    momentum: str
    recurring_transfers: list[RecurringTransfer]


class DeleteLogResponse(BaseModel):
    deleted: bool
    date: str


class RetrainQueuedResponse(BaseModel):
    status: str


class RetrainStatusResponse(BaseModel):
    status: str
    trained_on_days: int

# ── Add these to models.py ────────────────────────────────────────────────────


class CategoryTransaction(BaseModel):
    trans_date: str          # ISO date string  e.g. "2026-06-05"
    description: str
    debit: float
    credit: float


class CategoryTransactionsResponse(BaseModel):
    category: str
    period_label: str
    total: float
    transaction_count: int
    items: list[CategoryTransaction]

# ─── Explore / Monthly Summary ────────────────────────────────────────────────

class ExploreMonth(BaseModel):
    year: int
    month: int
    label: str          # "JUNE 2026"


class ExploreMonthsResponse(BaseModel):
    months: list[ExploreMonth]


class WeekBreakdown(BaseModel):
    week: int
    range: str          # "Jun 1–7"
    spend: float
    txns: int


class DailyCell(BaseModel):
    day: int            # 1–31
    date: str           # "5 Jun"
    total: float
    is_today: bool = False
    risk: str           # "LOW" | "MEDIUM" | "HIGH"


class DayTransaction(BaseModel):
    id: str
    description: str
    category: str
    date: str           # "5 Jun"
    day: str            # "Fri"
    time: str           # "" when unknown
    amount: float       # negative = debit, positive = credit


class ExploreSummaryResponse(BaseModel):
    year: int
    month: int
    month_label: str
    real_spend: float
    previous_spend: float
    credits: float
    budget: float
    spend_to_date: float
    daily_pace_reference: float   # budget / days_in_month → DAILY_PACE_REFERENCE
    weekly: list[WeekBreakdown]
    daily: list[DailyCell]
    day_transactions: list[DayTransaction]
    previous7: float
    last7: float