from __future__ import annotations
from datetime import timedelta
import pandas as pd
import config
from config import FEATURES
from sklearn.ensemble import RandomForestClassifier


def _weekday(value) -> int:
    if hasattr(value, "dayofweek"):
        return int(value.dayofweek)
    return int(value.weekday())


def apply_config_label(daily: pd.DataFrame) -> pd.DataFrame:
    """
    Recompute the `high_spend` label from the live config threshold instead
    of the percentile frozen at upload time. This keeps what the model learns
    consistent with the threshold the user controls via /settings (changing it
    triggers a retrain), and makes the label stationary — a fixed naira bar
    rather than a moving quantile that drifts as spending habits change.

    Reads config.HIGH_SPEND_THRESHOLD at call time (not import time) so a live
    settings change is always reflected on the next retrain.
    """
    if daily.empty or "total_debit" not in daily.columns:
        return daily
    df = daily.copy()
    df["high_spend"] = (df["total_debit"] > config.HIGH_SPEND_THRESHOLD).astype(int)
    return df


def training_features(daily: pd.DataFrame) -> pd.DataFrame:
    """
    Leak-free, per-row historical features for fitting the model.
    Every aggregate for a row at date D is computed using only rows
    strictly before D (shift(1) + expanding), so the model never sees
    same-day or future information — including the last 7 days, which
    may not be logged yet by the time a prediction is requested.
    """
    df = daily.sort_values("date").reset_index(drop=True).copy()

    # Filled to 0 immediately (not at the end) — the per-bucket columns below
    # fall back to this same series, so it must already be NaN-free or the
    # very first row (which has no prior history in any bucket) stays NaN too.
    df["overall_avg_spend"] = df["total_debit"].shift(1).expanding().mean().fillna(0.0)

    for key, col in (("dow", "dow_avg_spend"), ("dom", "dom_avg_spend"), ("month", "month_avg_spend")):
        df[col] = df.groupby(key)["total_debit"].transform(
            lambda s: s.shift(1).expanding().mean()
        )
        df[col] = df[col].fillna(df["overall_avg_spend"])

    df["dow_high_spend_rate"] = df.groupby("dow")["high_spend"].transform(
        lambda s: s.shift(1).expanding().mean()
    ).fillna(0.0)

    start = df["date"].min()
    df["days_since_start"] = df["date"].apply(lambda d: (d - start).days)

    return df


def historical_snapshot(daily: pd.DataFrame) -> dict:
    """
    Historical-average lookups computed from ALL currently known rows.
    Safe at inference time: a prediction for a future date can never
    leak into a snapshot built purely from past/real rows.
    """
    df = daily.sort_values("date").reset_index(drop=True)
    overall_avg_spend = float(df["total_debit"].mean()) if not df.empty else 0.0

    return {
        "overall_avg_spend": overall_avg_spend,
        "dow_avg_spend": df.groupby("dow")["total_debit"].mean().to_dict() if not df.empty else {},
        "dom_avg_spend": df.groupby("dom")["total_debit"].mean().to_dict() if not df.empty else {},
        "month_avg_spend": df.groupby("month")["total_debit"].mean().to_dict() if not df.empty else {},
        "dow_high_spend_rate": df.groupby("dow")["high_spend"].mean().to_dict() if not df.empty else {},
        "start_date": df["date"].min() if not df.empty else None,
        "last_date": df["date"].max() if not df.empty else None,
    }


def build_feature_row(snapshot: dict, target_date) -> dict:
    dow = _weekday(target_date)
    dom = target_date.day
    month = target_date.month
    overall = snapshot["overall_avg_spend"]
    start_date = snapshot.get("start_date")
    days_since_start = (target_date - start_date).days if start_date is not None else 0

    return {
        "dow": dow,
        "dom": dom,
        "month": month,
        "is_weekend": int(dow >= 5),
        "dow_avg_spend": float(snapshot["dow_avg_spend"].get(dow, overall)),
        "dom_avg_spend": float(snapshot["dom_avg_spend"].get(dom, overall)),
        "month_avg_spend": float(snapshot["month_avg_spend"].get(month, overall)),
        "overall_avg_spend": float(overall),
        "days_since_start": int(days_since_start),
        "dow_high_spend_rate": float(snapshot["dow_high_spend_rate"].get(dow, 0.0)),
    }


def train_model(daily: pd.DataFrame):
    if daily.empty:
        return None

    required = {"date", "total_debit", "dow", "dom", "month"}
    missing = required - set(daily.columns)
    if missing:
        raise ValueError(f"Missing training columns: {', '.join(sorted(missing))}")

    daily = apply_config_label(daily)
    df = training_features(daily)
    X = df[FEATURES].fillna(0)
    y = df["high_spend"]

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


def predict_tomorrow(rf, daily: pd.DataFrame) -> dict:
    snapshot = historical_snapshot(daily)
    last_date = snapshot["last_date"]
    tomorrow = last_date + timedelta(days=1)
    row = build_feature_row(snapshot, tomorrow)

    if rf is None:
        prob = 0.0
    else:
        prob = rf.predict_proba(pd.DataFrame([row])[FEATURES])[0][1]

    return {"date": tomorrow, "prob": prob, "dow": row["dow"]}


def predict_week_outlook(rf, daily: pd.DataFrame, n_days: int = 7) -> list[dict]:
    """
    Day+1..day+n_days predictions from the same trained model and the
    same historical snapshot used by predict_tomorrow — each day is an
    independent lookup against the historical pattern for its own
    dow/dom/month, with no dependency on the most recent real rows.
    """
    if daily.empty:
        return []

    snapshot = historical_snapshot(daily)
    last_date = snapshot["last_date"]

    outlook = []
    for offset in range(1, n_days + 1):
        target_date = last_date + timedelta(days=offset)
        row = build_feature_row(snapshot, target_date)
        if rf is None:
            prob = 0.0
        else:
            prob = float(rf.predict_proba(pd.DataFrame([row])[FEATURES])[0][1])
        outlook.append({
            "date": target_date,
            "dow": row["dow"],
            "probability": prob,
            "avg_spend": row["dow_avg_spend"],
        })
    return outlook
