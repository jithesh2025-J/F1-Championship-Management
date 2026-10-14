from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def oracle_config() -> dict[str, str]:
    return {
        "user": os.environ.get("ORACLE_USER", ""),
        "password": os.environ.get("ORACLE_PASSWORD", ""),
        "dsn": os.environ.get("ORACLE_DSN", ""),
        "thick": os.environ.get("ORACLE_THICK_MODE", "false"),
    }


def flask_config() -> dict:
    return {
        "host": os.environ.get("FLASK_HOST", "127.0.0.1"),
        "port": int(os.environ.get("FLASK_PORT", "5000")),
        "debug": os.environ.get("FLASK_DEBUG", "true").lower() == "true",
    }


def viewer_oracle_config() -> dict[str, Any]:
    viewer_user = os.environ.get("F1_VIEWER_USER", "").strip()
    viewer_password = os.environ.get("F1_VIEWER_PASSWORD", "").strip()
    base = oracle_config()
    is_dedicated = bool(viewer_user and viewer_password and viewer_password != "change_me")
    return {
        "user": viewer_user if is_dedicated else base["user"],
        "password": viewer_password if is_dedicated else base["password"],
        "dsn": base["dsn"],
        "thick": base["thick"],
        "is_dedicated_viewer": is_dedicated,
    }


def is_dev_console_enabled() -> bool:
    val = os.environ.get("ENABLE_DEV_CONSOLE", "false").strip().lower()
    return val in ("1", "true", "yes", "on")


def admin_api_key() -> str:
    return os.environ.get("ADMIN_API_KEY", "").strip() or os.environ.get("ADMIN_TOKEN", "").strip()
