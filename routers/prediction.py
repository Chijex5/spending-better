from __future__ import annotations

from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Request

from cache import TTL_PREDICTION, get_cached
from config import HIGH_SPEND_THRESHOLD
from ml import predict_tomorrow
from models import FeatureImportance, PredictionResponse
from routers.utils import (
    DAY_LABELS,
    DAY_NAMES,
    MONEY_FEATURES,
    as_float,
    combined_dataframe,
    risk_from_probability,
)

router = APIRouter()

FEATURES = [
    "rolling_7d_avg",
    "prev_day_spend",
    "rolling_14d_avg",
    "max_single",
    "discretionary",
    "num_transactions",
    "total_credit",
    "savings_out",
    "is_weekend",
    "dow",
    "dom",
    "month",
    "p2p_spend",
    "pos_spend",
    "data_spend",
    "airtime_spend",
    "online_spend",
    "family_spend",
]

FEATURE_LABELS = {
    "rolling_7d_avg":    "Your 7-day trend",
    "prev_day_spend":    "Yesterday's spending",
    "rolling_14d_avg":   "2-week average",
    "max_single":        "Largest recent transaction",
    "discretionary":     "P2P + POS + Online transfers",
    "num_transactions":  "Transaction frequency",
    "total_credit":      "Money received recently",
    "savings_out":       "Amount moved to savings",
    "is_weekend":        "Weekend effect",
    "dow":               "Day of week pattern",
    "dom":               "Day of month pattern",
    "month":             "Month of year pattern",
    "p2p_spend":         "Person-to-person transfers",
    "pos_spend":         "POS purchases",
    "data_spend":        "Data bundle spend",
    "airtime_spend":     "Airtime spend",
    "online_spend":      "Online payment spend",
    "family_spend":      "Family transfers",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _fmt_naira(value: float) -> str:
    return f"₦{value:,.0f}"


def _format_feature_value(feature_key: str, value: Any) -> str:
    numeric = as_float(value)
    if feature_key in MONEY_FEATURES:
        return _fmt_naira(numeric)
    return str(int(numeric))


def _model_features(model: Any) -> list[str]:
    names = getattr(model, "feature_names_in_", None)
    if names is not None:
        return [str(name) for name in names]
    return FEATURES


def _top_features(model: Any, last_row: dict[str, Any]) -> list[FeatureImportance]:
    importances = getattr(model, "feature_importances_", None)
    if importances is None:
        return []
    feature_names = _model_features(model)
    pairs = sorted(
        zip(feature_names, np.asarray(importances).tolist()),
        key=lambda item: item[1],
        reverse=True,
    )[:5]
    return [
        FeatureImportance(
            feature_key=fk,
            label=FEATURE_LABELS.get(fk, fk.replace("_", " ").title()),
            importance=as_float(imp),
            current_value=_format_feature_value(fk, last_row.get(fk, 0)),
        )
        for fk, imp in pairs
    ]


# ─── Velocity ─────────────────────────────────────────────────────────────────

def _velocity(df: pd.DataFrame) -> dict:
    """Last-7-days vs previous-7-days spend comparison."""
    if len(df) < 2:
        return {
            "last_7_total": 0.0,
            "prev_7_total": 0.0,
            "pct_change": 0.0,
            "direction": "flat",
            "narrative": "Not enough data yet.",
        }
    last7 = as_float(df.tail(7)["total_debit"].sum())
    prev7 = as_float(df.iloc[-14:-7]["total_debit"].sum()) if len(df) >= 14 else 0.0
    pct   = ((last7 - prev7) / (prev7 + 1)) * 100

    if pct > 10:
        direction = "up"
        narrative = (
            f"You spent {_fmt_naira(last7)} in the last 7 days — "
            f"{abs(pct):.0f}% more than the prior week ({_fmt_naira(prev7)}). "
            "Spending is accelerating."
        )
    elif pct < -10:
        direction = "down"
        narrative = (
            f"You spent {_fmt_naira(last7)} in the last 7 days — "
            f"{abs(pct):.0f}% less than the prior week ({_fmt_naira(prev7)}). "
            "You're trending in the right direction."
        )
    else:
        direction = "flat"
        narrative = (
            f"Spending is steady at {_fmt_naira(last7)} over the last 7 days "
            f"(vs {_fmt_naira(prev7)} the prior week)."
        )

    return {
        "last_7_total": last7,
        "prev_7_total": prev7,
        "pct_change": round(pct, 1),
        "direction": direction,
        "narrative": narrative,
    }


# ─── Contextual advisor ───────────────────────────────────────────────────────

def _advisor_tips(
    risk: str,
    last_row: dict[str, Any],
    df: pd.DataFrame,
) -> list[str]:
    """
    Generate advisor copy that references actual numbers,
    mirroring what analyze.py did in the terminal.
    """
    tips: list[str] = []
    r7  = as_float(last_row.get("rolling_7d_avg", 0))
    r14 = as_float(last_row.get("rolling_14d_avg", 0))
    p2p = as_float(last_row.get("p2p_spend", 0))
    pos = as_float(last_row.get("pos_spend", 0))
    data_s = as_float(last_row.get("data_spend", 0))
    air    = as_float(last_row.get("airtime_spend", 0))

    if risk == "HIGH":
        cap = round(HIGH_SPEND_THRESHOLD * 3 / 1000) * 1000
        tips.append(
            f"Set a mental cap of {_fmt_naira(cap)} on discretionary sends today."
        )
        tips.append(
            "Delay any non-urgent transfers by 24 hours — if it still feels urgent tomorrow, send it then."
        )
        if p2p > 0:
            tips.append(
                f"P2P transfers ({_fmt_naira(p2p)} recently) are your biggest risk driver. "
                "Ask yourself who and why before sending."
            )

    elif risk == "MEDIUM":
        if r7 > r14:
            tips.append(
                f"Your 7-day average ({_fmt_naira(r7)}) is above your 14-day average ({_fmt_naira(r14)}). "
                "Spending is creeping up — a good day to hold the line."
            )
        if data_s > 0 or air > 0:
            tips.append(
                f"Data/airtime ({_fmt_naira(data_s + air)}) tends to cluster in short bursts. "
                "Buying a bigger bundle now avoids repeat top-ups."
            )
        if pos > 0:
            tips.append(
                f"POS spend ({_fmt_naira(pos)}) is elevated. Consider cash-only for small errands today."
            )

    else:  # LOW
        # How much headroom before hitting the threshold?
        headroom = max(0.0, HIGH_SPEND_THRESHOLD - as_float(last_row.get("total_debit", 0)))
        tips.append(
            f"Low-risk day. You have roughly {_fmt_naira(headroom)} of headroom "
            f"before hitting your high-spend threshold."
        )
        tips.append(
            "Good days are when you shore up savings or pre-pay recurring bills."
        )
        if r7 < r14:
            tips.append(
                f"Your spend trend is cooling ({_fmt_naira(r7)} 7d avg vs {_fmt_naira(r14)} 14d). "
                "Keep it up."
            )

    return tips


# ─── Week outlook ─────────────────────────────────────────────────────────────

def _week_outlook(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    latest_date = df["date"].max()
    outlook = []
    for offset in range(1, 8):
        target_date = latest_date + timedelta(days=offset)
        target_dow  = target_date.weekday()
        dow_rows    = df[df["dow"] == target_dow]
        avg_spend   = as_float(dow_rows["total_debit"].mean()) if not dow_rows.empty else 0.0
        probability = (
            min(1.0, max(0.0, avg_spend / (HIGH_SPEND_THRESHOLD * 2)))
            if HIGH_SPEND_THRESHOLD else 0.0
        )
        outlook.append({
            "date":       target_date.isoformat(),
            "day_label":  DAY_LABELS[target_dow],
            "risk":       risk_from_probability(probability),
            "avg_spend":  round(avg_spend),          # ← NEW: historical avg for that dow
            "probability": round(probability * 100),  # ← NEW: 0-100 for the bar
        })
    return outlook


# ─── Main fetch ───────────────────────────────────────────────────────────────

async def _fetch_prediction(request: Request) -> PredictionResponse:
    df = await combined_dataframe()
    if df.empty:
        return PredictionResponse(
            target_date="",
            day_name="",
            probability=0.0,
            risk_level="LOW",
            rolling_7d_avg=0.0,
            rolling_14d_avg=0.0,
            top_features=[],
            week_outlook=[],
            velocity={"last_7_total": 0, "prev_7_total": 0, "pct_change": 0, "direction": "flat", "narrative": ""},
            advisor_tips=[],
            prev_day_spend=0.0,
            high_spend_threshold=HIGH_SPEND_THRESHOLD,
        )

    df["date"] = pd.to_datetime(df["date"]).dt.date
    model      = request.app.state.rf_model
    prediction = predict_tomorrow(model, df)
    probability   = as_float(prediction.get("prob", 0.0))
    target_date   = prediction.get("date")
    target_dow    = int(prediction.get("dow", 0))
    last_row      = dict(df.iloc[-1])
    risk          = risk_from_probability(probability)

    return PredictionResponse(
        target_date=target_date.isoformat() if hasattr(target_date, "isoformat") else str(target_date),
        day_name=DAY_NAMES[target_dow] if 0 <= target_dow < len(DAY_NAMES) else "",
        probability=probability,
        risk_level=risk,
        rolling_7d_avg=as_float(last_row.get("rolling_7d_avg", 0)),
        rolling_14d_avg=as_float(last_row.get("rolling_14d_avg", 0)),
        top_features=_top_features(model, last_row),
        week_outlook=_week_outlook(df),
        # ── new fields ──
        velocity=_velocity(df),
        advisor_tips=_advisor_tips(risk, last_row, df),
        prev_day_spend=as_float(last_row.get("total_debit", 0)),
        high_spend_threshold=float(HIGH_SPEND_THRESHOLD),
    )


@router.get("/prediction", response_model=PredictionResponse)
async def get_prediction(request: Request) -> PredictionResponse:
    async def _fetch() -> PredictionResponse:
        return await _fetch_prediction(request)
    return await get_cached("prediction", TTL_PREDICTION, _fetch)