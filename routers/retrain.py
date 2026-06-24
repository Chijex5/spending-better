# routers/retrain.py
from __future__ import annotations

import time
from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

from cache import invalidate
from config import FEATURES
from ml import apply_config_label, training_features
from routers.utils import execute, combined_dataframe

router = APIRouter()

# Below this many rows, TimeSeriesSplit folds get too small/unstable to trust —
# fall back to a single fit with training-accuracy only (clearly labeled as such).
MIN_ROWS_FOR_SEARCH = 30

PARAM_DISTRIBUTIONS = {
    "n_estimators": [100, 150, 200, 300],
    "max_depth": [3, 5, 7, None],
    "min_samples_leaf": [1, 2, 4, 8],
}


class RetrainResult(BaseModel):
    success: bool
    message: str
    training_rows: int
    accuracy: float
    duration_ms: int
    precision: float | None = None
    recall: float | None = None
    roc_auc: float | None = None


def _fit_simple(X, y) -> tuple[RandomForestClassifier, float]:
    """Small-dataset / search-failure fallback: single fit, training accuracy only."""
    clf = RandomForestClassifier(
        n_estimators=200, max_depth=5, random_state=42, class_weight="balanced",
    )
    clf.fit(X, y)
    accuracy = float(accuracy_score(y, clf.predict(X)))
    return clf, accuracy


def _fit_with_search(X, y) -> tuple[RandomForestClassifier, dict]:
    """
    Time-aware hyperparameter search + true holdout evaluation.

    Scoring optimizes ROC-AUC rather than raw precision: optimizing for
    precision directly invites the degenerate "always predict LOW" model,
    which trivially maximizes precision on the few positives it does call
    while destroying recall. Precision/recall are still computed and
    reported on the holdout fold for visibility.
    """
    splitter = TimeSeriesSplit(n_splits=3)
    search = RandomizedSearchCV(
        RandomForestClassifier(class_weight="balanced", random_state=42),
        param_distributions=PARAM_DISTRIBUTIONS,
        n_iter=15,
        cv=splitter,
        scoring="roc_auc",
        random_state=42,
    )
    search.fit(X, y)

    # True holdout = the most recent chronological fold, fit fresh on only
    # the rows before it (never seen during this evaluation).
    train_idx, holdout_idx = list(splitter.split(X))[-1]
    holdout_model = clone(search.best_estimator_)
    holdout_model.fit(X.iloc[train_idx], y.iloc[train_idx])

    y_holdout = y.iloc[holdout_idx]
    holdout_pred = holdout_model.predict(X.iloc[holdout_idx])
    holdout_proba = holdout_model.predict_proba(X.iloc[holdout_idx])[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_holdout, holdout_pred)),
        "precision": float(precision_score(y_holdout, holdout_pred, zero_division=0)),
        "recall": float(recall_score(y_holdout, holdout_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_holdout, holdout_proba)) if y_holdout.nunique() > 1 else None,
    }

    # search.best_estimator_ is already refit on ALL of X, y with the best
    # hyperparameters found — that's exactly the model we deploy.
    return search.best_estimator_, metrics


async def _persist_metadata(
    training_rows: int,
    version_tag: str,
    accuracy: float,
    precision: float | None,
    recall: float | None,
    roc_auc: float | None,
) -> None:
    await execute(
        """
        INSERT INTO model_metadata
            (trained_at, training_rows, accuracy, model_version, precision_score, recall_score, roc_auc)
        VALUES (NOW(), $1, $2, $3, $4, $5, $6)
        """,
        training_rows,
        round(accuracy, 6),
        version_tag,
        round(precision, 6) if precision is not None else None,
        round(recall, 6) if recall is not None else None,
        round(roc_auc, 6) if roc_auc is not None else None,
    )


@router.post("/retrain", response_model=RetrainResult)
async def retrain_model(request: Request) -> RetrainResult:
    t0 = time.monotonic()

    df = await combined_dataframe()
    if df.empty:
        return RetrainResult(
            success=False,
            message="No training data found.",
            training_rows=0,
            accuracy=0.0,
            duration_ms=0,
        )

    training_rows = len(df)
    # Label against the live config threshold, not the frozen upload-time percentile.
    engineered = training_features(apply_config_label(df))
    X = engineered[FEATURES].fillna(0)
    y = engineered["high_spend"]

    if y.nunique() < 2:
        return RetrainResult(
            success=False,
            message=(
                "Insufficient class variance to train: every day falls on the same "
                "side of the high-spend threshold. Adjust the threshold in settings."
            ),
            training_rows=training_rows,
            accuracy=0.0,
            duration_ms=int((time.monotonic() - t0) * 1000),
        )

    precision = recall = roc_auc = None
    fallback_note = ""

    if training_rows < MIN_ROWS_FOR_SEARCH:
        clf, accuracy = _fit_simple(X, y)
        fallback_note = " (dataset too small for holdout evaluation — training accuracy only)"
    else:
        try:
            clf, metrics = _fit_with_search(X, y)
            accuracy, precision, recall, roc_auc = (
                metrics["accuracy"], metrics["precision"], metrics["recall"], metrics["roc_auc"],
            )
        except ValueError as exc:
            clf, accuracy = _fit_simple(X, y)
            fallback_note = f" (holdout search failed — {exc}; training accuracy only)"

    request.app.state.rf_model = clf

    version_tag = f"v{datetime.utcnow().strftime('%Y%m%d%H%M')}"
    duration_ms = int((time.monotonic() - t0) * 1000)

    await _persist_metadata(training_rows, version_tag, accuracy, precision, recall, roc_auc)

    invalidate("prediction", "dashboard")

    return RetrainResult(
        success=True,
        message=f"Trained on {training_rows} rows in {duration_ms}ms{fallback_note}",
        training_rows=training_rows,
        accuracy=round(accuracy, 6),
        duration_ms=duration_ms,
        precision=round(precision, 6) if precision is not None else None,
        recall=round(recall, 6) if recall is not None else None,
        roc_auc=round(roc_auc, 6) if roc_auc is not None else None,
    )
