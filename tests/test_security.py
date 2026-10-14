from __future__ import annotations

import os
from pathlib import Path
import sys
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402
from config import admin_api_key  # noqa: E402

client = create_app().test_client()


def test_unauthenticated_writes_are_rejected():
    """Verify all mutating endpoints reject unauthenticated requests with HTTP 401."""
    unauthenticated_requests = [
        ("post", "/api/races", {"round_number": 1}),
        ("put", "/api/races/1", {"race_name": "Test"}),
        ("delete", "/api/races/1", None),
        ("post", "/api/races/1/results", {"driver_id": 1}),
        ("put", "/api/results/1", {"points": 10}),
        ("delete", "/api/results/1", None),
        ("post", "/api/races/1/qualifying", {"driver_id": 1}),
        ("put", "/api/qualifying/1", {"position": 1}),
        ("delete", "/api/qualifying/1", None),
        ("post", "/api/races/1/verify", None),
        ("post", "/api/races/1/unverify", None),
        ("post", "/api/drivers", {"first_name": "Test"}),
        ("put", "/api/drivers/1", {"notes": "Test"}),
        ("post", "/api/teams", {"team_name": "Test"}),
        ("put", "/api/teams/1", {"notes": "Test"}),
        ("post", "/api/circuits", {"circuit_name": "Test"}),
        ("post", "/api/seasons/2026/driver-contracts", {"driver_id": 1}),
        ("post", "/api/sponsors", {"sponsor_name": "Test"}),
        ("put", "/api/sponsors/1", {"sponsor_name": "Test"}),
        ("delete", "/api/sponsors/1", None),
        ("post", "/api/team-sponsors", {"team_id": 1}),
        ("delete", "/api/team-sponsors/1/1/2025", None),
        ("post", "/api/penalties", {"penalty_type": "Grid"}),
        ("delete", "/api/penalties/1", None),
    ]

    for method, path, payload in unauthenticated_requests:
        call = getattr(client, method)
        kwargs = {"json": payload} if payload is not None else {}
        res = call(path, **kwargs)
        assert res.status_code == 401, f"Expected 401 for {method.upper()} {path}, got {res.status_code}"
        assert "Unauthorized" in res.get_json().get("error", "")
        assert "WWW-Authenticate" in res.headers


def test_invalid_token_is_rejected():
    """Verify that providing an incorrect token receives HTTP 401."""
    bad_headers = [
        {"X-Admin-Token": "invalid_wrong_token"},
        {"Authorization": "Bearer bad_secret_key"},
        {"X-API-Key": "wrong_key"},
    ]
    for h in bad_headers:
        res = client.post("/api/races", json={"round_number": 1}, headers=h)
        assert res.status_code == 401
        assert "Unauthorized" in res.get_json()["error"]


def test_authorized_admin_accepts_token_formats():
    """Verify valid token is accepted via X-Admin-Token, Authorization Bearer, and X-API-Key."""
    key = admin_api_key()
    assert key, "ADMIN_API_KEY must be configured for test"

    valid_headers = [
        {"X-Admin-Token": key},
        {"Authorization": f"Bearer {key}"},
        {"X-API-Key": key},
    ]

    for h in valid_headers:
        # A valid call with bad payload reaches validation (400), proving authentication passed
        res = client.post("/api/races", json={}, headers=h)
        assert res.status_code == 400, f"Expected 400 validation error (past auth), got {res.status_code}"
        assert "required" in res.get_json()["error"].lower()


def test_production_dev_console_flag_disabled(monkeypatch):
    """Verify /api/analytics/console and /api/analytics/trigger-demo are disabled when ENABLE_DEV_CONSOLE=false."""
    monkeypatch.setenv("ENABLE_DEV_CONSOLE", "false")

    # Console is blocked with 403 Forbidden even from localhost
    res_console = client.post(
        "/api/analytics/console",
        json={"sql": "SELECT 1 FROM dual"},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert res_console.status_code == 403
    assert "disabled in production" in res_console.get_json()["error"]

    # Trigger demo is blocked with 403 Forbidden even from localhost
    res_demo = client.post(
        "/api/analytics/trigger-demo",
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert res_demo.status_code == 403
    assert "disabled in production" in res_demo.get_json()["error"]


def test_dev_console_enabled_still_enforces_localhost(monkeypatch):
    """Verify that even when ENABLE_DEV_CONSOLE=true, remote access is strictly blocked."""
    monkeypatch.setenv("ENABLE_DEV_CONSOLE", "true")

    # Remote access rejected
    res_remote = client.post(
        "/api/analytics/console",
        json={"sql": "SELECT 1 FROM dual"},
        environ_overrides={"REMOTE_ADDR": "192.168.1.100"},
    )
    assert res_remote.status_code == 403
    assert "127.0.0.1" in res_remote.get_json()["error"]

    # Localhost access permitted
    res_local = client.post(
        "/api/analytics/console",
        json={"sql": "SELECT 1 FROM dual"},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert res_local.status_code == 200
    assert len(res_local.get_json()["rows"]) == 1


def test_public_read_only_endpoints_accessible_without_auth():
    """Verify public read-only views, standings, profiles, and query runner remain open without auth."""
    public_endpoints = [
        ("get", "/api/health"),
        ("get", "/api/seasons"),
        ("get", "/api/dashboard/summary"),
        ("get", "/api/seasons/2025/driver-standings"),
        ("get", "/api/seasons/2025/constructor-standings"),
        ("get", "/api/drivers/182/profile"),
        ("get", "/api/teams/55/profile"),
        ("get", "/api/analytics/queries"),
        ("post", "/api/analytics/run/top-drivers-2025-wins"),  # Stored gallery query execution
    ]

    for method, path in public_endpoints:
        call = getattr(client, method)
        res = call(path)
        assert res.status_code == 200, f"Expected 200 for public read {method.upper()} {path}, got {res.status_code}"


def test_user_creation_scripts_have_no_hardcoded_passwords_and_use_substitution():
    """Verify create_app_user.sql and create_viewer_user.sql use safe substitution without default passwords."""
    app_sql = (ROOT / "scripts" / "create_app_user.sql").read_text(encoding="utf-8")
    viewer_sql = (ROOT / "scripts" / "create_viewer_user.sql").read_text(encoding="utf-8")

    # Known previous hardcoded credentials must not appear anywhere in the scripts
    for old_secret in ["F1App_College_2026", "Jithesh_26.", "F1Viewer_ReadOnly_2026"]:
        assert old_secret not in app_sql, "Found hardcoded credential in create_app_user.sql"
        assert old_secret not in viewer_sql, "Found hardcoded credential in create_viewer_user.sql"

    # Both scripts must use ACCEPT with HIDE
    assert "ACCEPT app_password CHAR PROMPT" in app_sql
    assert "HIDE" in app_sql
    assert "ACCEPT viewer_password CHAR PROMPT" in viewer_sql
    assert "HIDE" in viewer_sql

    # Must NOT provide a default password in ACCEPT
    assert "DEFAULT " not in app_sql.split("ACCEPT")[1].split("\n")[0].upper()
    assert "DEFAULT " not in viewer_sql.split("ACCEPT")[1].split("\n")[0].upper()

    # Must use substitution variables in CREATE/ALTER USER statements
    assert "&app_password" in app_sql
    assert "&viewer_password" in viewer_sql

    # create_viewer_user.sql must have valid corrected ALTER USER syntax
    assert "ALTER USER f1_viewer IDENTIFIED BY" in viewer_sql
    assert "ALTER USER f1_viewer Jithesh_26." not in viewer_sql

    # Must suppress variable expansion echo and clean up substitution variable
    assert "SET VERIFY OFF" in app_sql
    assert "UNDEFINE app_password" in app_sql
    assert "SET VERIFY OFF" in viewer_sql
    assert "UNDEFINE viewer_password" in viewer_sql

