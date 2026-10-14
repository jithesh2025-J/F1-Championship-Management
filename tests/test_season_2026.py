from __future__ import annotations

from pathlib import Path
import sys
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402
from config import admin_api_key  # noqa: E402
import db  # noqa: E402


class AdminTestClient:
    def __init__(self, raw_client):
        self._c = raw_client

    def _headers(self, headers):
        h = {"X-Admin-Token": admin_api_key() or "f1_admin_dev_token_2026"}
        if headers:
            h.update(headers)
        return h

    def get(self, *args, **kwargs):
        return self._c.get(*args, **kwargs)

    def post(self, *args, **kwargs):
        kwargs["headers"] = self._headers(kwargs.get("headers"))
        return self._c.post(*args, **kwargs)

    def put(self, *args, **kwargs):
        kwargs["headers"] = self._headers(kwargs.get("headers"))
        return self._c.put(*args, **kwargs)

    def delete(self, *args, **kwargs):
        kwargs["headers"] = self._headers(kwargs.get("headers"))
        return self._c.delete(*args, **kwargs)


client = AdminTestClient(create_app().test_client())


@pytest.fixture(autouse=True)
def cleanup_2026_test_data():
    """Ensure any 2026 test races created during test runs are cleanly wiped before and after test."""
    def wipe():
        with db.connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                DELETE FROM qualifying_result
                WHERE race_id IN (SELECT race_id FROM race WHERE season_year = 2026 AND source_system = 'MANUAL')
                """
            )
            cur.execute(
                """
                DELETE FROM race_result
                WHERE race_id IN (SELECT race_id FROM race WHERE season_year = 2026 AND source_system = 'MANUAL')
                """
            )
            cur.execute("DELETE FROM race WHERE season_year = 2026 AND source_system = 'MANUAL'")
            conn.commit()

    wipe()
    yield
    wipe()


@pytest.fixture
def sample_entities():
    circuits = db.query("SELECT circuit_id FROM circuit ORDER BY circuit_id FETCH FIRST 2 ROWS ONLY")
    teams = db.query("SELECT team_id FROM team ORDER BY team_id FETCH FIRST 2 ROWS ONLY")
    drivers = db.query("SELECT driver_id FROM driver ORDER BY driver_id FETCH FIRST 2 ROWS ONLY")
    return {
        "circuit_1": circuits[0]["circuit_id"],
        "circuit_2": circuits[1]["circuit_id"] if len(circuits) > 1 else circuits[0]["circuit_id"],
        "team_1": teams[0]["team_id"],
        "team_2": teams[1]["team_id"] if len(teams) > 1 else teams[0]["team_id"],
        "driver_1": drivers[0]["driver_id"],
        "driver_2": drivers[1]["driver_id"] if len(drivers) > 1 else drivers[0]["driver_id"],
    }


def test_2026_season_and_management_status():
    """Verify 2026 season exists, is flagged as manual entry, and returns KPI counts."""
    res = client.get("/api/seasons")
    assert res.status_code == 200
    seasons = res.get_json()
    s2026 = next((s for s in seasons if s["season_year"] == 2026), None)
    assert s2026 is not None, "2026 season must exist in season list"
    assert "manual" in (s2026.get("notes") or "").lower()

    status_res = client.get("/api/seasons/2026/management-status")
    assert status_res.status_code == 200
    status = status_res.get_json()
    assert status["season_year"] == 2026
    assert status["is_manual"] is True
    assert "total_races" in status
    assert "verified_results" in status
    assert "unverified_results" in status
    assert "total_qualifying" in status


def test_create_2026_race_and_reject_duplicates(sample_entities):
    """Test scheduling 2026 race and validating round constraints and duplicate rejections."""
    c1 = sample_entities["circuit_1"]
    c2 = sample_entities["circuit_2"]

    # 1. Missing required fields -> 400
    bad_res = client.post("/api/races", json={"season_year": 2026, "round_number": 1})
    assert bad_res.status_code == 400

    # 2. Invalid round (>30 or <1) -> 400
    out_of_bounds = client.post(
        "/api/races",
        json={"season_year": 2026, "round_number": 35, "race_name": "Too Far", "circuit_id": c1},
    )
    assert out_of_bounds.status_code == 400

    # 3. Create valid Round 1 race
    create_res = client.post(
        "/api/races",
        json={
            "season_year": 2026,
            "round_number": 1,
            "race_name": "2026 Australian Grand Prix",
            "circuit_id": c1,
            "race_date": "2026-03-15",
            "race_time_utc": "05:00:00",
            "has_sprint": "Y",
        },
    )
    assert create_res.status_code == 201
    race_data = create_res.get_json()
    assert race_data["round_number"] == 1
    assert race_data["source_system"] == "MANUAL"

    # 4. Duplicate round rejection for 2026 -> 400
    dup_res = client.post(
        "/api/races",
        json={
            "season_year": 2026,
            "round_number": 1,
            "race_name": "Duplicate Round 1 Grand Prix",
            "circuit_id": c2,
        },
    )
    assert dup_res.status_code == 400
    assert "already exists" in dup_res.get_json()["error"]


def test_race_results_crud_and_duplicate_rejection(sample_entities):
    """Test entering race results, duplicate driver rejection, editing, and deletion."""
    c1 = sample_entities["circuit_1"]
    d1 = sample_entities["driver_1"]
    t1 = sample_entities["team_1"]

    # Create race
    race_res = client.post(
        "/api/races",
        json={
            "season_year": 2026,
            "round_number": 1,
            "race_name": "Bahrain GP 2026",
            "circuit_id": c1,
            "has_sprint": "Y",
        },
    )
    race_id = race_res.get_json()["race_id"]

    # Enter result for driver d1, team t1
    res_post = client.post(
        f"/api/races/{race_id}/results",
        json={
            "driver_id": d1,
            "team_id": t1,
            "session_type": "RACE",
            "finish_position": 1,
            "grid_position": 1,
            "classification_status": "Finished",
            "points": 25.0,
            "laps_completed": 57,
            "time_text": "1:31:44.742",
            "is_verified": "N",
        },
    )
    assert res_post.status_code == 201
    result_id = res_post.get_json()["result_id"]

    # Reject duplicate driver result in the same session
    dup_post = client.post(
        f"/api/races/{race_id}/results",
        json={
            "driver_id": d1,
            "team_id": t1,
            "session_type": "RACE",
            "finish_position": 2,
            "points": 18.0,
        },
    )
    assert dup_post.status_code == 400
    assert "already has a RACE result" in dup_post.get_json()["error"]

    # Edit the result
    put_res = client.put(
        f"/api/results/{result_id}",
        json={"points": 26.0, "time_text": "1:31:40.000", "is_verified": "Y"},
    )
    assert put_res.status_code == 200
    updated = put_res.get_json()
    assert updated["points"] == 26.0
    assert updated["is_verified"] == "Y"

    # Delete result
    del_res = client.delete(f"/api/results/{result_id}")
    assert del_res.status_code == 200
    assert del_res.get_json()["deleted"] is True


def test_qualifying_crud_and_validation(sample_entities):
    """Test entering qualifying shootout, validating constraints, editing and deleting."""
    c1 = sample_entities["circuit_1"]
    d1 = sample_entities["driver_1"]
    t1 = sample_entities["team_1"]

    # Create race
    race_res = client.post(
        "/api/races",
        json={
            "season_year": 2026,
            "round_number": 1,
            "race_name": "Silverstone 2026",
            "circuit_id": c1,
            "has_sprint": "N",
        },
    )
    race_id = race_res.get_json()["race_id"]

    # Missing driver_id -> 400
    bad_q = client.post(f"/api/races/{race_id}/qualifying", json={"position": 1})
    assert bad_q.status_code == 400

    # Valid qualifying entry for driver d1
    q_post = client.post(
        f"/api/races/{race_id}/qualifying",
        json={
            "driver_id": d1,
            "team_id": t1,
            "session_type": "QUALIFYING",
            "position": 1,
            "q1_time": "1:26.543",
            "q2_time": "1:25.890",
            "q3_time": "1:25.211",
            "laps_completed": 16,
            "is_verified": "Y",
        },
    )
    assert q_post.status_code == 201
    quali_id = q_post.get_json()["quali_id"]

    # Duplicate driver in qualifying -> 400
    dup_q = client.post(
        f"/api/races/{race_id}/qualifying",
        json={
            "driver_id": d1,
            "team_id": t1,
            "session_type": "QUALIFYING",
            "position": 2,
        },
    )
    assert dup_q.status_code == 400

    # Edit qualifying
    q_put = client.put(f"/api/qualifying/{quali_id}", json={"q3_time": "1:25.100"})
    assert q_put.status_code == 200
    assert q_put.get_json()["q3_time"] == "1:25.100"

    # Delete qualifying
    del_q = client.delete(f"/api/qualifying/{quali_id}")
    assert del_q.status_code == 200


def test_standings_recalculation_and_draft_exclusion(sample_entities):
    """Verify that draft results are excluded from standings and verified results dynamically recalculate standings."""
    c1 = sample_entities["circuit_1"]
    d1 = sample_entities["driver_1"]
    t1 = sample_entities["team_1"]

    # 1. 2026 Standings before entry are empty
    init_standings = client.get("/api/seasons/2026/driver-standings").get_json()
    assert len(init_standings) == 0, "Initial 2026 standings should be empty"

    # 2. Create race and add DRAFT result (is_verified = 'N')
    race_res = client.post(
        "/api/races",
        json={
            "season_year": 2026,
            "round_number": 1,
            "race_name": "Monza 2026",
            "circuit_id": c1,
            "has_sprint": "N",
        },
    )
    race_id = race_res.get_json()["race_id"]

    res_draft = client.post(
        f"/api/races/{race_id}/results",
        json={
            "driver_id": d1,
            "team_id": t1,
            "session_type": "RACE",
            "finish_position": 1,
            "classification_status": "Finished",
            "points": 25.0,
            "is_verified": "N",
        },
    )
    assert res_draft.status_code == 201

    # Verify draft result does NOT appear in official standings
    standings_after_draft = client.get("/api/seasons/2026/driver-standings").get_json()
    assert len(standings_after_draft) == 0, "Draft results must not appear in official standings"

    # 3. Verify the result via batch verification
    verify_res = client.post(f"/api/races/{race_id}/verify")
    assert verify_res.status_code == 200
    assert verify_res.get_json()["verified_results"] >= 1

    # Now official standings must dynamically include d1 with 25 points!
    standings_verified = client.get("/api/seasons/2026/driver-standings").get_json()
    assert len(standings_verified) == 1
    leader = standings_verified[0]
    assert leader["driver_id"] == d1
    assert leader["points"] == 25
    assert leader["race_wins"] == 1
    assert leader["championship_position"] == 1

    # Constructor standings should also dynamically recalculate
    ctor_standings = client.get("/api/seasons/2026/constructor-standings").get_json()
    assert len(ctor_standings) == 1
    assert ctor_standings[0]["team_id"] == t1
    assert ctor_standings[0]["points"] == 25

    # 4. Revert to draft (unverify)
    unverify_res = client.post(f"/api/races/{race_id}/unverify")
    assert unverify_res.status_code == 200

    standings_reverted = client.get("/api/seasons/2026/driver-standings").get_json()
    assert len(standings_reverted) == 0, "Unverified results must be removed from official standings"


def test_historical_preservation_and_protection():
    """Verify 2023–2025 historical data and standings are intact, and Jolpica rows cannot be altered."""
    # 1. Historical race counts
    s2023_races = client.get("/api/seasons/2023/races").get_json()
    assert len(s2023_races) == 22, f"Expected 22 races for 2023, found {len(s2023_races)}"

    s2024_races = client.get("/api/seasons/2024/races").get_json()
    assert len(s2024_races) == 24, f"Expected 24 races for 2024, found {len(s2024_races)}"

    s2025_races = client.get("/api/seasons/2025/races").get_json()
    assert len(s2025_races) == 24, f"Expected 24 races for 2025, found {len(s2025_races)}"

    # 2. Historical champions
    s2023_standings = client.get("/api/seasons/2023/driver-standings").get_json()
    assert s2023_standings[0]["last_name"] == "Verstappen"
    assert s2023_standings[0]["points"] == 575

    s2024_standings = client.get("/api/seasons/2024/driver-standings").get_json()
    assert s2024_standings[0]["last_name"] == "Verstappen"
    assert s2024_standings[0]["points"] == 437

    s2025_standings = client.get("/api/seasons/2025/driver-standings").get_json()
    assert s2025_standings[0]["last_name"] == "Norris"
    assert s2025_standings[0]["points"] == 423

    # 3. Attempt to delete a historical Jolpica race -> 403 Forbidden
    first_hist_race = s2023_races[0]["race_id"]
    del_race_res = client.delete(f"/api/races/{first_hist_race}")
    assert del_race_res.status_code == 403
    assert "historical races cannot be deleted" in del_race_res.get_json()["error"]

    # 4. Attempt to modify or delete historical Jolpica result -> 403 Forbidden
    hist_results = client.get(f"/api/races/{first_hist_race}/results").get_json()
    if hist_results:
        first_res_id = hist_results[0]["result_id"]
        mod_res = client.put(f"/api/results/{first_res_id}", json={"points": 999.0})
        assert mod_res.status_code == 403
        del_res = client.delete(f"/api/results/{first_res_id}")
        assert del_res.status_code == 403

    # 5. Attempt to unverify historical race sessions -> 403 Forbidden
    unver_res = client.post(f"/api/races/{first_hist_race}/unverify")
    assert unver_res.status_code == 403
