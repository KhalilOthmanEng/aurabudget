"""
AuraBudget — Centralized settings reader.
In desktop mode reads settings.json from SETTINGS_PATH env var.
In web mode falls back to environment variables.
"""

import json
import os
import threading
from pathlib import Path

_lock = threading.Lock()
_cache: dict | None = None

_KEY_TO_ENV = {
    "gemini_api_key": "GEMINI_API_KEY",
    "telegram_bot_token": "TELEGRAM_BOT_TOKEN",
    "telegram_allowed_user_id": "TELEGRAM_ALLOWED_USER_ID",
    "gocardless_secret_id": "GOCARDLESS_SECRET_ID",
    "gocardless_secret_key": "GOCARDLESS_SECRET_KEY",
    "monthly_budget": "MONTHLY_BUDGET",
    "currency": "CURRENCY",
}


def _settings_path() -> Path | None:
    p = os.getenv("SETTINGS_PATH")
    return Path(p) if p else None


def _load_file() -> dict:
    p = _settings_path()
    if p and p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def reload() -> dict:
    """Force re-read settings.json from disk. Thread-safe."""
    global _cache
    with _lock:
        _cache = _load_file()
        return dict(_cache)


def get_all() -> dict:
    """Return all settings (cached). Call reload() first if freshness needed."""
    global _cache
    if _cache is None:
        return reload()
    return dict(_cache)


def get(key: str, default="") -> str:
    """
    Get a single setting value.
    Desktop mode: read from settings.json cache.
    Web mode (no SETTINGS_PATH): fall back to env var.
    """
    if _settings_path():
        val = get_all().get(key)
        if val is None:
            return str(default)
        return str(val).strip()
    env_key = _KEY_TO_ENV.get(key, key.upper())
    return os.getenv(env_key, str(default))


def is_desktop() -> bool:
    return os.getenv("AURABUDGET_DESKTOP") == "1"
