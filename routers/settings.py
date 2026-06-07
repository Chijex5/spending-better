"""
routers/settings.py
───────────────────
GET  /settings        — fetch persisted user settings
POST /settings        — upsert user settings, propagates threshold to config
GET  /model/status    — RandomForest metadata (trained?, accuracy, training rows)
POST /cache/clear     — manually blow away all in-process caches
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
import config as cfg
from cache import invalidate, invalidate_all
from routers.utils import execute, fetch_row

router = APIRouter()


# ─── Models ───────────────────────────────────────────────────────────────────

class SettingsRead(BaseModel):
    display_name: str
    email: str
    monthly_budget: float
    high_spend_threshold: float
    notify_high_spend: bool
    notify_weekly_summary: bool
    notify_model_updates: bool


class SettingsWrite(BaseModel):
    display_name: str
    email: str
    monthly_budget: float
    high_spend_threshold: float
    notify_high_spend: bool
    notify_weekly_summary: bool
    notify_model_updates: bool


class ModelStatusResponse(BaseModel):
    trained: bool
    last_trained_at: str | None
    training_rows: int
    accuracy: float | None
    model_version: str


class CacheClearResponse(BaseModel):
    cleared: bool


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=SettingsRead)
async def get_settings() -> SettingsRead:
    row = await fetch_row("SELECT * FROM user_settings ORDER BY id DESC LIMIT 1")
    if row is None:
        # Sensible defaults on first launch
        return SettingsRead(
            display_name="Chijioke",
            email="chijioke@monike.app",
            monthly_budget=0,
            high_spend_threshold=5000,
            notify_high_spend=True,
            notify_weekly_summary=True,
            notify_model_updates=False,
        )
    return SettingsRead(
        display_name=str(row["display_name"]),
        email=str(row["email"]),
        monthly_budget=float(row["monthly_budget"]),
        high_spend_threshold=float(row["high_spend_threshold"]),
        notify_high_spend=bool(row["notify_high_spend"]),
        notify_weekly_summary=bool(row["notify_weekly_summary"]),
        notify_model_updates=bool(row["notify_model_updates"]),
    )


@router.post("/settings", response_model=SettingsRead)
async def post_settings(body: SettingsWrite) -> SettingsRead:
    await execute(
        """
        INSERT INTO user_settings (
          display_name, email, monthly_budget, high_spend_threshold,
          notify_high_spend, notify_weekly_summary, notify_model_updates,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (singleton_key) DO UPDATE SET
          display_name         = EXCLUDED.display_name,
          email                = EXCLUDED.email,
          monthly_budget       = EXCLUDED.monthly_budget,
          high_spend_threshold = EXCLUDED.high_spend_threshold,
          notify_high_spend    = EXCLUDED.notify_high_spend,
          notify_weekly_summary = EXCLUDED.notify_weekly_summary,
          notify_model_updates = EXCLUDED.notify_model_updates,
          updated_at           = NOW()
        """,
        body.display_name,
        body.email,
        body.monthly_budget,
        body.high_spend_threshold,
        body.notify_high_spend,
        body.notify_weekly_summary,
        body.notify_model_updates,
    )

    # Propagate threshold into the running config so predictions are live
    cfg.HIGH_SPEND_THRESHOLD = body.high_spend_threshold
    cfg.MONTHLY_BUDGET = body.monthly_budget
    invalidate("dashboard", "prediction", "spend_health", "explore_months")
    return await get_settings()


@router.get("/model/status", response_model=ModelStatusResponse)
async def get_model_status() -> ModelStatusResponse:
    row = await fetch_row(
        "SELECT * FROM model_metadata ORDER BY trained_at DESC LIMIT 1"
    )
    if row is None:
        return ModelStatusResponse(
            trained=False,
            last_trained_at=None,
            training_rows=0,
            accuracy=None,
            model_version="v0",
        )
    return ModelStatusResponse(
        trained=True,
        last_trained_at=str(row["trained_at"]),
        training_rows=int(row["training_rows"]),
        accuracy=float(row["accuracy"]) if row["accuracy"] is not None else None,
        model_version=str(row["model_version"]),
    )


@router.post("/cache/clear", response_model=CacheClearResponse)
async def clear_cache() -> CacheClearResponse:
    invalidate_all()
    return CacheClearResponse(cleared=True)