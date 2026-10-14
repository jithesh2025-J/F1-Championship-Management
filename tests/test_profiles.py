from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402

client = create_app().test_client()


def test_driver_profile_endpoint():
    # 1. Existing driver: Lando Norris (id 182)
    res = client.get("/api/drivers/182/profile")
    assert res.status_code == 200
    data = res.get_json()

    assert data["driver_id"] == 182
    assert data["last_name"] == "Norris"
    assert "career" in data
    assert "seasons" in data
    assert "rounds" in data

    career = data["career"]
    for key in ("starts", "wins", "podiums", "poles", "points", "dnfs", "win_rate", "win_pct", "podium_rate", "podium_pct", "dnf_rate", "dnf_pct"):
        assert key in career

    assert len(data["seasons"]) >= 3
    s2025 = next((s for s in data["seasons"] if s["season_year"] == 2025), None)
    assert s2025 is not None
    assert s2025["points"] == 423
    assert s2025["wins"] == 7
    assert s2025["podiums"] == 18
    assert s2025["poles"] == 7
    assert s2025["dnfs"] == 3
    assert s2025["starts"] == 24
    assert s2025["championship_position"] == 1
    assert "win_pct" in s2025
    assert "podium_pct" in s2025
    assert "dnf_pct" in s2025

    # Check rounds for sparkline
    assert len(data["rounds"]) > 0
    assert "points" in data["rounds"][0]
    assert "finish_position" in data["rounds"][0]

    # 2. Non-existent driver 404
    res_404 = client.get("/api/drivers/999999/profile")
    assert res_404.status_code == 404
    assert "error" in res_404.get_json()


def test_team_profile_endpoint():
    # 1. Existing team: McLaren (id 55)
    res = client.get("/api/teams/55/profile")
    assert res.status_code == 200
    data = res.get_json()

    assert data["team_id"] == 55
    assert data["team_name"] == "McLaren"
    assert "career" in data
    assert "seasons" in data
    assert "drivers" in data

    assert data["career"]["points"] > 0
    assert data["career"]["seasons_count"] >= 3

    # Check 2025 constructor standings
    s2025 = next((s for s in data["seasons"] if s["season_year"] == 2025), None)
    assert s2025 is not None
    assert s2025["points"] == 833
    assert s2025["championship_position"] == 1

    # Check driver contributions
    drivers_2025 = [d for d in data["drivers"] if d["season_year"] == 2025]
    assert len(drivers_2025) >= 2
    for d in drivers_2025:
        assert "driver_name" in d
        assert "points" in d
        assert "contribution_pct" in d
        assert d["contribution_pct"] > 0

    # 2. Non-existent team 404
    res_404 = client.get("/api/teams/999999/profile")
    assert res_404.status_code == 404
    assert "error" in res_404.get_json()


def test_head_to_head_endpoint():
    # 1. 2024 Norris (182) vs Verstappen (192)
    res = client.get("/api/head-to-head?season=2024&driver_a=182&driver_b=192")
    assert res.status_code == 200
    data = res.get_json()

    assert data["season_year"] == 2024
    assert data["driver_a"]["name"] == "Lando Norris"
    assert data["driver_b"]["name"] == "Max Verstappen"

    assert data["driver_a"]["points"] == 374
    assert data["driver_b"]["points"] == 437
    assert data["driver_a"]["wins"] == 4
    assert data["driver_b"]["wins"] == 9
    assert data["driver_a"]["podiums"] == 13
    assert data["driver_b"]["podiums"] == 14
    assert data["driver_a"]["races_ahead"] == 10
    assert data["driver_b"]["races_ahead"] == 14
    assert data["driver_a"]["quali_ahead"] == 10
    assert data["driver_b"]["quali_ahead"] == 14

    assert "metrics" in data
    assert len(data["metrics"]) == 6
    metric_keys = {m["key"] for m in data["metrics"]}
    assert {"points", "wins", "podiums", "races_ahead", "quali_ahead", "avg_finish"}.issubset(metric_keys)

    # 2. Missing params -> 400
    assert client.get("/api/head-to-head?season=2024&driver_a=182").status_code == 400
    assert client.get("/api/head-to-head?driver_a=182&driver_b=192").status_code == 400

    # 3. Same driver -> 400
    assert client.get("/api/head-to-head?season=2024&driver_a=182&driver_b=182").status_code == 400

    # 4. Unknown drivers / no head-to-head -> 404
    assert client.get("/api/head-to-head?season=2024&driver_a=99999&driver_b=192").status_code == 404


def test_season_rate_metrics_endpoint():
    # 1. 2025 season rate metrics
    res = client.get("/api/seasons/2025/rate-metrics")
    assert res.status_code == 200
    rows = res.get_json()
    assert isinstance(rows, list)
    assert len(rows) > 0

    norris = next((r for r in rows if r["last_name"] == "Norris"), None)
    assert norris is not None
    assert norris["starts"] == 24
    assert norris["wins"] == 7
    assert norris["podiums"] == 18
    assert norris["dnfs"] == 3
    assert norris["points"] == 423
    assert norris["win_pct"] == 29.17
    assert norris["podium_pct"] == 75.0
    assert norris["dnf_pct"] == 12.5

    # 2. Year with no records -> empty list
    res_empty = client.get("/api/seasons/1950/rate-metrics")
    assert res_empty.status_code == 200
    assert res_empty.get_json() == []


def test_profile_views_sql_contract():
    sql = (ROOT / "database" / "10_profile_views.sql").read_text(encoding="utf-8")
    assert "v_driver_profile_stats" in sql
    assert "v_head_to_head" in sql
    assert "v_season_rate_metrics" in sql
    assert "classification_status" in sql
    assert "qualifying_result" in sql


def test_seasons_overview_cards_endpoint():
    res = client.get("/api/seasons/overview-cards")
    assert res.status_code == 200
    rows = res.get_json()
    assert isinstance(rows, list)
    assert len(rows) >= 3
    s2025 = next((s for s in rows if s["season_year"] == 2025), None)
    assert s2025 is not None
    assert s2025["race_count"] == 24
    assert s2025["champ_driver_name"] == "Lando Norris"
    assert s2025["champ_driver_points"] == 423
    assert s2025["champ_team_name"] == "McLaren"
    assert s2025["champ_team_points"] == 833


def test_season_driver_cards_endpoint():
    res = client.get("/api/seasons/2025/driver-cards")
    assert res.status_code == 200
    rows = res.get_json()
    assert isinstance(rows, list)
    assert len(rows) == 21
    norris = next((d for d in rows if d["driver_code"] == "NOR"), None)
    assert norris is not None
    assert norris["team_name"] == "McLaren"
    assert norris["points"] == 423
    assert norris["wins"] == 7
    assert norris["championship_position"] == 1


def test_season_team_cards_endpoint():
    res = client.get("/api/seasons/2025/team-cards")
    assert res.status_code == 200
    rows = res.get_json()
    assert isinstance(rows, list)
    assert len(rows) == 10
    mclaren = next((t for t in rows if t["team_name"] == "McLaren"), None)
    assert mclaren is not None
    assert mclaren["points"] == 833
    assert mclaren["championship_position"] == 1
    assert "drivers" in mclaren
    assert len(mclaren["drivers"]) >= 2
