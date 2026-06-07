from __future__ import annotations

from fastapi import FastAPI, UploadFile
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import config
from database import get_pool, close_pool
from ml import train_model
from routers import categories, dashboard, flow, log, log_upload, patterns, prediction, recipients, retrain, summary, explore, settings
from routers.utils import combined_dataframe

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    await get_pool()
    await config.load_from_db()
    try:
        df = await combined_dataframe()
        app.state.rf_model = train_model(df)
        print(f"API ready. Model trained on {len(df)} days.")
    except Exception as e:
        app.state.rf_model = None
        print(f"Startup model training failed: {e}")

    yield  # app is now running

    # --- SHUTDOWN ---
    await close_pool()
    print("API shutdown complete")

app = FastAPI(title="Monike API", lifespan=lifespan)

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
app.include_router(settings.router)
app.include_router(recipients.router)
app.include_router(prediction.router)
app.include_router(log.router)
app.include_router(retrain.router)
app.include_router(flow.router)
app.include_router(explore.router)
app.include_router(log_upload.router)

@app.post("/upload")
async def upload_file(file: UploadFile):
    return {
        "filename": file.filename,
        "content_type": file.content_type
    }

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)