from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import get_pool
from ml import train_model
from routers import categories, dashboard, flow, log, patterns, prediction, recipients, retrain, summary
from routers.utils import combined_dataframe

app = FastAPI(title="Monike API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(dashboard.router)
app.include_router(summary.router)
app.include_router(categories.router)
app.include_router(patterns.router)
app.include_router(recipients.router)
app.include_router(prediction.router)
app.include_router(log.router)
app.include_router(retrain.router)
app.include_router(flow.router)


@app.on_event("startup")
async def startup() -> None:
    await get_pool()
    df = await combined_dataframe()
    app.state.rf_model = train_model(df)
    print(f"Monike API ready. Model trained on {len(df)} days.")
