# Called: when user taps "Retrain Model" in Log screen
#         or Settings. Returns immediately, runs in background.
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Request

from cache import invalidate
from ml import train_model
from models import RetrainQueuedResponse
from routers.utils import combined_dataframe

router = APIRouter()


async def _fetch_training_frame():
    return await combined_dataframe()


async def _retrain_background(request: Request) -> None:
    df = await _fetch_training_frame()
    model = train_model(df)
    request.app.state.rf_model = model
    invalidate("prediction")
    print(f"Model retrained on {len(df)} days")


async def _fetch_retrain(background_tasks: BackgroundTasks, request: Request) -> RetrainQueuedResponse:
    background_tasks.add_task(_retrain_background, request)
    return RetrainQueuedResponse(status="queued")


@router.post("/retrain", response_model=RetrainQueuedResponse)
async def post_retrain(background_tasks: BackgroundTasks, request: Request) -> RetrainQueuedResponse:
    return await _fetch_retrain(background_tasks, request)
