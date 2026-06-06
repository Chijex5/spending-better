# Called: on app launch (for dashboard badge),
#         when user opens Prediction screen.
# Cached 15min. DO NOT call on every render.
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
    "rolling_7d_avg": "Your 7-day trend",
    "prev_day_spend": "Yesterday's spending",
    "rolling_14d_avg": "2-week average",
    "max_single": "Largest recent transaction",
    "discretionary": "P2P + POS + Online transfers",
    "num_transactions": "Transaction frequency",
    "total_credit": "Money received recently",
    "savings_out": "Amount moved to savings",
    "is_weekend": "Weekend effect",
    "dow": "Day of week pattern",
    "dom": "Day of month pattern",
    "month": "Month of year pattern",
    "p2p_spend": "Person-to-person transfers",
    "pos_spend": "POS purchases",
    "data_spend": "Data bundle spend",
    "airtime_spend": "Airtime spend",
    "online_spend": "Online payment spend",
    "family_spend": "Family transfers",
}


def _format_feature_value(feature_key: str, value: Any) -> str:
    numeric = as_float(value)
    if feature_key in MONEY_FEATURES:
        return f"₦{numeric:,.0f}"
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
    pairs = sorted(zip(feature_names, np.asarray(importances).tolist()), key=lambda item: item[1], reverse=True)[:5]
    return [
        FeatureImportance(
            feature_key=feature_key,
            label=FEATURE_LABELS.get(feature_key, feature_key.replace("_", " ").title()),
            importance=as_float(importance),
            current_value=_format_feature_value(feature_key, last_row.get(feature_key, 0)),
        )
        for feature_key, importance in pairs
    ]


def _week_outlook(df) -> list[dict]:
    if df.empty:
        return []

    latest_date = df["date"].max()
    outlook = []
    # Heuristic only: estimate future risk from the historical same-day-of-week average.
    for offset in range(1, 8):
        target_date = latest_date + timedelta(days=offset)
        target_dow = target_date.weekday()
        dow_rows = df[df["dow"] == target_dow]
        avg_spend = as_float(dow_rows["total_debit"].mean()) if not dow_rows.empty else 0.0
        probability = min(1.0, max(0.0, avg_spend / (HIGH_SPEND_THRESHOLD * 2))) if HIGH_SPEND_THRESHOLD else 0.0
        outlook.append({
            "date": target_date.isoformat(),
            "day_label": DAY_LABELS[target_dow],
            "risk": risk_from_probability(probability),
        })
    return outlook


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
        )

    df["date"] = pd.to_datetime(df["date"]).dt.date
    model = request.app.state.rf_model
    prediction = predict_tomorrow(model, df)
    probability = as_float(prediction.get("prob", 0.0))
    target_date = prediction.get("date")
    target_dow = int(prediction.get("dow", 0))
    last_row = dict(df.iloc[-1])

    return PredictionResponse(
        target_date=target_date.isoformat() if hasattr(target_date, "isoformat") else str(target_date),
        day_name=DAY_NAMES[target_dow] if 0 <= target_dow < len(DAY_NAMES) else "",
        probability=probability,
        risk_level=risk_from_probability(probability),
        rolling_7d_avg=as_float(last_row.get("rolling_7d_avg", 0)),
        rolling_14d_avg=as_float(last_row.get("rolling_14d_avg", 0)),
        top_features=_top_features(model, last_row),
        week_outlook=_week_outlook(df),
    )


@router.get("/prediction", response_model=PredictionResponse)
async def get_prediction(request: Request) -> PredictionResponse:
    async def _fetch() -> PredictionResponse:
        return await _fetch_prediction(request)

    return await get_cached("prediction", TTL_PREDICTION, _fetch)
