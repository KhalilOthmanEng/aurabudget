"""
AuraBudget — FastAPI Application (Desktop Edition)
Serves both the API and the built React frontend as static files.
Run with: uvicorn app.main:app --port 48732
"""

import asyncio
import os
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from app import settings as app_settings
from app.database import init_db
from app.routers.api import transactions_router, analytics_router, categories_router
from app.routers.assets import assets_router

load_dotenv()

IS_DESKTOP = os.getenv("AURABUDGET_DESKTOP") == "1"
PORT = int(os.getenv("AURABUDGET_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# Resolve frontend dist directory
if getattr(sys, "frozen", False):
    _base = Path(sys._MEIPASS)
else:
    _base = Path(__file__).resolve().parent.parent
FRONTEND_DIR = _base / "frontend_dist"

# Fallback for dev mode
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load settings from file at startup
    app_settings.reload()

    await init_db()
    print("[OK] Database initialized")

    if bool(app_settings.get("telegram_bot_token")):
        try:
            from app.services.telegram_bot import run_bot
            bot_thread = threading.Thread(target=run_bot, daemon=True, name="telegram-bot")
            bot_thread.start()
            print("[OK] Telegram bot started in background thread")
        except Exception as e:
            print(f"[WARN] Telegram bot failed to start: {e}")

    yield
    print("[INFO] AuraBudget shutting down")


app = FastAPI(
    title="AuraBudget API",
    description="AI-powered personal finance tracker backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if IS_DESKTOP else CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(assets_router, prefix="/api")


@app.get("/api/settings/status")
async def settings_status():
    """Return which integrations are configured (no secrets exposed)."""
    return {
        "gemini_configured": bool(app_settings.get("gemini_api_key")),
        "telegram_configured": bool(app_settings.get("telegram_bot_token")),
        "gocardless_configured": bool(app_settings.get("gocardless_secret_id")),
        "is_desktop": app_settings.is_desktop(),
    }


@app.post("/api/settings/reload")
async def reload_settings():
    """Re-read settings.json and reconfigure services without restarting."""
    old_settings = app_settings.get_all().copy()
    new_settings = app_settings.reload()

    errors = []

    # Reconfigure Gemini if key changed
    old_gemini = old_settings.get("gemini_api_key", "")
    new_gemini = new_settings.get("gemini_api_key", "")
    if new_gemini != old_gemini:
        try:
            from app.services.gemini_service import reconfigure
            reconfigure(new_gemini)
        except Exception as e:
            errors.append(f"Gemini: {e}")

    # Restart Telegram bot if token changed
    old_tg = old_settings.get("telegram_bot_token", "")
    new_tg = new_settings.get("telegram_bot_token", "")
    if new_tg != old_tg:
        try:
            from app.services.telegram_bot import restart_bot
            restart_bot()
        except Exception as e:
            errors.append(f"Telegram: {e}")

    return {
        "status": "ok" if not errors else "partial",
        "errors": errors,
        "gemini_configured": bool(app_settings.get("gemini_api_key")),
        "telegram_configured": bool(app_settings.get("telegram_bot_token")),
        "gocardless_configured": bool(app_settings.get("gocardless_secret_id")),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AuraBudget", "desktop": IS_DESKTOP}


# ── Serve built React frontend ───────────────────────────────────
if FRONTEND_DIR.exists() and FRONTEND_DIR.is_dir():
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "health":
            return
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"error": "Frontend not built"}

    print(f"[OK] Serving frontend from: {FRONTEND_DIR}")
else:
    print(f"[WARN] Frontend not found at {FRONTEND_DIR} - API-only mode")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=PORT, log_level="info")
