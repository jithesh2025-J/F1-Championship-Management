from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402


def test_analytics_queries_list():
    client = create_app().test_client()
    res = client.get("/api/analytics/queries")
    assert res.status_code == 200
    queries = res.get_json()
    assert isinstance(queries, list)
    assert len(queries) == 5

    expected_ids = {
        "top-drivers-2025-wins",
        "race-podium",
        "rank-above-average",
        "biggest-grid-gainers",
        "constructors-having-wins",
    }
    actual_ids = {q["id"] for q in queries}
    assert expected_ids == actual_ids

    for q in queries:
        assert "title" in q and q["title"]
        assert "explanation" in q and q["explanation"]
        assert "sql" in q and q["sql"]
        assert "tags" in q and isinstance(q["tags"], list) and len(q["tags"]) > 0


def test_analytics_run_stored_query():
    client = create_app().test_client()
    # Test POST
    res_post = client.post("/api/analytics/run/top-drivers-2025-wins")
    assert res_post.status_code == 200
    data_post = res_post.get_json()
    assert data_post["id"] == "top-drivers-2025-wins"
    assert "columns" in data_post
    assert "rows" in data_post
    assert "row_count" in data_post
    assert "execution_time_ms" in data_post
    assert "driver_name" in data_post["columns"]
    assert "race_wins" in data_post["columns"]
    assert len(data_post["rows"]) > 0

    # Test GET compatibility
    res_get = client.get("/api/analytics/run/top-drivers-2025-wins")
    assert res_get.status_code == 200
    assert res_get.get_json()["row_count"] == data_post["row_count"]

    # Unknown query 404
    res_unknown = client.post("/api/analytics/run/non-existent-query-id")
    assert res_unknown.status_code == 404


def test_analytics_console_valid_select():
    client = create_app().test_client()
    query = "SELECT season_year, race_name FROM race WHERE season_year = 2024 FETCH FIRST 5 ROWS ONLY"
    res = client.post("/api/analytics/console", json={"sql": query}, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["columns"] == ["season_year", "race_name"]
    assert len(data["rows"]) == 5
    assert data["row_count"] == 5
    assert data["execution_time_ms"] > 0
    assert data["capped"] is False


def test_analytics_console_rejects_mutations_and_ddl():
    client = create_app().test_client()
    disallowed = [
        "INSERT INTO team (team_name) VALUES ('Hacker')",
        "UPDATE race_result SET points = 100 WHERE result_id = 1",
        "DELETE FROM driver WHERE driver_id = 1",
        "DROP TABLE driver",
        "ALTER TABLE driver ADD (injected VARCHAR2(10))",
        "TRUNCATE TABLE race_result",
        "CREATE TABLE test_tab (id NUMBER)",
        "GRANT DBA TO public",
        "REVOKE CREATE SESSION FROM f1_viewer",
        "EXECUTE prc_driver_standings(2024)",
        "CALL prc_driver_standings(2024)",
        "BEGIN NULL; END;",
        "DECLARE x NUMBER; BEGIN NULL; END;",
        "MERGE INTO team USING dual ON (team_id = 1) WHEN MATCHED THEN UPDATE SET notes = 'x'",
    ]
    for sql in disallowed:
        res = client.post("/api/analytics/console", json={"sql": sql}, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
        assert res.status_code == 400, f"Expected 400 for SQL: {sql}, got {res.status_code}"
        err = res.get_json().get("error", "")
        assert any(term in err.lower() for term in ("forbidden", "only single select", "semicolon"))


def test_analytics_console_rejects_semicolons_and_comments():
    client = create_app().test_client()
    cases = [
        "SELECT 1 FROM dual; SELECT 2 FROM dual",
        "SELECT 1 FROM dual; DROP TABLE driver",
        "SELECT 1 FROM dual -- inline comment hiding keywords",
        "SELECT 1 /* block comment */ FROM dual",
    ]
    for sql in cases:
        res = client.post("/api/analytics/console", json={"sql": sql}, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
        assert res.status_code == 400
        err = res.get_json().get("error", "")
        assert "semicolon" in err.lower() or "comment" in err.lower()


def test_analytics_console_caps_rows():
    client = create_app().test_client()
    # Query without FETCH FIRST that has >200 rows
    res = client.post("/api/analytics/console", json={"sql": "SELECT result_id FROM race_result"}, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
    assert res.status_code == 200
    data = res.get_json()
    assert len(data["rows"]) == 200
    assert data["row_count"] == 200
    assert data["capped"] is True


def test_analytics_console_rejects_remote_ip():
    client = create_app().test_client()
    res = client.post(
        "/api/analytics/console",
        json={"sql": "SELECT 1 FROM dual"},
        environ_overrides={"REMOTE_ADDR": "192.168.1.100"},
    )
    assert res.status_code == 403
    assert "127.0.0.1" in res.get_json().get("error", "")


def test_analytics_trigger_demo_leaves_data_unchanged():
    client = create_app().test_client()
    res = client.post("/api/analytics/trigger-demo")
    assert res.status_code == 200
    data = res.get_json()
    assert "ORA-20001" in data["oracle_error"]
    assert data["status"] == "rolled_back"
    assert data["message"] == "Rolled back, no data changed"
    assert data["verified_unchanged"] is True
    assert data["row_count_before"] == data["row_count_after"]
    assert data["row_count_before"] > 0


def test_analytics_trigger_demo_rejects_remote_ip():
    client = create_app().test_client()
    res = client.post(
        "/api/analytics/trigger-demo",
        environ_overrides={"REMOTE_ADDR": "192.168.1.100"},
    )
    assert res.status_code == 403
    assert "127.0.0.1" in res.get_json().get("error", "")

