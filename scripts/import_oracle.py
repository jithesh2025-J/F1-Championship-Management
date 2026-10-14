"""Idempotent Oracle import of normalized Jolpica records (MERGE on natural keys)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
PROCESSED = ROOT / "data" / "processed"


def load(name: str) -> list:
    path = PROCESSED / name
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run scripts/normalize_jolpica.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


def connect():
    import oracledb

    user = os.environ["ORACLE_USER"]
    password = os.environ["ORACLE_PASSWORD"]
    dsn = os.environ["ORACLE_DSN"]
    if os.environ.get("ORACLE_THICK_MODE", "").lower() == "true":
        oracledb.init_oracle_client()
    return oracledb.connect(user=user, password=password, dsn=dsn)


def fmap(cur, sql: str) -> dict:
    cur.execute(sql)
    return {row[0]: row[1] for row in cur}


def to_date(cur, value):
    if not value:
        return None
    return value  # YYYY-MM-DD binds as string with TO_DATE in SQL


def main() -> int:
    required = [
        "ORACLE_USER",
        "ORACLE_PASSWORD",
        "ORACLE_DSN",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"Set {missing} in .env before importing.")

    countries = load("countries.json")
    seasons = load("seasons.json")
    teams = load("teams.json")
    drivers = load("drivers.json")
    circuits = load("circuits.json")
    contracts = load("contracts.json")
    races = load("races.json")
    qualifying = load("qualifying.json")
    results = load("results.json")
    pit_stops = load("pit_stops.json")

    conn = connect()
    cur = conn.cursor()
    inserted_log = {}

    try:
        cur.executemany(
            """
            MERGE INTO country c
            USING (SELECT :country_name AS country_name, :country_code AS country_code FROM dual) s
            ON (c.country_name = s.country_name)
            WHEN MATCHED THEN UPDATE SET c.country_code = NVL(s.country_code, c.country_code)
            WHEN NOT MATCHED THEN INSERT (country_name, country_code)
            VALUES (s.country_name, s.country_code)
            """,
            countries,
        )
        inserted_log["country"] = len(countries)

        cur.executemany(
            """
            MERGE INTO season x
            USING (SELECT :season_year AS season_year, :season_name AS season_name,
                          TO_DATE(:start_date, 'YYYY-MM-DD') AS start_date,
                          TO_DATE(:end_date, 'YYYY-MM-DD') AS end_date,
                          :notes AS notes FROM dual) s
            ON (x.season_year = s.season_year)
            WHEN MATCHED THEN UPDATE SET
              x.season_name = s.season_name,
              x.start_date = s.start_date,
              x.end_date = s.end_date,
              x.notes = s.notes
            WHEN NOT MATCHED THEN INSERT (season_year, season_name, start_date, end_date, notes)
            VALUES (s.season_year, s.season_name, s.start_date, s.end_date, s.notes)
            """,
            seasons,
        )
        inserted_log["season"] = len(seasons)

        country_ids = fmap(cur, "SELECT country_name, country_id FROM country")

        team_rows = [
            {
                **{key: value for key, value in t.items() if key != "country_name"},
                "country_id": country_ids.get(t.get("country_name")),
            }
            for t in teams
        ]
        cur.executemany(
            """
            MERGE INTO team t
            USING (SELECT :constructor_ref AS constructor_ref, :team_name AS team_name,
                          :nationality AS nationality, :country_id AS country_id,
                          :wikipedia_url AS wikipedia_url, :source_system AS source_system
                   FROM dual) s
            ON (t.constructor_ref = s.constructor_ref)
            WHEN MATCHED THEN UPDATE SET
              t.team_name = s.team_name,
              t.nationality = s.nationality,
              t.country_id = NVL(s.country_id, t.country_id),
              t.wikipedia_url = s.wikipedia_url
            WHEN NOT MATCHED THEN INSERT
              (constructor_ref, team_name, nationality, country_id, wikipedia_url, source_system)
            VALUES (s.constructor_ref, s.team_name, s.nationality, s.country_id, s.wikipedia_url, s.source_system)
            """,
            team_rows,
        )
        inserted_log["team"] = len(team_rows)

        driver_rows = [
            {
                **{key: value for key, value in d.items() if key != "country_name"},
                "country_id": country_ids.get(d.get("country_name")),
            }
            for d in drivers
        ]
        cur.executemany(
            """
            MERGE INTO driver d
            USING (SELECT :driver_ref AS driver_ref, :driver_code AS driver_code,
                          :permanent_number AS permanent_number, :first_name AS first_name,
                          :last_name AS last_name, TO_DATE(:date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                          :nationality AS nationality, :country_id AS country_id,
                          :wikipedia_url AS wikipedia_url, :source_system AS source_system
                   FROM dual) s
            ON (d.driver_ref = s.driver_ref)
            WHEN MATCHED THEN UPDATE SET
              d.driver_code = s.driver_code,
              d.permanent_number = s.permanent_number,
              d.first_name = s.first_name,
              d.last_name = s.last_name,
              d.date_of_birth = s.date_of_birth,
              d.nationality = s.nationality,
              d.country_id = NVL(s.country_id, d.country_id),
              d.wikipedia_url = s.wikipedia_url
            WHEN NOT MATCHED THEN INSERT
              (driver_ref, driver_code, permanent_number, first_name, last_name, date_of_birth,
               nationality, country_id, wikipedia_url, source_system)
            VALUES (s.driver_ref, s.driver_code, s.permanent_number, s.first_name, s.last_name,
                    s.date_of_birth, s.nationality, s.country_id, s.wikipedia_url, s.source_system)
            """,
            driver_rows,
        )
        inserted_log["driver"] = len(driver_rows)

        circuit_rows = [
            {
                **{key: value for key, value in c.items() if key != "country_name"},
                "country_id": country_ids.get(c.get("country_name")),
            }
            for c in circuits
        ]
        cur.executemany(
            """
            MERGE INTO circuit c
            USING (SELECT :circuit_ref AS circuit_ref, :circuit_name AS circuit_name,
                          :locality AS locality, :country_id AS country_id,
                          :latitude AS latitude, :longitude AS longitude,
                          :wikipedia_url AS wikipedia_url FROM dual) s
            ON (c.circuit_ref = s.circuit_ref)
            WHEN MATCHED THEN UPDATE SET
              c.circuit_name = s.circuit_name,
              c.locality = s.locality,
              c.country_id = NVL(s.country_id, c.country_id),
              c.latitude = s.latitude,
              c.longitude = s.longitude,
              c.wikipedia_url = s.wikipedia_url
            WHEN NOT MATCHED THEN INSERT
              (circuit_ref, circuit_name, locality, country_id, latitude, longitude, wikipedia_url)
            VALUES (s.circuit_ref, s.circuit_name, s.locality, s.country_id, s.latitude, s.longitude, s.wikipedia_url)
            """,
            circuit_rows,
        )
        inserted_log["circuit"] = len(circuit_rows)

        team_ids = fmap(cur, "SELECT constructor_ref, team_id FROM team")
        driver_ids = fmap(cur, "SELECT driver_ref, driver_id FROM driver")
        circuit_ids = fmap(cur, "SELECT circuit_ref, circuit_id FROM circuit")

        race_rows = []
        for r in races:
            cid = circuit_ids.get(r["circuit_ref"])
            if not cid:
                print(f"SKIP race {r}: unknown circuit")
                continue
            race_rows.append(
                {
                    **{
                        key: value
                        for key, value in r.items()
                        if key not in {"circuit_ref", "source_url"}
                    },
                    "circuit_id": cid,
                }
            )
        cur.executemany(
            """
            MERGE INTO race r
            USING (SELECT :season_year AS season_year, :round_number AS round_number,
                          :circuit_id AS circuit_id, :race_name AS race_name,
                          TO_DATE(:race_date, 'YYYY-MM-DD') AS race_date,
                          :race_time_utc AS race_time_utc, :wikipedia_url AS wikipedia_url,
                          :has_sprint AS has_sprint, :source_system AS source_system
                   FROM dual) s
            ON (r.season_year = s.season_year AND r.round_number = s.round_number)
            WHEN MATCHED THEN UPDATE SET
              r.circuit_id = s.circuit_id,
              r.race_name = s.race_name,
              r.race_date = s.race_date,
              r.race_time_utc = s.race_time_utc,
              r.wikipedia_url = s.wikipedia_url,
              r.has_sprint = s.has_sprint
            WHEN NOT MATCHED THEN INSERT
              (season_year, round_number, circuit_id, race_name, race_date, race_time_utc,
               wikipedia_url, has_sprint, source_system)
            VALUES (s.season_year, s.round_number, s.circuit_id, s.race_name, s.race_date,
                    s.race_time_utc, s.wikipedia_url, s.has_sprint, s.source_system)
            """,
            race_rows,
        )
        inserted_log["race"] = len(race_rows)

        cur.execute("SELECT season_year, round_number, race_id FROM race")
        race_ids = {(row[0], row[1]): row[2] for row in cur}

        contract_rows = []
        for c in contracts:
            did, tid = driver_ids.get(c["driver_ref"]), team_ids.get(c["constructor_ref"])
            if not did or not tid:
                print(f"SKIP contract {c}")
                continue
            contract_rows.append(
                {
                    "driver_id": did,
                    "team_id": tid,
                    "season_year": c["season_year"],
                    "car_number": c.get("car_number"),
                }
            )
        cur.executemany(
            """
            MERGE INTO driver_contract dc
            USING (SELECT :driver_id AS driver_id, :team_id AS team_id,
                          :season_year AS season_year, :car_number AS car_number FROM dual) s
            ON (dc.driver_id = s.driver_id AND dc.team_id = s.team_id AND dc.season_year = s.season_year)
            WHEN MATCHED THEN UPDATE SET dc.car_number = NVL(s.car_number, dc.car_number)
            WHEN NOT MATCHED THEN INSERT (driver_id, team_id, season_year, car_number)
            VALUES (s.driver_id, s.team_id, s.season_year, s.car_number)
            """,
            contract_rows,
        )
        inserted_log["driver_contract"] = len(contract_rows)

        def session_rows(items, kind):
            out = []
            for row in items:
                rid = race_ids.get((row["season_year"], row["round_number"]))
                did = driver_ids.get(row["driver_ref"])
                tid = team_ids.get(row["constructor_ref"])
                if not rid or not did or not tid:
                    print(f"SKIP {kind} {row.get('driver_ref')} {row.get('season_year')} R{row.get('round_number')}")
                    continue
                out.append(
                    {
                        **{
                            key: value
                            for key, value in row.items()
                            if key not in {"driver_ref", "constructor_ref", "season_year", "round_number"}
                        },
                        "race_id": rid,
                        "driver_id": did,
                        "team_id": tid,
                    }
                )
            return out

        q_rows = session_rows(qualifying, "qualifying")
        cur.executemany(
            """
            MERGE INTO qualifying_result q
            USING (SELECT :race_id AS race_id, :driver_id AS driver_id, :team_id AS team_id,
                          :session_type AS session_type, :position AS position,
                          :q1_time AS q1_time, :q2_time AS q2_time, :q3_time AS q3_time,
                          :source_system AS source_system, :is_verified AS is_verified
                   FROM dual) s
            ON (q.race_id = s.race_id AND q.driver_id = s.driver_id AND q.session_type = s.session_type)
            WHEN MATCHED THEN UPDATE SET
              q.team_id = s.team_id,
              q.position = s.position,
              q.q1_time = s.q1_time,
              q.q2_time = s.q2_time,
              q.q3_time = s.q3_time
            WHEN NOT MATCHED THEN INSERT
              (race_id, driver_id, team_id, session_type, position, q1_time, q2_time, q3_time,
               source_system, is_verified)
            VALUES (s.race_id, s.driver_id, s.team_id, s.session_type, s.position, s.q1_time,
                    s.q2_time, s.q3_time, s.source_system, s.is_verified)
            """,
            q_rows,
        )
        inserted_log["qualifying_result"] = len(q_rows)

        r_rows = session_rows(results, "result")
        cur.executemany(
            """
            MERGE INTO race_result rr
            USING (SELECT :race_id AS race_id, :driver_id AS driver_id, :team_id AS team_id,
                          :session_type AS session_type, :grid_position AS grid_position,
                          :finish_position AS finish_position, :position_text AS position_text,
                          :classification_status AS classification_status, :points AS points,
                          :laps_completed AS laps_completed, :time_text AS time_text,
                          :milliseconds AS milliseconds, :fastest_lap AS fastest_lap,
                          :fastest_lap_time AS fastest_lap_time, :fastest_lap_rank AS fastest_lap_rank,
                          :source_system AS source_system, :is_verified AS is_verified,
                          :source_url AS source_url
                   FROM dual) s
            ON (rr.race_id = s.race_id AND rr.driver_id = s.driver_id AND rr.session_type = s.session_type)
            WHEN MATCHED THEN UPDATE SET
              rr.team_id = s.team_id,
              rr.grid_position = s.grid_position,
              rr.finish_position = s.finish_position,
              rr.position_text = s.position_text,
              rr.classification_status = s.classification_status,
              rr.points = s.points,
              rr.laps_completed = s.laps_completed,
              rr.time_text = s.time_text,
              rr.milliseconds = s.milliseconds,
              rr.fastest_lap = s.fastest_lap,
              rr.fastest_lap_time = s.fastest_lap_time,
              rr.fastest_lap_rank = s.fastest_lap_rank,
              rr.source_url = s.source_url
            WHEN NOT MATCHED THEN INSERT
              (race_id, driver_id, team_id, session_type, grid_position, finish_position, position_text,
               classification_status, points, laps_completed, time_text, milliseconds, fastest_lap,
               fastest_lap_time, fastest_lap_rank, source_system, is_verified, source_url)
            VALUES (s.race_id, s.driver_id, s.team_id, s.session_type, s.grid_position, s.finish_position,
                    s.position_text, s.classification_status, s.points, s.laps_completed, s.time_text,
                    s.milliseconds, s.fastest_lap, s.fastest_lap_time, s.fastest_lap_rank,
                    s.source_system, s.is_verified, s.source_url)
            """,
            r_rows,
        )
        inserted_log["race_result"] = len(r_rows)

        pit_rows = []
        for p in pit_stops:
            rid = race_ids.get((p["season_year"], p["round_number"]))
            did = driver_ids.get(p["driver_ref"])
            if not rid or not did:
                continue
            pit_rows.append(
                {
                    **{
                        key: value
                        for key, value in p.items()
                        if key not in {"driver_ref", "season_year", "round_number"}
                    },
                    "race_id": rid,
                    "driver_id": did,
                }
            )
        if pit_rows:
            cur.executemany(
                """
                MERGE INTO pit_stop p
                USING (SELECT :race_id AS race_id, :driver_id AS driver_id, :stop_number AS stop_number,
                              :lap_number AS lap_number, :stop_time AS stop_time,
                              :duration_text AS duration_text, :duration_ms AS duration_ms,
                              :source_system AS source_system FROM dual) s
                ON (p.race_id = s.race_id AND p.driver_id = s.driver_id AND p.stop_number = s.stop_number)
                WHEN MATCHED THEN UPDATE SET
                  p.lap_number = s.lap_number,
                  p.stop_time = s.stop_time,
                  p.duration_text = s.duration_text,
                  p.duration_ms = s.duration_ms
                WHEN NOT MATCHED THEN INSERT
                  (race_id, driver_id, stop_number, lap_number, stop_time, duration_text, duration_ms, source_system)
                VALUES (s.race_id, s.driver_id, s.stop_number, s.lap_number, s.stop_time,
                        s.duration_text, s.duration_ms, s.source_system)
                """,
                pit_rows,
            )
        inserted_log["pit_stop"] = len(pit_rows)

        conn.commit()
        print("Import committed:")
        for k, v in inserted_log.items():
            print(f"  {k}: {v} merged")
        (PROCESSED / "import_log.json").write_text(json.dumps(inserted_log, indent=2), encoding="utf-8")
        return 0
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        print(f"Import failed, rolled back: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
