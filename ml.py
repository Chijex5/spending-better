from __future__ import annotations
from datetime import timedelta
import pandas as pd
from config import FEATURES
from sklearn.ensemble import RandomForestClassifier


def train_model(daily: pd.DataFrame):
    if daily.empty:
        return None

    missing = [col for col in FEATURES if col not in daily.columns]

    if missing:
        raise ValueError(
            f"Missing training columns: {', '.join(missing)}"
        )

    if "high_spend" not in daily.columns:
        raise ValueError("high_spend column not found")

    X = daily[FEATURES].fillna(0)
    y = daily["high_spend"]

    # RandomForest requires at least 2 classes
    if y.nunique() < 2:
        return None

    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=5,
        random_state=42,
        class_weight="balanced",
    )

    rf.fit(X, y)

    return rf


def _weekday(value) -> int:
    if hasattr(value, "dayofweek"):
        return int(value.dayofweek)
    return int(value.weekday())


def predict_tomorrow(rf, daily: pd.DataFrame) -> dict:
    last      = daily.iloc[-1]
    tomorrow  = last['date'] + timedelta(days=1)
    dow       = _weekday(tomorrow)
    dom       = tomorrow.day
    month     = tomorrow.month
    same_dow  = daily[daily['dow'] == dow]['total_debit']
    prev_same = same_dow.iloc[-1] if len(same_dow) else 0

    row = {f: 0 for f in FEATURES}
    row.update({
        'dow': dow, 'dom': dom, 'month': month,
        'is_weekend':          int(dow >= 5),
        'prev_day_spend':      last['total_debit'],
        'prev_week_same_day':  prev_same,
        'rolling_7d_avg':      last['rolling_7d_avg'],
        'rolling_14d_avg':     last['rolling_14d_avg'],
        'total_credit':        0,
    })
    if rf is None:
        prob = 0.0
    else:
        prob = rf.predict_proba(pd.DataFrame([row]))[0][1]
    return {'date': tomorrow, 'prob': prob, 'dow': dow}
