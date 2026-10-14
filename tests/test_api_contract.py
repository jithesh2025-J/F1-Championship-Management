from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_frontend_calls_documented_endpoints():
    js = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    api = (ROOT / "backend" / "api.py").read_text(encoding="utf-8")
    paths = set(re.findall(r"/api/[a-zA-Z0-9_./<{}\-]+", js))
    assert "/api/health" in paths
    assert any("driver-standings" in p for p in paths)
    assert "@api.get(\"/health\")" in api or '@api.get("/health")' in api
    assert "prc_driver_standings" in api


def test_env_example_has_no_real_secret_shape_beyond_placeholder():
    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "change_me" in text
    assert "ORACLE_DSN=" in text


def test_dashboard_contract_has_read_only_data_surfaces():
    api = (ROOT / "backend" / "api.py").read_text(encoding="utf-8")
    js = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    sql = (ROOT / "database" / "06_dashboard_views.sql").read_text(encoding="utf-8")
    for path in (
        "/dashboard/summary",
        "/dashboard/season-overview",
        "/dashboard/progression",
        "/dashboard/race-winners",
        "/dashboard/circuits",
        "/standings/form",
    ):
        assert path in api
    for path in (
        "/api/dashboard/summary",
        "/api/dashboard/season-overview",
        "/api/dashboard/progression",
        "/api/dashboard/race-winners",
        "/api/dashboard/circuits",
    ):
        assert path in js
    assert "v_dashboard_summary" in sql
    assert "v_driver_points_progression" in sql
    assert "v_team_points_progression" in sql


def test_stage4_views_and_endpoints_contract():
    api = (ROOT / "backend" / "api.py").read_text(encoding="utf-8")
    sql = (ROOT / "database" / "08_race_views.sql").read_text(encoding="utf-8")
    assert "/races/<int:race_id>/grid-finish" in api
    assert "/races/<int:race_id>/pit-analysis" in api
    assert "/search" in api
    assert "v_race_grid_finish" in sql
    assert "v_pit_stop_analysis" in sql


def test_stage4_search_endpoint_min_chars(monkeypatch):
    import sys
    sys.path.insert(0, str(ROOT / "backend"))
    from app import create_app
    client = create_app().test_client()

    # Query < 2 chars should return empty list
    res_short = client.get("/api/search?q=a")
    assert res_short.status_code == 200
    assert res_short.get_json() == []

    res_empty = client.get("/api/search")
    assert res_empty.status_code == 200
    assert res_empty.get_json() == []


def test_stage4_endpoints_shape_and_response():
    import sys
    sys.path.insert(0, str(ROOT / "backend"))
    from app import create_app
    client = create_app().test_client()

    # Test search structure
    res = client.get("/api/search?q=Monaco")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "type" in item
        assert "label" in item
        assert "link" in item

    # Test grid-finish structure
    res_gf = client.get("/api/races/1/grid-finish")
    assert res_gf.status_code == 200
    data_gf = res_gf.get_json()
    assert isinstance(data_gf, list)
    if data_gf:
        row = data_gf[0]
        for field in ("grid_position", "finish_position", "positions_gained", "points", "status"):
            assert field in row

    # Test pit-analysis structure
    res_pit = client.get("/api/races/1/pit-analysis")
    assert res_pit.status_code == 200
    data_pit = res_pit.get_json()
    assert isinstance(data_pit, list)
    if data_pit:
        prow = data_pit[0]
        for field in ("stop_count", "fastest_duration", "slowest_duration", "avg_duration"):
            assert field in prow


def test_analytics_endpoints_and_files_contract():
    api = (ROOT / "backend" / "api.py").read_text(encoding="utf-8")
    js = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    sql = (ROOT / "database" / "09_demo_queries.sql").read_text(encoding="utf-8")
    viewer_sql = (ROOT / "scripts" / "create_viewer_user.sql").read_text(encoding="utf-8")

    assert "/analytics/queries" in api
    assert "/analytics/run/<query_id>" in api
    assert "/analytics/console" in api
    assert "/analytics/trigger-demo" in api

    assert "/api/analytics/queries" in js
    assert "/api/analytics/console" in js
    assert "/api/analytics/trigger-demo" in js

    assert "f1_viewer" in viewer_sql
    assert "v_race_grid_finish" in sql
    assert "v_driver_standings" in sql


def test_stage5_profiles_and_views_contract():
    api = (ROOT / "backend" / "api.py").read_text(encoding="utf-8")
    js = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    sql = (ROOT / "database" / "10_profile_views.sql").read_text(encoding="utf-8")

    assert "/drivers/<int:driver_id>/profile" in api
    assert "/teams/<int:team_id>/profile" in api
    assert "/head-to-head" in api
    assert "/seasons/<int:year>/rate-metrics" in api

    assert "/api/drivers/" in js
    assert "/api/teams/" in js
    assert "/api/head-to-head" in js

    assert "v_driver_profile_stats" in sql
    assert "v_head_to_head" in sql
    assert "v_season_rate_metrics" in sql




