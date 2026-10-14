from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from jolpica_client import JolpicaClient  # noqa: E402
from normalize_jolpica import duration_to_ms, parse_driver, parse_team, Report  # noqa: E402
from run_sql import split_sql  # noqa: E402
from verify_standings import compare_maps  # noqa: E402


def test_duration_to_ms():
    assert duration_to_ms("22.197") == 22197
    assert duration_to_ms("1:02.500") == 62500
    assert duration_to_ms(None) is None
    assert duration_to_ms("nope") is None


def test_parse_driver_requires_keys():
    report = Report()
    assert parse_driver({"givenName": "Max"}, report) is None
    assert report.failures
    ok = parse_driver(
        {"driverId": "max_verstappen", "givenName": "Max", "familyName": "Verstappen", "nationality": "Dutch"},
        Report(),
    )
    assert ok["driver_ref"] == "max_verstappen"


def test_parse_team_requires_keys():
    assert parse_team({"name": "Red Bull"}, Report()) is None


def test_split_sql_procedures():
    sql = """
    CREATE TABLE t (id NUMBER);
    CREATE OR REPLACE PROCEDURE p AS
    BEGIN
      NULL;
    END;
    /
    """
    parts = split_sql(sql)
    assert any("CREATE TABLE" in p for p in parts)
    assert any("PROCEDURE" in p.upper() for p in parts)


def test_standings_match_source_fixture():
    computed = {(2024, "max_verstappen"): 437.0, (2024, "norris"): 374.0}
    source = [
        {"season_year": 2024, "driver_ref": "max_verstappen", "points": 437},
        {"season_year": 2024, "driver_ref": "norris", "points": 374},
    ]
    assert compare_maps(computed, source, "driver_ref") == []
    source[1]["points"] = 1
    assert compare_maps(computed, source, "driver_ref")


def test_cache_path_stable(tmp_path):
    client = JolpicaClient(tmp_path)
    a = client._cache_path("2024/1/results.json?limit=100")
    b = client._cache_path("2024/1/results.json?limit=100")
    assert a == b


def test_sample_fixture_is_labelled():
    fixture = Path(__file__).parent / "fixtures" / "sample_not_historical.json"
    data = json.loads(fixture.read_text(encoding="utf-8"))
    assert data["is_illustrative"] is True
    assert data["source_system"] == "ILLUSTRATIVE"
