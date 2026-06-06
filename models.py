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


class PredictionResponse(BaseModel):
    target_date: str
    day_name: str
    probability: float
    risk_level: str
    rolling_7d_avg: float
    rolling_14d_avg: float
    top_features: list[FeatureImportance]
    week_outlook: list[dict]


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
