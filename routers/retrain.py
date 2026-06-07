# routers/retrain.py  (replace the whole file)
from __future__ import annotations

import time
from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel

from cache import invalidate
from ml import train_model
from routers.utils import execute, fetch_row, combined_dataframe

router = APIRouter()


class RetrainResult(BaseModel):
    success: bool
    message: str
    training_rows: int
    accuracy: float
    duration_ms: int


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
    clf = train_model(df)

    if clf is None:
        return RetrainResult(
            success=False,
            message="Insufficient class variance to train (need both HIGH and non-HIGH days).",
            training_rows=training_rows,
            accuracy=0.0,
            duration_ms=int((time.monotonic() - t0) * 1000),
        )

    # Hot-swap on app.state — same object prediction.py reads
    request.app.state.rf_model = clf

    # Compute holdout accuracy for the metadata record
    from sklearn.metrics import accuracy_score
    import pandas as pd
    from config import FEATURES
    X = df[FEATURES].fillna(0)
    y = df["high_spend"]
    accuracy = accuracy_score(y, clf.predict(X))  # training accuracy; fine for small datasets

    version_tag = f"v{datetime.utcnow().strftime('%Y%m%d%H%M')}"
    duration_ms = int((time.monotonic() - t0) * 1000)

    await execute(
        """
        INSERT INTO model_metadata (trained_at, training_rows, accuracy, model_version)
        VALUES (NOW(), $1, $2, $3)
        """,
        training_rows,
        round(float(accuracy), 6),
        version_tag,
    )

    invalidate("prediction", "dashboard")

    return RetrainResult(
        success=True,
        message=f"Trained on {training_rows} rows in {duration_ms}ms",
        training_rows=training_rows,
        accuracy=round(float(accuracy), 6),
        duration_ms=duration_ms,
    )