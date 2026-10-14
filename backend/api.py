import hmac
import re
import time
from flask import Blueprint, jsonify, request
import oracledb

from config import admin_api_key, is_dev_console_enabled
import db

api = Blueprint("api", __name__, url_prefix="/api")


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def is_admin_authorized() -> bool:
    expected = admin_api_key()
    if not expected:
        return False

    candidate = None
    if "X-Admin-Token" in request.headers:
        candidate = request.headers["X-Admin-Token"].strip()
    elif "X-API-Key" in request.headers:
        candidate = request.headers["X-API-Key"].strip()
    else:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            candidate = auth[7:].strip()

    if not candidate:
        return False

    return hmac.compare_digest(candidate, expected)


@api.before_request
def check_authorization():
    # Only inspect mutating HTTP methods (POST, PUT, DELETE, PATCH)
    if request.method not in ("POST", "PUT", "DELETE", "PATCH"):
        return None

    path = request.path.rstrip("/")

    # Exempt: Public read-only analytics query execution (Requirement 4)
    if path.startswith("/api/analytics/run"):
        return None

    # Gated by production dev console flag: /api/analytics/console and /api/analytics/trigger-demo (Requirement 1)
    if path in ("/api/analytics/console", "/api/analytics/trigger-demo"):
        if not is_dev_console_enabled():
            return error("Analytics console and trigger demonstration are disabled in production. Set ENABLE_DEV_CONSOLE=true for local development.", 403)
        remote_ip = request.remote_addr or ""
        if remote_ip not in ("127.0.0.1", "::1", "localhost"):
            return error(f"Console access restricted to 127.0.0.1 (remote IP: {remote_ip})", 403)
        return None

    # All other mutating database write operations require admin authentication (Requirements 2 & 3)
    if not is_admin_authorized():
        resp = jsonify({"error": "Unauthorized: Admin authentication required for write operations."})
        resp.headers["WWW-Authenticate"] = 'Bearer realm="Admin"'
        return resp, 401

    return None


@api.get("/health")
def health():
    try:
        info = db.ping()
        return jsonify({"status": "ok", "database": "connected", **info})
    except Exception:
        return jsonify(
            {
                "status": "degraded",
                "database": "disconnected",
                "hint": "Check .env ORACLE_* values and that OracleServiceFREE is running.",
            }
        ), 503


@api.get("/seasons")
def seasons():
    rows = db.query(
        """
        SELECT s.season_year, s.season_name, s.start_date, s.end_date, s.notes,
               (SELECT COUNT(*) FROM race r WHERE r.season_year = s.season_year) AS race_count
        FROM season s
        ORDER BY s.season_year
        """
    )
    return jsonify(rows)


@api.get("/seasons/overview-cards")
def seasons_overview_cards():
    rows = db.query(
        """
        SELECT
          s.season_year,
          s.season_name,
          s.start_date,
          s.end_date,
          s.notes,
          (SELECT COUNT(*) FROM race r WHERE r.season_year = s.season_year AND r.source_system <> 'ILLUSTRATIVE') AS race_count,
          (SELECT COUNT(DISTINCT rr.driver_id) FROM race_result rr JOIN race r ON r.race_id = rr.race_id WHERE r.season_year = s.season_year AND rr.is_verified = 'Y' AND rr.source_system <> 'ILLUSTRATIVE') AS driver_count,
          (SELECT COUNT(DISTINCT rr.team_id) FROM race_result rr JOIN race r ON r.race_id = rr.race_id WHERE r.season_year = s.season_year AND rr.is_verified = 'Y' AND rr.source_system <> 'ILLUSTRATIVE') AS constructor_count,
          (SELECT ds.first_name || ' ' || ds.last_name FROM v_driver_standings ds WHERE ds.season_year = s.season_year AND ds.championship_position = 1) AS champ_driver_name,
          (SELECT ds.driver_id FROM v_driver_standings ds WHERE ds.season_year = s.season_year AND ds.championship_position = 1) AS champ_driver_id,
          (SELECT ds.points FROM v_driver_standings ds WHERE ds.season_year = s.season_year AND ds.championship_position = 1) AS champ_driver_points,
          (SELECT cs.team_name FROM v_constructor_standings cs WHERE cs.season_year = s.season_year AND cs.championship_position = 1) AS champ_team_name,
          (SELECT cs.team_id FROM v_constructor_standings cs WHERE cs.season_year = s.season_year AND cs.championship_position = 1) AS champ_team_id,
          (SELECT cs.points FROM v_constructor_standings cs WHERE cs.season_year = s.season_year AND cs.championship_position = 1) AS champ_team_points,
          (SELECT t.primary_color FROM team t WHERE t.team_id = (SELECT cs.team_id FROM v_constructor_standings cs WHERE cs.season_year = s.season_year AND cs.championship_position = 1)) AS champ_team_color,
          (SELECT ds.first_name || ' ' || ds.last_name || ' (' || ds.race_wins || ' wins)' FROM (SELECT * FROM v_driver_standings ORDER BY race_wins DESC) ds WHERE ds.season_year = s.season_year AND ROWNUM = 1) AS most_wins_driver
        FROM season s
        ORDER BY s.season_year DESC
        """
    )
    return jsonify(rows)


@api.get("/seasons/<int:year>/driver-cards")
def season_driver_cards(year: int):
    rows = db.query(
        """
        SELECT
          s.season_year,
          s.driver_id,
          s.driver_ref,
          s.first_name,
          s.last_name,
          s.driver_code,
          s.permanent_number,
          s.team_id,
          s.team_name,
          s.primary_color,
          s.starts,
          s.wins,
          s.podiums,
          s.poles,
          s.points,
          s.dnfs,
          s.avg_finish,
          s.avg_grid,
          s.positions_gained,
          d.nationality,
          cs.championship_position
        FROM v_driver_profile_stats s
        JOIN driver d ON d.driver_id = s.driver_id
        LEFT JOIN v_driver_standings cs
          ON cs.season_year = s.season_year AND cs.driver_id = s.driver_id
        WHERE s.season_year = :year
        ORDER BY NVL(cs.championship_position, 99), s.points DESC
        """,
        {"year": year},
    )
    return jsonify(rows)


@api.get("/seasons/<int:year>/team-cards")
def season_team_cards(year: int):
    standings = db.query(
        """
        SELECT
          cs.season_year,
          cs.team_id,
          cs.constructor_ref,
          cs.team_name,
          cs.points,
          cs.race_wins AS wins,
          cs.podiums,
          cs.championship_position,
          t.primary_color,
          t.nationality
        FROM v_constructor_standings cs
        JOIN team t ON t.team_id = cs.team_id
        WHERE cs.season_year = :year
        ORDER BY cs.championship_position ASC
        """,
        {"year": year},
    )
    team_drivers = db.query(
        """
        SELECT
          rr.team_id,
          d.driver_id,
          d.first_name || ' ' || d.last_name AS driver_name,
          d.driver_code,
          SUM(rr.points) AS points,
          SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS wins
        FROM race_result rr
        JOIN race r ON r.race_id = rr.race_id
        JOIN driver d ON d.driver_id = rr.driver_id
        WHERE r.season_year = :year
          AND rr.is_verified = 'Y'
          AND rr.source_system <> 'ILLUSTRATIVE'
        GROUP BY rr.team_id, d.driver_id, d.first_name, d.last_name, d.driver_code
        ORDER BY rr.team_id, points DESC
        """,
        {"year": year},
    )
    by_team = {}
    for d in team_drivers:
        by_team.setdefault(d["team_id"], []).append(d)

    for team in standings:
        team["drivers"] = by_team.get(team["team_id"], [])

    return jsonify(standings)


@api.get("/seasons/<int:year>/dashboard")
def dashboard(year: int):
    races = db.query("SELECT COUNT(*) AS c FROM race WHERE season_year = :y", {"y": year})
    drivers = db.query(
        """
        SELECT COUNT(DISTINCT driver_id) AS c
        FROM race_result rr JOIN race r ON r.race_id = rr.race_id
        WHERE r.season_year = :y
        """,
        {"y": year},
    )
    leader = db.query(
        """
        SELECT * FROM v_driver_standings
        WHERE season_year = :y AND championship_position = 1
        """,
        {"y": year},
    )
    constructor = db.query(
        """
        SELECT * FROM v_constructor_standings
        WHERE season_year = :y AND championship_position = 1
        """,
        {"y": year},
    )
    totals = db.query(
        """
        SELECT
          SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podiums,
          SUM(rr.points) AS points
        FROM race_result rr
        JOIN race r ON r.race_id = rr.race_id
        WHERE r.season_year = :y AND rr.is_verified = 'Y'
        """,
        {"y": year},
    )
    return jsonify(
        {
            "season_year": year,
            "race_count": races[0]["c"] if races else 0,
            "driver_count": drivers[0]["c"] if drivers else 0,
            "leader": leader[0] if leader else None,
            "leading_constructor": constructor[0] if constructor else None,
            "totals": totals[0] if totals else {},
        }
    )


@api.get("/seasons/<int:year>/driver-standings")
def driver_standings(year: int):
    try:
        rows = db.call_cursor("prc_driver_standings", year)
        return jsonify(rows)
    except Exception:
        rows = db.query(
            "SELECT * FROM v_driver_standings WHERE season_year = :y ORDER BY championship_position",
            {"y": year},
        )
        return jsonify(rows)


@api.get("/seasons/<int:year>/constructor-standings")
def constructor_standings(year: int):
    try:
        rows = db.call_cursor("prc_constructor_standings", year)
        return jsonify(rows)
    except Exception:
        rows = db.query(
            "SELECT * FROM v_constructor_standings WHERE season_year = :y ORDER BY championship_position",
            {"y": year},
        )
        return jsonify(rows)


@api.get("/dashboard/summary")
def dashboard_summary():
    rows = db.query("SELECT * FROM v_dashboard_summary")
    return jsonify(rows[0] if rows else {})


@api.get("/dashboard/season-overview")
def dashboard_season_overview():
    rows = db.query(
        """
        SELECT
          s.season_year,
          (SELECT COUNT(*) FROM race r WHERE r.season_year = s.season_year) AS race_count,
          (SELECT COUNT(DISTINCT dc.team_id) FROM driver_contract dc WHERE dc.season_year = s.season_year) AS team_count,
          (SELECT COUNT(DISTINCT rr.driver_id)
             FROM race_result rr
             JOIN race r ON r.race_id = rr.race_id
            WHERE r.season_year = s.season_year
              AND rr.is_verified = 'Y'
              AND rr.source_system <> 'ILLUSTRATIVE') AS driver_count,
          (SELECT ds.first_name || ' ' || ds.last_name
             FROM v_driver_standings ds
            WHERE ds.season_year = s.season_year AND ds.championship_position = 1) AS champion_name,
          (SELECT ds.points
             FROM v_driver_standings ds
            WHERE ds.season_year = s.season_year AND ds.championship_position = 1) AS champion_points
        FROM season s
        ORDER BY s.season_year
        """
    )
    return jsonify(rows)


@api.get("/dashboard/progression")
def dashboard_progression():
    season = request.args.get("season", type=int)
    mode = request.args.get("mode", "drivers").lower()
    if season is None:
        return error("season is required")
    if mode not in {"drivers", "teams"}:
        return error("mode must be drivers or teams")
    if mode == "drivers":
        rows = db.query(
            """
            SELECT p.*
            FROM v_driver_points_progression p
            WHERE p.season_year = :season
              AND p.driver_id IN (
                SELECT driver_id FROM v_driver_standings
                WHERE season_year = :season
                  AND championship_position <= 5
              )
            ORDER BY p.round_number, p.driver_id
            """,
            {"season": season},
        )
    else:
        rows = db.query(
            """
            SELECT p.*
            FROM v_team_points_progression p
            WHERE p.season_year = :season
              AND p.team_id IN (
                SELECT team_id FROM v_constructor_standings
                WHERE season_year = :season
                  AND championship_position <= 5
              )
            ORDER BY p.round_number, p.team_id
            """,
            {"season": season},
        )
    return jsonify(rows)


@api.get("/dashboard/race-winners")
def dashboard_race_winners():
    rows = db.query(
        """
        SELECT d.driver_id, d.first_name || ' ' || d.last_name AS driver_name,
               t.team_name, t.primary_color, COUNT(*) AS wins
        FROM race_result rr
        JOIN race r ON r.race_id = rr.race_id
        JOIN driver d ON d.driver_id = rr.driver_id
        JOIN team t ON t.team_id = rr.team_id
        WHERE rr.session_type = 'RACE'
          AND rr.finish_position = 1
          AND rr.is_verified = 'Y'
          AND rr.source_system <> 'ILLUSTRATIVE'
        GROUP BY d.driver_id, d.first_name, d.last_name, t.team_name, t.primary_color
        ORDER BY wins DESC, driver_name
        """
    )
    return jsonify(rows)


@api.get("/dashboard/circuits")
def dashboard_circuits():
    rows = db.query(
        """
        SELECT c.circuit_id, c.circuit_ref, c.circuit_name, c.locality,
               co.country_name, r.season_year
        FROM circuit c
        LEFT JOIN country co ON co.country_id = c.country_id
        JOIN race r ON r.circuit_id = c.circuit_id
        WHERE r.source_system <> 'ILLUSTRATIVE'
        GROUP BY c.circuit_id, c.circuit_ref, c.circuit_name, c.locality,
                 co.country_name, r.season_year
        ORDER BY c.circuit_name, r.season_year
        """
    )
    return jsonify(rows)


@api.get("/standings/form")
def standings_form():
    season = request.args.get("season", type=int)
    mode = request.args.get("mode", "drivers").lower()
    if season is None:
        return error("season is required")
    if mode not in {"drivers", "teams"}:
        return error("mode must be drivers or teams")
    view = "v_driver_standings_form" if mode == "drivers" else "v_team_standings_form"
    ordering = "form_round, team_name, last_name, first_name" if mode == "drivers" else "form_round, team_name"
    rows = db.query(
        f"""
        SELECT *
        FROM {view}
        WHERE season_year = :season
          AND form_round <= 5
        ORDER BY {ordering}
        """,
        {"season": season},
    )
    return jsonify(rows)


@api.get("/seasons/<int:year>/races")
def season_races(year: int):
    rows = db.query(
        """
        SELECT r.race_id, r.season_year, r.round_number, r.race_name, r.race_date,
               r.has_sprint, c.circuit_name, c.locality, co.country_name
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        LEFT JOIN country co ON co.country_id = c.country_id
        WHERE r.season_year = :y
        ORDER BY r.round_number
        """,
        {"y": year},
    )
    return jsonify(rows)


@api.get("/races/<int:race_id>")
def race_detail(race_id: int):
    rows = db.query(
        """
        SELECT r.*, c.circuit_name, c.locality, c.circuit_ref, co.country_name
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        LEFT JOIN country co ON co.country_id = c.country_id
        WHERE r.race_id = :id
        """,
        {"id": race_id},
    )
    if not rows:
        return error("Race not found", 404)
    return jsonify(rows[0])


@api.get("/races/<int:race_id>/results")
def race_results(race_id: int):
    session = request.args.get("session", "RACE").upper()
    if session not in {"RACE", "SPRINT"}:
        return error("session must be RACE or SPRINT")
    rows = db.query(
        """
        SELECT rr.*, d.first_name, d.last_name, d.driver_code, t.team_name
        FROM race_result rr
        JOIN driver d ON d.driver_id = rr.driver_id
        JOIN team t ON t.team_id = rr.team_id
        WHERE rr.race_id = :id AND rr.session_type = :s
        ORDER BY NVL(rr.finish_position, 99), rr.result_id
        """,
        {"id": race_id, "s": session},
    )
    return jsonify(rows)


@api.get("/races/<int:race_id>/qualifying")
def qualifying(race_id: int):
    session = request.args.get("session", "QUALIFYING").upper()
    rows = db.query(
        """
        SELECT q.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM qualifying_result q
        JOIN driver d ON d.driver_id = q.driver_id
        JOIN team t ON t.team_id = q.team_id
        WHERE q.race_id = :id AND q.session_type = :s
        ORDER BY NVL(q.position, 99)
        """,
        {"id": race_id, "s": session},
    )
    return jsonify(rows)


@api.get("/races/<int:race_id>/pit-stops")
def pit_stops(race_id: int):
    rows = db.query(
        """
        SELECT p.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM pit_stop p
        JOIN driver d ON d.driver_id = p.driver_id
        LEFT JOIN race_result rr ON rr.race_id = p.race_id AND rr.driver_id = p.driver_id AND rr.session_type = 'RACE'
        LEFT JOIN team t ON t.team_id = rr.team_id
        WHERE p.race_id = :id
        ORDER BY p.lap_number, p.stop_number
        """,
        {"id": race_id},
    )
    return jsonify(rows)


@api.get("/races/<int:race_id>/grid-finish")
def race_grid_finish(race_id: int):
    rows = db.query(
        """
        SELECT *
        FROM v_race_grid_finish
        WHERE race_id = :id
        ORDER BY NVL(finish_position, 99), NVL(grid_position, 99)
        """,
        {"id": race_id},
    )
    return jsonify(rows)


@api.get("/races/<int:race_id>/pit-analysis")
def race_pit_analysis(race_id: int):
    rows = db.query(
        """
        SELECT *
        FROM v_pit_stop_analysis
        WHERE race_id = :id
        ORDER BY fastest_stop_ms ASC NULLS LAST, stop_count DESC
        """,
        {"id": race_id},
    )
    return jsonify(rows)


@api.get("/seasons/<int:year>/race-cards")
def season_race_cards(year: int):
    rows = db.query(
        """
        SELECT
          r.race_id,
          r.season_year,
          r.round_number,
          r.race_name,
          r.race_date,
          r.has_sprint,
          c.circuit_id,
          c.circuit_name,
          c.circuit_ref,
          c.locality,
          co.country_name,
          w_d.first_name || ' ' || w_d.last_name AS winner_name,
          w_t.team_name AS winner_team,
          w_t.primary_color AS winner_color,
          p_d.first_name || ' ' || p_d.last_name AS pole_name,
          p_t.team_name AS pole_team
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        LEFT JOIN country co ON co.country_id = c.country_id
        LEFT JOIN race_result w_rr ON w_rr.race_id = r.race_id
          AND w_rr.session_type = 'RACE' AND w_rr.finish_position = 1
          AND w_rr.is_verified = 'Y' AND w_rr.source_system <> 'ILLUSTRATIVE'
        LEFT JOIN driver w_d ON w_d.driver_id = w_rr.driver_id
        LEFT JOIN team w_t ON w_t.team_id = w_rr.team_id
        LEFT JOIN race_result p_rr ON p_rr.race_id = r.race_id
          AND p_rr.session_type = 'RACE' AND p_rr.grid_position = 1
          AND p_rr.is_verified = 'Y' AND p_rr.source_system <> 'ILLUSTRATIVE'
        LEFT JOIN driver p_d ON p_d.driver_id = p_rr.driver_id
        LEFT JOIN team p_t ON p_t.team_id = p_rr.team_id
        WHERE r.season_year = :y
        ORDER BY r.round_number
        """,
        {"y": year},
    )
    return jsonify(rows)


@api.get("/search")
def search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([])

    pattern = f"%{q.lower()}%"
    results = []

    # Drivers (case-insensitive, parameterised)
    drivers = db.query(
        """
        SELECT driver_id, first_name, last_name, driver_code
        FROM driver
        WHERE LOWER(first_name || ' ' || last_name) LIKE :p
           OR LOWER(driver_code) LIKE :p
           OR LOWER(driver_ref) LIKE :p
        FETCH FIRST 5 ROWS ONLY
        """,
        {"p": pattern},
    )
    for d in drivers:
        results.append({
            "type": "driver",
            "id": d["driver_id"],
            "label": f"{d['first_name']} {d['last_name']}" + (f" ({d['driver_code']})" if d.get("driver_code") else ""),
            "link": f"#drivers?id={d['driver_id']}",
            "view": "drivers",
        })

    # Teams (case-insensitive, parameterised)
    teams = db.query(
        """
        SELECT team_id, team_name, constructor_ref
        FROM team
        WHERE LOWER(team_name) LIKE :p
           OR LOWER(constructor_ref) LIKE :p
        FETCH FIRST 5 ROWS ONLY
        """,
        {"p": pattern},
    )
    for t in teams:
        results.append({
            "type": "team",
            "id": t["team_id"],
            "label": t["team_name"],
            "link": f"#teams?id={t['team_id']}",
            "view": "teams",
        })

    # Races (case-insensitive, parameterised)
    races = db.query(
        """
        SELECT race_id, season_year, round_number, race_name
        FROM race
        WHERE LOWER(race_name) LIKE :p
           OR TO_CHAR(season_year) LIKE :p
        ORDER BY season_year DESC, round_number ASC
        FETCH FIRST 5 ROWS ONLY
        """,
        {"p": pattern},
    )
    for r in races:
        results.append({
            "type": "race",
            "id": r["race_id"],
            "season_year": r["season_year"],
            "round_number": r["round_number"],
            "label": f"{r['season_year']} {r['race_name']}",
            "link": f"#races/{r['race_id']}",
            "view": "calendar",
        })

    # Circuits (case-insensitive, parameterised)
    circuits = db.query(
        """
        SELECT circuit_id, circuit_ref, circuit_name, locality
        FROM circuit
        WHERE LOWER(circuit_name) LIKE :p
           OR LOWER(locality) LIKE :p
           OR LOWER(circuit_ref) LIKE :p
        FETCH FIRST 5 ROWS ONLY
        """,
        {"p": pattern},
    )
    for c in circuits:
        results.append({
            "type": "circuit",
            "id": c["circuit_id"],
            "circuit_ref": c["circuit_ref"],
            "label": c["circuit_name"] + (f" ({c['locality']})" if c.get("locality") else ""),
            "link": f"#circuits/{c['circuit_ref']}",
            "view": "calendar",
        })

    return jsonify(results[:10])



@api.get("/drivers")
def drivers():
    q = (request.args.get("q") or "").strip().lower()
    year = request.args.get("season", type=int)
    sql = """
        SELECT DISTINCT d.driver_id, d.driver_ref, d.driver_code, d.permanent_number,
               d.first_name, d.last_name, d.nationality, d.wikipedia_url, d.notes
        FROM driver d
    """
    params: dict = {}
    if year:
        sql += """
        JOIN driver_contract dc ON dc.driver_id = d.driver_id AND dc.season_year = :year
        """
        params["year"] = year
    if q:
        sql += """
        WHERE LOWER(d.first_name || ' ' || d.last_name || ' ' || d.driver_ref) LIKE :q
        """
        params["q"] = f"%{q}%"
    sql += " ORDER BY d.last_name, d.first_name"
    return jsonify(db.query(sql, params))


@api.get("/drivers/<int:driver_id>")
def driver_detail(driver_id: int):
    rows = db.query("SELECT * FROM driver WHERE driver_id = :id", {"id": driver_id})
    if not rows:
        return error("Driver not found", 404)
    contracts = db.query(
        """
        SELECT dc.*, t.team_name
        FROM driver_contract dc
        JOIN team t ON t.team_id = dc.team_id
        WHERE dc.driver_id = :id
        ORDER BY dc.season_year
        """,
        {"id": driver_id},
    )
    return jsonify({**rows[0], "contracts": contracts})


@api.put("/drivers/<int:driver_id>")
def update_driver(driver_id: int):
    body = request.get_json(silent=True) or {}
    notes = (body.get("notes") or "")[:400]
    wiki = (body.get("wikipedia_url") or None)
    count = db.execute(
        "UPDATE driver SET notes = :notes, wikipedia_url = NVL(:wiki, wikipedia_url) WHERE driver_id = :id",
        {"notes": notes, "wiki": wiki, "id": driver_id},
    )
    if count == 0:
        return error("Driver not found", 404)
    return jsonify({"updated": True})


@api.get("/drivers/<int:driver_id>/profile")
def driver_profile(driver_id: int):
    driver_rows = db.query(
        """
        SELECT driver_id, driver_ref, driver_code, permanent_number,
               first_name, last_name, nationality, wikipedia_url, notes
        FROM driver
        WHERE driver_id = :id
        """,
        {"id": driver_id},
    )
    if not driver_rows:
        return error("Driver not found", 404)
    driver_info = driver_rows[0]

    seasons = db.query(
        """
        SELECT
          s.season_year,
          s.team_id,
          s.team_name,
          s.primary_color,
          s.starts,
          s.wins,
          s.podiums,
          s.poles,
          s.points,
          s.dnfs,
          s.avg_finish,
          s.avg_grid,
          s.positions_gained,
          s.win_rate,
          s.win_pct,
          s.podium_rate,
          s.podium_pct,
          s.dnf_rate,
          s.dnf_pct,
          cs.championship_position
        FROM v_season_rate_metrics s
        LEFT JOIN v_driver_standings cs
          ON cs.season_year = s.season_year AND cs.driver_id = s.driver_id
        WHERE s.driver_id = :id
        ORDER BY s.season_year DESC
        """,
        {"id": driver_id},
    )

    total_starts = sum(s.get("starts") or 0 for s in seasons)
    total_wins = sum(s.get("wins") or 0 for s in seasons)
    total_podiums = sum(s.get("podiums") or 0 for s in seasons)
    total_poles = sum(s.get("poles") or 0 for s in seasons)
    total_points = sum(s.get("points") or 0 for s in seasons)
    total_dnfs = sum(s.get("dnfs") or 0 for s in seasons)
    career_win_rate = round(total_wins / total_starts, 4) if total_starts > 0 else 0.0
    career_win_pct = round(career_win_rate * 100, 2)
    career_podium_rate = round(total_podiums / total_starts, 4) if total_starts > 0 else 0.0
    career_podium_pct = round(career_podium_rate * 100, 2)
    career_dnf_rate = round(total_dnfs / total_starts, 4) if total_starts > 0 else 0.0
    career_dnf_pct = round(career_dnf_rate * 100, 2)

    latest_team = seasons[0]["team_name"] if seasons else None
    latest_color = seasons[0]["primary_color"] if seasons else "#e10600"
    latest_team_id = seasons[0]["team_id"] if seasons else None

    rounds = db.query(
        """
        SELECT
          r.season_year,
          r.round_number,
          r.race_name,
          SUM(rr.points) AS points,
          MAX(CASE WHEN rr.session_type = 'RACE' THEN rr.finish_position END) AS finish_position
        FROM race_result rr
        JOIN race r ON r.race_id = rr.race_id
        WHERE rr.driver_id = :id
          AND rr.is_verified = 'Y'
          AND rr.source_system <> 'ILLUSTRATIVE'
        GROUP BY r.season_year, r.round_number, r.race_name
        ORDER BY r.season_year ASC, r.round_number ASC
        """,
        {"id": driver_id},
    )

    return jsonify({
        **driver_info,
        "team_id": latest_team_id,
        "team_name": latest_team,
        "primary_color": latest_color,
        "career": {
            "starts": total_starts,
            "wins": total_wins,
            "podiums": total_podiums,
            "poles": total_poles,
            "points": total_points,
            "dnfs": total_dnfs,
            "win_rate": career_win_rate,
            "win_pct": career_win_pct,
            "podium_rate": career_podium_rate,
            "podium_pct": career_podium_pct,
            "dnf_rate": career_dnf_rate,
            "dnf_pct": career_dnf_pct,
            "seasons_count": len(seasons),
        },
        "seasons": seasons,
        "rounds": rounds,
    })


@api.get("/teams")
def teams():
    q = (request.args.get("q") or "").strip().lower()
    sql = "SELECT team_id, constructor_ref, team_name, nationality, wikipedia_url, primary_color, notes FROM team"
    params = {}
    if q:
        sql += " WHERE LOWER(team_name) LIKE :q"
        params["q"] = f"%{q}%"
    sql += " ORDER BY team_name"
    return jsonify(db.query(sql, params))


@api.get("/teams/<int:team_id>/profile")
def team_profile(team_id: int):
    team_rows = db.query(
        """
        SELECT team_id, constructor_ref, team_name, nationality,
               primary_color, wikipedia_url, notes
        FROM team
        WHERE team_id = :id
        """,
        {"id": team_id},
    )
    if not team_rows:
        return error("Team not found", 404)
    team_info = team_rows[0]

    seasons = db.query(
        """
        SELECT
          cs.season_year,
          cs.points,
          cs.race_wins AS wins,
          cs.podiums,
          cs.championship_position
        FROM v_constructor_standings cs
        WHERE cs.team_id = :id
        ORDER BY cs.season_year DESC
        """,
        {"id": team_id},
    )

    drivers = db.query(
        """
        SELECT
          r.season_year,
          d.driver_id,
          d.first_name || ' ' || d.last_name AS driver_name,
          d.driver_code,
          SUM(rr.points) AS points,
          SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podiums
        FROM race_result rr
        JOIN race r ON r.race_id = rr.race_id
        JOIN driver d ON d.driver_id = rr.driver_id
        WHERE rr.team_id = :id
          AND rr.is_verified = 'Y'
          AND rr.source_system <> 'ILLUSTRATIVE'
        GROUP BY r.season_year, d.driver_id, d.first_name, d.last_name, d.driver_code
        ORDER BY r.season_year DESC, points DESC
        """,
        {"id": team_id},
    )

    team_season_points = {s["season_year"]: s["points"] for s in seasons}
    for drv in drivers:
        t_pts = team_season_points.get(drv["season_year"], 0)
        drv["contribution_pct"] = round((drv["points"] / t_pts) * 100, 1) if t_pts > 0 else 0.0

    total_points = sum(s.get("points") or 0 for s in seasons)
    total_wins = sum(s.get("wins") or 0 for s in seasons)
    total_podiums = sum(s.get("podiums") or 0 for s in seasons)

    return jsonify({
        **team_info,
        "career": {
            "points": total_points,
            "wins": total_wins,
            "podiums": total_podiums,
            "seasons_count": len(seasons),
        },
        "seasons": seasons,
        "drivers": drivers,
    })


@api.get("/head-to-head")
def head_to_head():
    season = request.args.get("season", type=int)
    driver_a_id = request.args.get("driver_a", type=int)
    driver_b_id = request.args.get("driver_b", type=int)

    if not season or not driver_a_id or not driver_b_id:
        return error("season, driver_a, and driver_b are required", 400)
    if driver_a_id == driver_b_id:
        return error("driver_a and driver_b must be different drivers", 400)

    rows = db.query(
        """
        SELECT *
        FROM v_head_to_head
        WHERE season_year = :season
          AND driver_a_id = :da
          AND driver_b_id = :db
        """,
        {"season": season, "da": driver_a_id, "db": driver_b_id},
    )
    if not rows:
        return error("No head-to-head record found for the specified drivers in this season", 404)

    h2h = rows[0]

    driver_meta = db.query(
        """
        SELECT driver_id, team_name, primary_color, nationality
        FROM (
          SELECT s.driver_id, s.team_name, s.primary_color, d.nationality
          FROM v_driver_profile_stats s
          JOIN driver d ON d.driver_id = s.driver_id
          WHERE s.season_year = :season
            AND s.driver_id IN (:da, :db)
        )
        """,
        {"season": season, "da": driver_a_id, "db": driver_b_id},
    )
    meta_map = {m["driver_id"]: m for m in driver_meta}
    meta_a = meta_map.get(driver_a_id, {})
    meta_b = meta_map.get(driver_b_id, {})

    da_pts = h2h.get("driver_a_points") or 0
    db_pts = h2h.get("driver_b_points") or 0
    da_wins = h2h.get("driver_a_wins") or 0
    db_wins = h2h.get("driver_b_wins") or 0
    da_pods = h2h.get("driver_a_podiums") or 0
    db_pods = h2h.get("driver_b_podiums") or 0
    da_races = h2h.get("driver_a_races_ahead") or 0
    db_races = h2h.get("driver_b_races_ahead") or 0
    da_quali = h2h.get("driver_a_quali_ahead") or 0
    db_quali = h2h.get("driver_b_quali_ahead") or 0
    da_avg_fin = h2h.get("driver_a_avg_finish")
    db_avg_fin = h2h.get("driver_b_avg_finish")

    metrics = [
        {
            "key": "points",
            "label": "Championship points",
            "driver_a": da_pts,
            "driver_b": db_pts,
            "advantage": "a" if da_pts > db_pts else ("b" if db_pts > da_pts else "tie"),
        },
        {
            "key": "wins",
            "label": "Grand Prix wins",
            "driver_a": da_wins,
            "driver_b": db_wins,
            "advantage": "a" if da_wins > db_wins else ("b" if db_wins > da_wins else "tie"),
        },
        {
            "key": "podiums",
            "label": "Podium finishes",
            "driver_a": da_pods,
            "driver_b": db_pods,
            "advantage": "a" if da_pods > db_pods else ("b" if db_pods > da_pods else "tie"),
        },
        {
            "key": "races_ahead",
            "label": "Races finished ahead",
            "driver_a": da_races,
            "driver_b": db_races,
            "advantage": "a" if da_races > db_races else ("b" if db_races > da_races else "tie"),
        },
        {
            "key": "quali_ahead",
            "label": "Qualifying head-to-head",
            "driver_a": da_quali,
            "driver_b": db_quali,
            "advantage": "a" if da_quali > db_quali else ("b" if db_quali > da_quali else "tie"),
        },
        {
            "key": "avg_finish",
            "label": "Average finish position",
            "driver_a": da_avg_fin,
            "driver_b": db_avg_fin,
            "advantage": (
                "a" if (da_avg_fin and db_avg_fin and da_avg_fin < db_avg_fin)
                else ("b" if (da_avg_fin and db_avg_fin and db_avg_fin < da_avg_fin) else "tie")
            ),
        },
    ]

    return jsonify({
        "season_year": season,
        "driver_a": {
            "driver_id": driver_a_id,
            "name": h2h["driver_a_name"],
            "code": h2h["driver_a_code"],
            "team_name": meta_a.get("team_name"),
            "primary_color": meta_a.get("primary_color") or "#e10600",
            "nationality": meta_a.get("nationality"),
            "points": da_pts,
            "wins": da_wins,
            "podiums": da_pods,
            "races_ahead": da_races,
            "quali_ahead": da_quali,
            "avg_finish": da_avg_fin,
        },
        "driver_b": {
            "driver_id": driver_b_id,
            "name": h2h["driver_b_name"],
            "code": h2h["driver_b_code"],
            "team_name": meta_b.get("team_name"),
            "primary_color": meta_b.get("primary_color") or "#e10600",
            "nationality": meta_b.get("nationality"),
            "points": db_pts,
            "wins": db_wins,
            "podiums": db_pods,
            "races_ahead": db_races,
            "quali_ahead": db_quali,
            "avg_finish": db_avg_fin,
        },
        "metrics": metrics,
    })


@api.get("/seasons/<int:year>/rate-metrics")
def season_rate_metrics(year: int):
    rows = db.query(
        """
        SELECT
          season_year,
          driver_id,
          driver_ref,
          first_name,
          last_name,
          driver_code,
          permanent_number,
          team_id,
          team_name,
          primary_color,
          starts,
          wins,
          podiums,
          poles,
          points,
          dnfs,
          avg_finish,
          avg_grid,
          positions_gained,
          win_rate,
          win_pct,
          podium_rate,
          podium_pct,
          dnf_rate,
          dnf_pct
        FROM v_season_rate_metrics
        WHERE season_year = :y
        ORDER BY points DESC
        """,
        {"y": year},
    )
    return jsonify(rows)


@api.put("/teams/<int:team_id>")
def update_team(team_id: int):
    body = request.get_json(silent=True) or {}
    color = body.get("primary_color")
    notes = (body.get("notes") or "")[:400]
    count = db.execute(
        """
        UPDATE team
        SET primary_color = NVL(:color, primary_color), notes = :notes
        WHERE team_id = :id
        """,
        {"color": color, "notes": notes, "id": team_id},
    )
    if count == 0:
        return error("Team not found", 404)
    return jsonify({"updated": True})


@api.get("/circuits")
def circuits():
    rows = db.query(
        """
        SELECT c.circuit_id, c.circuit_ref, c.circuit_name, c.locality, c.latitude, c.longitude,
               co.country_name
        FROM circuit c
        LEFT JOIN country co ON co.country_id = c.country_id
        ORDER BY c.circuit_name
        """
    )
    return jsonify(rows)


@api.get("/penalties")
def list_penalties():
    year = request.args.get("season", type=int)
    sql = """
        SELECT p.*, d.first_name, d.last_name, t.team_name, r.race_name, r.season_year
        FROM penalty p
        LEFT JOIN driver d ON d.driver_id = p.driver_id
        LEFT JOIN team t ON t.team_id = p.team_id
        LEFT JOIN race r ON r.race_id = p.race_id
        WHERE 1 = 1
    """
    params: dict = {}
    if year:
        sql += " AND r.season_year = :y"
        params["y"] = year
    sql += " ORDER BY p.created_at DESC"
    return jsonify(db.query(sql, params))


@api.post("/penalties")
def create_penalty():
    body = request.get_json(silent=True) or {}
    penalty_type = (body.get("penalty_type") or "").strip()
    if not penalty_type:
        return error("penalty_type is required")
    db.execute(
        """
        INSERT INTO penalty (race_id, driver_id, team_id, penalty_type, description, points_penalty, is_illustrative)
        VALUES (:race_id, :driver_id, :team_id, :penalty_type, :description, :points_penalty, 'Y')
        """,
        {
            "race_id": body.get("race_id"),
            "driver_id": body.get("driver_id"),
            "team_id": body.get("team_id"),
            "penalty_type": penalty_type[:80],
            "description": (body.get("description") or "")[:400],
            "points_penalty": body.get("points_penalty") or 0,
        },
    )
    return jsonify({"created": True, "is_illustrative": True}), 201


@api.delete("/penalties/<int:penalty_id>")
def delete_penalty(penalty_id: int):
    count = db.execute(
        "DELETE FROM penalty WHERE penalty_id = :id AND is_illustrative = 'Y'",
        {"id": penalty_id},
    )
    if count == 0:
        return error("Illustrative penalty not found", 404)
    return jsonify({"deleted": True})


@api.get("/sponsors")
def list_sponsors():
    return jsonify(
        db.query(
            """
            SELECT s.*, c.country_name
            FROM sponsor s
            LEFT JOIN country c ON c.country_id = s.country_id
            ORDER BY s.sponsor_name
            """
        )
    )


@api.post("/sponsors")
def create_sponsor():
    body = request.get_json(silent=True) or {}
    name = (body.get("sponsor_name") or "").strip()
    if not name:
        return error("sponsor_name is required")
    try:
        db.execute(
            """
            INSERT INTO sponsor (sponsor_name, industry, website_url, notes, is_illustrative)
            VALUES (:name, :industry, :website, :notes, 'Y')
            """,
            {
                "name": name[:120],
                "industry": (body.get("industry") or "")[:80],
                "website": (body.get("website_url") or "")[:400],
                "notes": (body.get("notes") or "")[:400],
            },
        )
    except Exception:
        return error("Could not create sponsor (duplicate name?)", 409)
    return jsonify({"created": True, "is_illustrative": True}), 201


@api.put("/sponsors/<int:sponsor_id>")
def update_sponsor(sponsor_id: int):
    body = request.get_json(silent=True) or {}
    name = (body.get("sponsor_name") or "").strip()
    if not name:
        return error("sponsor_name is required")
    count = db.execute(
        """
        UPDATE sponsor
        SET sponsor_name = :name, industry = :industry, website_url = :website, notes = :notes
        WHERE sponsor_id = :id
        """,
        {
            "name": name[:120],
            "industry": (body.get("industry") or "")[:80],
            "website": (body.get("website_url") or "")[:400],
            "notes": (body.get("notes") or "")[:400],
            "id": sponsor_id,
        },
    )
    if count == 0:
        return error("Sponsor not found", 404)
    return jsonify({"updated": True})


@api.delete("/sponsors/<int:sponsor_id>")
def delete_sponsor(sponsor_id: int):
    db.execute("DELETE FROM team_sponsor WHERE sponsor_id = :id", {"id": sponsor_id})
    count = db.execute(
        "DELETE FROM sponsor WHERE sponsor_id = :id AND is_illustrative = 'Y'",
        {"id": sponsor_id},
    )
    if count == 0:
        return error("Illustrative sponsor not found", 404)
    return jsonify({"deleted": True})


@api.get("/team-sponsors")
def team_sponsors():
    year = request.args.get("season", type=int)
    sql = """
        SELECT ts.*, t.team_name, s.sponsor_name
        FROM team_sponsor ts
        JOIN team t ON t.team_id = ts.team_id
        JOIN sponsor s ON s.sponsor_id = ts.sponsor_id
        WHERE 1 = 1
    """
    params = {}
    if year:
        sql += " AND ts.season_year = :y"
        params["y"] = year
    sql += " ORDER BY t.team_name, s.sponsor_name"
    return jsonify(db.query(sql, params))


@api.post("/team-sponsors")
def assign_sponsor():
    body = request.get_json(silent=True) or {}
    try:
        team_id = int(body["team_id"])
        sponsor_id = int(body["sponsor_id"])
        year = int(body["season_year"])
    except (KeyError, TypeError, ValueError):
        return error("team_id, sponsor_id and season_year are required")
    try:
        with db.connection() as conn:
            cur = conn.cursor()
            cur.callproc(
                "prc_assign_sponsor",
                [team_id, sponsor_id, year, (body.get("deal_note") or "")[:200]],
            )
    except Exception as exc:
        msg = str(exc)
        if "ORA-20012" in msg:
            return error("Team, sponsor and season must already exist")
        if "ORA-20013" in msg:
            return error("Sponsor already assigned for that team and season", 409)
        return error("Could not assign sponsor", 409)
    return jsonify({"created": True, "is_illustrative": True}), 201


@api.delete("/team-sponsors/<int:team_id>/<int:sponsor_id>/<int:year>")
def unassign_sponsor(team_id, sponsor_id, year):
    count = db.execute(
        """
        DELETE FROM team_sponsor
        WHERE team_id = :t AND sponsor_id = :s AND season_year = :y AND is_illustrative = 'Y'
        """,
        {"t": team_id, "s": sponsor_id, "y": year},
    )
    if count == 0:
        return error("Assignment not found", 404)
    return jsonify({"deleted": True})


ANALYTICS = {
    "top-drivers-2025-wins": {
        "title": "Top 5 Drivers by 2025 Grand Prix Wins",
        "explanation": "Aggregates verified 2025 Grand Prix victories per driver and constructor using INNER JOINs and GROUP BY, ordered by highest win count.",
        "tags": ["JOIN", "GROUP BY", "AGGREGATION"],
        "sql": """
            SELECT
              d.first_name || ' ' || d.last_name AS driver_name,
              t.team_name,
              COUNT(*) AS race_wins
            FROM race_result rr
            JOIN race r ON r.race_id = rr.race_id
            JOIN driver d ON d.driver_id = rr.driver_id
            JOIN team t ON t.team_id = rr.team_id
            WHERE r.season_year = 2025
              AND rr.session_type = 'RACE'
              AND rr.finish_position = 1
              AND rr.is_verified = 'Y'
            GROUP BY d.driver_id, d.first_name, d.last_name, t.team_name
            ORDER BY race_wins DESC, driver_name ASC
            FETCH FIRST 5 ROWS ONLY
        """,
    },
    "race-podium": {
        "title": "2024 Monaco Grand Prix Podium Classification",
        "explanation": "Retrieves the top-3 podium finishers for the 2024 Monaco Grand Prix, showing driver, constructor, starting grid position, points, and total race time.",
        "tags": ["JOIN", "FILTERING", "ORDER BY"],
        "sql": """
            SELECT
              rr.finish_position AS podium_step,
              d.first_name || ' ' || d.last_name AS driver_name,
              t.team_name,
              rr.grid_position,
              rr.points,
              rr.time_text AS race_time
            FROM race_result rr
            JOIN race r ON r.race_id = rr.race_id
            JOIN driver d ON d.driver_id = rr.driver_id
            JOIN team t ON t.team_id = rr.team_id
            WHERE r.season_year = 2024
              AND r.race_name = 'Monaco Grand Prix'
              AND rr.session_type = 'RACE'
              AND rr.finish_position BETWEEN 1 AND 3
              AND rr.is_verified = 'Y'
            ORDER BY rr.finish_position ASC
        """,
    },
    "rank-above-average": {
        "title": "Championship Ranking with RANK() & Above-Average Subquery",
        "explanation": "Computes dynamic driver rankings using the RANK() analytic window function over v_driver_standings, filtered by a scalar subquery returning the season average points.",
        "tags": ["WINDOW FUNCTION", "SUBQUERY", "VIEW"],
        "sql": """
            SELECT
              RANK() OVER (ORDER BY ds.points DESC) AS championship_rank,
              ds.first_name || ' ' || ds.last_name AS driver_name,
              ds.points,
              ds.race_wins,
              ROUND((SELECT AVG(points) FROM v_driver_standings WHERE season_year = 2024), 2) AS season_average
            FROM v_driver_standings ds
            WHERE ds.season_year = 2024
              AND ds.points > (
                SELECT AVG(points)
                FROM v_driver_standings
                WHERE season_year = 2024
              )
            ORDER BY ds.points DESC
        """,
    },
    "biggest-grid-gainers": {
        "title": "Biggest Grid-to-Finish Position Gainers",
        "explanation": "Queries the analytical view v_race_grid_finish to identify drivers who gained the highest number of net positions between starting grid and final Grand Prix classification.",
        "tags": ["VIEW", "FILTERING", "SORTING"],
        "sql": """
            SELECT
              driver_name,
              team_name,
              race_name,
              season_year,
              grid_position,
              finish_position,
              positions_gained
            FROM v_race_grid_finish
            WHERE positions_gained > 0
            ORDER BY positions_gained DESC, finish_position ASC
            FETCH FIRST 10 ROWS ONLY
        """,
    },
    "constructors-having-wins": {
        "title": "Constructors with >5 Wins (GROUP BY & HAVING)",
        "explanation": "Aggregates Grand Prix victories across all seasons grouped by constructor, applying a HAVING filter to restrict results to dominant teams with more than 5 total wins.",
        "tags": ["JOIN", "GROUP BY", "HAVING"],
        "sql": """
            SELECT
              t.team_name,
              COUNT(*) AS total_wins,
              MIN(r.season_year) AS first_win_season,
              MAX(r.season_year) AS latest_win_season
            FROM race_result rr
            JOIN race r ON r.race_id = rr.race_id
            JOIN team t ON t.team_id = rr.team_id
            WHERE rr.session_type = 'RACE'
              AND rr.finish_position = 1
              AND rr.is_verified = 'Y'
            GROUP BY t.team_name
            HAVING COUNT(*) > 5
            ORDER BY total_wins DESC
        """,
    },
}


@api.get("/analytics/queries")
def analytics_list():
    return jsonify([
        {
            "id": k,
            "title": v["title"],
            "explanation": v["explanation"],
            "tags": v["tags"],
            "sql": v["sql"].strip(),
        }
        for k, v in ANALYTICS.items()
    ])


@api.route("/analytics/run/<query_id>", methods=["GET", "POST"])
def analytics_run(query_id: str):
    spec = ANALYTICS.get(query_id)
    if not spec:
        return error("Unknown analytics query", 404)
    try:
        t0 = time.perf_counter()
        rows = db.query(spec["sql"])
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception as ex:
        return error(f"Analytics query failed: {ex}", 500)
    cols = list(rows[0].keys()) if rows else []
    return jsonify({
        "id": query_id,
        "title": spec["title"],
        "explanation": spec["explanation"],
        "tags": spec["tags"],
        "sql": spec["sql"].strip(),
        "columns": cols,
        "rows": rows,
        "row_count": len(rows),
        "execution_time_ms": duration_ms,
    })


@api.post("/analytics/console")
def analytics_console():
    # Only accept requests originating from 127.0.0.1 / localhost
    remote_ip = request.remote_addr or ""
    if remote_ip not in ("127.0.0.1", "::1", "localhost"):
        return error("Console access restricted to 127.0.0.1", 403)

    body = request.get_json(silent=True) or {}
    raw_sql = (body.get("sql") or "").strip()
    if not raw_sql:
        return error("SQL query cannot be empty", 400)

    # Disallow multiple statements or semicolon injection
    if ";" in raw_sql:
        return error("Semicolons are not allowed. Submit a single statement only.", 400)

    # Disallow comments that can hide keywords or bypass parsing (-- or /* */)
    if "--" in raw_sql or "/*" in raw_sql or "*/" in raw_sql:
        return error("Comments (-- or /* */) are not permitted in the safe console.", 400)

    # Only single SELECT or WITH statements allowed
    if not re.match(r"^\s*(SELECT|WITH)\b", raw_sql, re.IGNORECASE):
        return error("Only single SELECT or WITH statements are allowed in the safe console.", 400)

    # Block destructive, mutating, DDL, privilege, and procedural keywords
    blocked = [
        "INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "ALTER",
        "TRUNCATE", "CREATE", "GRANT", "REVOKE", "EXECUTE", "CALL",
        "BEGIN", "DECLARE"
    ]
    pattern = r"\b(" + "|".join(blocked) + r")\b"
    match = re.search(pattern, raw_sql, re.IGNORECASE)
    if match:
        return error(f"Operation rejected: keyword '{match.group(0).upper()}' is forbidden.", 400)

    # SAFETY EXCEPTION: This console endpoint deliberately executes dynamic SQL entered by
    # the user, which is an intentional exception to the project's 'bind variables only' rule.
    # Strict safeguards are enforced:
    # 1. Localhost only (127.0.0.1 / ::1).
    # 2. Strict syntax whitelist: single SELECT or WITH statements only.
    # 3. Rejection of semicolons and SQL comments (-- or /* */) to prevent chained statements.
    # 4. Strict blacklist of mutation, DDL, privilege, and procedural keywords.
    # 5. Queries execute through a dedicated viewer pool (f1_viewer read-only credentials when configured).
    # 6. Hard limit of 200 rows and a 10-second call timeout.
    try:
        cols, rows, duration_ms = db.run_console_query(raw_sql, max_rows=200, timeout_ms=10000)
        return jsonify({
            "columns": cols,
            "rows": rows,
            "row_count": len(rows),
            "execution_time_ms": duration_ms,
            "capped": len(rows) == 200,
        })
    except oracledb.DatabaseError as db_err:
        error_obj, = db_err.args
        msg = error_obj.message if hasattr(error_obj, "message") else str(db_err)
        return error(f"Oracle Error: {msg}", 400)
    except Exception as ex:
        return error(f"Execution error: {ex}", 400)


@api.post("/analytics/trigger-demo")
def analytics_trigger_demo():
    """
    Demonstration of the trg_race_result_protect trigger.
    Tries to DELETE one verified historical race result inside a transaction,
    catches the expected ORA-20001 error, ALWAYS rolls back, and verifies
    that the table row count before and after remains identical.
    """
    remote_ip = request.remote_addr or ""
    if remote_ip not in ("127.0.0.1", "::1", "localhost"):
        return error("Trigger demo access restricted to 127.0.0.1", 403)

    try:
        with db.connection() as conn:
            cur = conn.cursor()
            # 1. Row count before
            cur.execute("SELECT COUNT(*) FROM race_result")
            count_before = cur.fetchone()[0]

            # 2. Pick a verified historical race result
            cur.execute(
                """
                SELECT result_id, race_id, driver_id
                FROM race_result
                WHERE source_system = 'JOLPICA' AND is_verified = 'Y'
                FETCH FIRST 1 ROW ONLY
                """
            )
            row = cur.fetchone()
            if not row:
                return error("No verified historical race results found to test trigger", 404)
            target_id = row[0]
            attempted_sql = f"DELETE FROM race_result WHERE result_id = {target_id}"

            caught_error = None
            try:
                cur.execute("DELETE FROM race_result WHERE result_id = :id", {"id": target_id})
            except oracledb.DatabaseError as db_err:
                error_obj, = db_err.args
                caught_error = error_obj.message if hasattr(error_obj, "message") else str(db_err)
            finally:
                # ALWAYS roll back
                conn.rollback()

            # 3. Row count after
            cur.execute("SELECT COUNT(*) FROM race_result")
            count_after = cur.fetchone()[0]

            return jsonify({
                "attempted_sql": attempted_sql,
                "target_id": target_id,
                "oracle_error": caught_error,
                "status": "rolled_back",
                "message": "Rolled back, no data changed",
                "row_count_before": count_before,
                "row_count_after": count_after,
                "verified_unchanged": count_before == count_after,
            })
    except Exception as ex:
        return error(f"Trigger demo failed: {ex}", 500)


# ==============================================================================
# 2026 Season Management & Manual Data Entry CRUD
# ==============================================================================

@api.get("/countries")
def get_countries():
    rows = db.query("SELECT country_id, country_code, country_name FROM country ORDER BY country_name")
    return jsonify(rows)


@api.get("/seasons/<int:year>/management-status")
def season_management_status(year: int):
    season_rows = db.query("SELECT * FROM season WHERE season_year = :y", {"y": year})
    if not season_rows:
        return error("Season not found", 404)
    s = season_rows[0]
    is_manual = "manual" in (s.get("notes") or "").lower() or year == 2026
    races = db.query(
        """
        SELECT r.race_id, r.round_number, r.race_name, r.has_sprint, r.race_date, r.source_system,
               c.circuit_name, c.locality,
               (SELECT COUNT(*) FROM race_result rr WHERE rr.race_id = r.race_id) AS total_results,
               (SELECT COUNT(*) FROM race_result rr WHERE rr.race_id = r.race_id AND rr.is_verified = 'Y') AS verified_results,
               (SELECT COUNT(*) FROM race_result rr WHERE rr.race_id = r.race_id AND rr.is_verified = 'N') AS unverified_results,
               (SELECT COUNT(*) FROM qualifying_result qr WHERE qr.race_id = r.race_id) AS total_quali,
               (SELECT COUNT(*) FROM qualifying_result qr WHERE qr.race_id = r.race_id AND qr.is_verified = 'Y') AS verified_quali
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        WHERE r.season_year = :y
        ORDER BY r.round_number
        """,
        {"y": year},
    )
    total_races = len(races)
    total_results = sum(r.get("total_results") or 0 for r in races)
    verified_results = sum(r.get("verified_results") or 0 for r in races)
    unverified_results = sum(r.get("unverified_results") or 0 for r in races)
    total_quali = sum(r.get("total_quali") or 0 for r in races)
    verified_quali = sum(r.get("verified_quali") or 0 for r in races)

    return jsonify({
        "season_year": year,
        "season_name": s.get("season_name"),
        "notes": s.get("notes"),
        "is_manual": is_manual,
        "total_races": total_races,
        "total_results": total_results,
        "verified_results": verified_results,
        "unverified_results": unverified_results,
        "total_qualifying": total_quali,
        "verified_qualifying": verified_quali,
        "races": races,
    })


@api.post("/races")
def create_race():
    body = request.get_json(silent=True) or {}
    season_year = body.get("season_year")
    round_number = body.get("round_number")
    race_name = (body.get("race_name") or "").strip()
    circuit_id = body.get("circuit_id")
    race_date = (body.get("race_date") or "").strip() or None
    race_time_utc = (body.get("race_time_utc") or "").strip() or None
    has_sprint = (body.get("has_sprint") or "N").strip().upper()

    if not season_year or not round_number or not race_name or not circuit_id:
        return error("season_year, round_number, race_name, and circuit_id are required", 400)

    try:
        round_number = int(round_number)
        season_year = int(season_year)
        circuit_id = int(circuit_id)
    except (ValueError, TypeError):
        return error("round_number, season_year, and circuit_id must be integers", 400)

    if not (1 <= round_number <= 30):
        return error("round_number must be between 1 and 30", 400)
    if has_sprint not in ("Y", "N"):
        return error("has_sprint must be 'Y' or 'N'", 400)

    # Check season exists
    s_exists = db.query("SELECT season_year FROM season WHERE season_year = :y", {"y": season_year})
    if not s_exists:
        return error(f"Season {season_year} does not exist", 400)

    # Check circuit exists
    c_exists = db.query("SELECT circuit_id FROM circuit WHERE circuit_id = :id", {"id": circuit_id})
    if not c_exists:
        return error(f"Circuit {circuit_id} does not exist", 400)

    # Check duplicate round
    dup = db.query(
        "SELECT race_id, race_name FROM race WHERE season_year = :y AND round_number = :rnd",
        {"y": season_year, "rnd": round_number},
    )
    if dup:
        return error(f"Round {round_number} already exists for season {season_year} ({dup[0]['race_name']})", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO race (season_year, round_number, circuit_id, race_name,
                              race_date, race_time_utc, has_sprint, source_system)
            VALUES (:yr, :rnd, :cid, :rname,
                    CASE WHEN :rdate IS NOT NULL THEN TO_DATE(:rdate, 'YYYY-MM-DD') ELSE NULL END,
                    :rtime, :sprint, 'MANUAL')
            RETURNING race_id INTO :new_id
            """,
            {
                "yr": season_year,
                "rnd": round_number,
                "cid": circuit_id,
                "rname": race_name,
                "rdate": race_date,
                "rtime": race_time_utc,
                "sprint": has_sprint,
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query(
        """
        SELECT r.*, c.circuit_name, c.locality, c.circuit_ref
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        WHERE r.race_id = :id
        """,
        {"id": new_id},
    )
    return jsonify(created[0] if created else {"race_id": new_id}), 201


@api.put("/races/<int:race_id>")
def update_race(race_id: int):
    existing = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not existing:
        return error("Race not found", 404)
    r = existing[0]
    if r.get("source_system") == "JOLPICA":
        return error("Verified historical races cannot be edited", 403)

    body = request.get_json(silent=True) or {}
    race_name = (body.get("race_name") or r["race_name"]).strip()
    circuit_id = body.get("circuit_id") or r["circuit_id"]
    race_date = body.get("race_date")
    if race_date is not None:
        race_date = str(race_date).strip()[:10] or None
    race_time_utc = body.get("race_time_utc") or r.get("race_time_utc")
    has_sprint = (body.get("has_sprint") or r.get("has_sprint") or "N").strip().upper()
    round_number = body.get("round_number") or r["round_number"]

    try:
        round_number = int(round_number)
        circuit_id = int(circuit_id)
    except (ValueError, TypeError):
        return error("round_number and circuit_id must be integers", 400)

    if not (1 <= round_number <= 30):
        return error("round_number must be between 1 and 30", 400)
    if has_sprint not in ("Y", "N"):
        return error("has_sprint must be 'Y' or 'N'", 400)

    if round_number != r["round_number"]:
        dup = db.query(
            "SELECT race_id FROM race WHERE season_year = :y AND round_number = :rnd AND race_id <> :id",
            {"y": r["season_year"], "rnd": round_number, "id": race_id},
        )
        if dup:
            return error(f"Round {round_number} already exists for season {r['season_year']}", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE race
            SET race_name = :rname,
                circuit_id = :cid,
                round_number = :rnd,
                race_date = CASE WHEN :rdate IS NOT NULL THEN TO_DATE(:rdate, 'YYYY-MM-DD') ELSE NULL END,
                race_time_utc = :rtime,
                has_sprint = :sprint
            WHERE race_id = :id
            """,
            {
                "rname": race_name,
                "cid": circuit_id,
                "rnd": round_number,
                "rdate": race_date,
                "rtime": race_time_utc,
                "sprint": has_sprint,
                "id": race_id,
            },
        )
        conn.commit()

    updated = db.query(
        """
        SELECT r.*, c.circuit_name, c.locality, c.circuit_ref
        FROM race r
        JOIN circuit c ON c.circuit_id = r.circuit_id
        WHERE r.race_id = :id
        """,
        {"id": race_id},
    )
    return jsonify(updated[0])


@api.delete("/races/<int:race_id>")
def delete_race(race_id: int):
    existing = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not existing:
        return error("Race not found", 404)
    r = existing[0]
    if r.get("source_system") == "JOLPICA":
        return error("Verified historical races cannot be deleted", 403)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM qualifying_result WHERE race_id = :id", {"id": race_id})
        cur.execute("DELETE FROM race_result WHERE race_id = :id", {"id": race_id})
        cur.execute("DELETE FROM pit_stop WHERE race_id = :id", {"id": race_id})
        cur.execute("DELETE FROM penalty WHERE race_id = :id", {"id": race_id})
        cur.execute("DELETE FROM race WHERE race_id = :id", {"id": race_id})
        conn.commit()

    return jsonify({"deleted": True, "race_id": race_id})


@api.get("/results/<int:result_id>")
def get_race_result(result_id: int):
    rows = db.query(
        """
        SELECT rr.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM race_result rr
        JOIN driver d ON d.driver_id = rr.driver_id
        JOIN team t ON t.team_id = rr.team_id
        WHERE rr.result_id = :id
        """,
        {"id": result_id},
    )
    if not rows:
        return error("Result not found", 404)
    return jsonify(rows[0])


@api.post("/races/<int:race_id>/results")
def create_race_result(race_id: int):
    race_rows = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not race_rows:
        return error("Race not found", 404)
    race = race_rows[0]

    body = request.get_json(silent=True) or {}
    driver_id = body.get("driver_id")
    team_id = body.get("team_id")
    session_type = (body.get("session_type") or "RACE").strip().upper()
    grid_pos = body.get("grid_position")
    finish_pos = body.get("finish_position")
    pos_text = (body.get("position_text") or (str(finish_pos) if finish_pos else "DNF")).strip()
    status = (body.get("classification_status") or "Finished").strip()
    points = body.get("points")
    laps = body.get("laps_completed")
    time_text = (body.get("time_text") or "").strip() or None
    fastest_lap = body.get("fastest_lap")
    fastest_lap_time = (body.get("fastest_lap_time") or "").strip() or None
    is_verified = (body.get("is_verified") or "N").strip().upper()

    if not driver_id or not team_id or not status:
        return error("driver_id, team_id, and classification_status are required", 400)
    if session_type not in ("RACE", "SPRINT"):
        return error("session_type must be RACE or SPRINT", 400)
    if session_type == "SPRINT" and race.get("has_sprint") != "Y":
        return error("This race weekend does not include a sprint session", 400)
    if is_verified not in ("Y", "N"):
        return error("is_verified must be 'Y' or 'N'", 400)

    try:
        driver_id = int(driver_id)
        team_id = int(team_id)
        grid_pos = int(grid_pos) if grid_pos is not None and str(grid_pos).strip() != "" else None
        finish_pos = int(finish_pos) if finish_pos is not None and str(finish_pos).strip() != "" else None
        laps = int(laps) if laps is not None and str(laps).strip() != "" else None
        fastest_lap = int(fastest_lap) if fastest_lap is not None and str(fastest_lap).strip() != "" else None
        points = float(points) if points is not None and str(points).strip() != "" else 0.0
    except (ValueError, TypeError):
        return error("Invalid numeric field format", 400)

    if points < 0:
        return error("Points must be non-negative", 400)
    if grid_pos is not None and not (0 <= grid_pos <= 30):
        return error("grid_position must be between 0 and 30", 400)
    if finish_pos is not None and not (1 <= finish_pos <= 30):
        return error("finish_position must be between 1 and 30", 400)

    # Check driver exists
    d_exists = db.query("SELECT driver_id, first_name, last_name FROM driver WHERE driver_id = :id", {"id": driver_id})
    if not d_exists:
        return error(f"Driver {driver_id} does not exist", 400)

    # Check team exists
    t_exists = db.query("SELECT team_id FROM team WHERE team_id = :id", {"id": team_id})
    if not t_exists:
        return error(f"Team {team_id} does not exist", 400)

    # Check duplicate driver in session
    dup = db.query(
        """
        SELECT result_id FROM race_result
        WHERE race_id = :rid AND driver_id = :did AND session_type = :stype
        """,
        {"rid": race_id, "did": driver_id, "stype": session_type},
    )
    if dup:
        d_name = f"{d_exists[0]['first_name']} {d_exists[0]['last_name']}"
        return error(f"Driver {d_name} already has a {session_type} result for this race", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO race_result (
              race_id, driver_id, team_id, session_type,
              grid_position, finish_position, position_text,
              classification_status, points, laps_completed,
              time_text, fastest_lap, fastest_lap_time,
              source_system, is_verified
            ) VALUES (
              :rid, :did, :tid, :stype,
              :grid, :fin, :ptext,
              :cstatus, :pts, :laps,
              :ttext, :flap, :flaptime,
              'MANUAL', :ver
            )
            RETURNING result_id INTO :new_id
            """,
            {
                "rid": race_id,
                "did": driver_id,
                "tid": team_id,
                "stype": session_type,
                "grid": grid_pos,
                "fin": finish_pos,
                "ptext": pos_text[:8],
                "cstatus": status[:80],
                "pts": points,
                "laps": laps,
                "ttext": time_text,
                "flap": fastest_lap,
                "flaptime": fastest_lap_time,
                "ver": is_verified,
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query(
        """
        SELECT rr.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM race_result rr
        JOIN driver d ON d.driver_id = rr.driver_id
        JOIN team t ON t.team_id = rr.team_id
        WHERE rr.result_id = :id
        """,
        {"id": new_id},
    )
    return jsonify(created[0] if created else {"result_id": new_id}), 201


@api.put("/results/<int:result_id>")
def update_race_result(result_id: int):
    existing = db.query("SELECT * FROM race_result WHERE result_id = :id", {"id": result_id})
    if not existing:
        return error("Result not found", 404)
    r = existing[0]
    if r.get("source_system") == "JOLPICA" and r.get("is_verified") == "Y":
        return error("Verified historical results cannot be modified", 403)

    body = request.get_json(silent=True) or {}
    team_id = body.get("team_id", r["team_id"])
    grid_pos = body.get("grid_position", r.get("grid_position"))
    finish_pos = body.get("finish_position", r.get("finish_position"))
    pos_text = body.get("position_text", r.get("position_text"))
    status = body.get("classification_status", r.get("classification_status"))
    points = body.get("points", r.get("points"))
    laps = body.get("laps_completed", r.get("laps_completed"))
    time_text = body.get("time_text", r.get("time_text"))
    fastest_lap = body.get("fastest_lap", r.get("fastest_lap"))
    fastest_lap_time = body.get("fastest_lap_time", r.get("fastest_lap_time"))
    is_verified = (body.get("is_verified") or r.get("is_verified") or "N").strip().upper()

    try:
        team_id = int(team_id)
        grid_pos = int(grid_pos) if grid_pos is not None and str(grid_pos).strip() != "" else None
        finish_pos = int(finish_pos) if finish_pos is not None and str(finish_pos).strip() != "" else None
        laps = int(laps) if laps is not None and str(laps).strip() != "" else None
        fastest_lap = int(fastest_lap) if fastest_lap is not None and str(fastest_lap).strip() != "" else None
        points = float(points) if points is not None and str(points).strip() != "" else 0.0
    except (ValueError, TypeError):
        return error("Invalid numeric field format", 400)

    if points < 0:
        return error("Points must be non-negative", 400)
    if is_verified not in ("Y", "N"):
        return error("is_verified must be 'Y' or 'N'", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE race_result
            SET team_id = :tid,
                grid_position = :grid,
                finish_position = :fin,
                position_text = :ptext,
                classification_status = :cstatus,
                points = :pts,
                laps_completed = :laps,
                time_text = :ttext,
                fastest_lap = :flap,
                fastest_lap_time = :flaptime,
                is_verified = :ver
            WHERE result_id = :id
            """,
            {
                "tid": team_id,
                "grid": grid_pos,
                "fin": finish_pos,
                "ptext": str(pos_text)[:8],
                "cstatus": str(status)[:80],
                "pts": points,
                "laps": laps,
                "ttext": time_text,
                "flap": fastest_lap,
                "flaptime": fastest_lap_time,
                "ver": is_verified,
                "id": result_id,
            },
        )
        conn.commit()

    updated = db.query(
        """
        SELECT rr.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM race_result rr
        JOIN driver d ON d.driver_id = rr.driver_id
        JOIN team t ON t.team_id = rr.team_id
        WHERE rr.result_id = :id
        """,
        {"id": result_id},
    )
    return jsonify(updated[0])


@api.delete("/results/<int:result_id>")
def delete_race_result(result_id: int):
    existing = db.query("SELECT * FROM race_result WHERE result_id = :id", {"id": result_id})
    if not existing:
        return error("Result not found", 404)
    r = existing[0]
    if r.get("source_system") == "JOLPICA" and r.get("is_verified") == "Y":
        return error("Verified historical race results cannot be deleted", 403)

    db.execute("DELETE FROM race_result WHERE result_id = :id", {"id": result_id})
    return jsonify({"deleted": True, "result_id": result_id})


@api.get("/qualifying/<int:quali_id>")
def get_qualifying_result(quali_id: int):
    rows = db.query(
        """
        SELECT q.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM qualifying_result q
        JOIN driver d ON d.driver_id = q.driver_id
        JOIN team t ON t.team_id = q.team_id
        WHERE q.quali_id = :id
        """,
        {"id": quali_id},
    )
    if not rows:
        return error("Qualifying result not found", 404)
    return jsonify(rows[0])


@api.post("/races/<int:race_id>/qualifying")
def create_qualifying_result(race_id: int):
    race_rows = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not race_rows:
        return error("Race not found", 404)

    body = request.get_json(silent=True) or {}
    driver_id = body.get("driver_id")
    team_id = body.get("team_id")
    session_type = (body.get("session_type") or "QUALIFYING").strip().upper()
    position = body.get("position")
    q1_time = (body.get("q1_time") or "").strip() or None
    q2_time = (body.get("q2_time") or "").strip() or None
    q3_time = (body.get("q3_time") or "").strip() or None
    is_verified = (body.get("is_verified") or "N").strip().upper()

    if not driver_id or not team_id:
        return error("driver_id and team_id are required", 400)
    if session_type not in ("QUALIFYING", "SPRINT_QUALIFYING"):
        return error("session_type must be QUALIFYING or SPRINT_QUALIFYING", 400)
    if is_verified not in ("Y", "N"):
        return error("is_verified must be 'Y' or 'N'", 400)

    try:
        driver_id = int(driver_id)
        team_id = int(team_id)
        position = int(position) if position is not None and str(position).strip() != "" else None
    except (ValueError, TypeError):
        return error("driver_id, team_id, and position must be valid numbers", 400)

    if position is not None and not (1 <= position <= 30):
        return error("position must be between 1 and 30", 400)

    # Check driver
    d_exists = db.query("SELECT driver_id, first_name, last_name FROM driver WHERE driver_id = :id", {"id": driver_id})
    if not d_exists:
        return error(f"Driver {driver_id} does not exist", 400)

    # Check team
    t_exists = db.query("SELECT team_id FROM team WHERE team_id = :id", {"id": team_id})
    if not t_exists:
        return error(f"Team {team_id} does not exist", 400)

    # Check duplicate
    dup = db.query(
        """
        SELECT quali_id FROM qualifying_result
        WHERE race_id = :rid AND driver_id = :did AND session_type = :stype
        """,
        {"rid": race_id, "did": driver_id, "stype": session_type},
    )
    if dup:
        d_name = f"{d_exists[0]['first_name']} {d_exists[0]['last_name']}"
        return error(f"Driver {d_name} already has a {session_type} result for this race", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO qualifying_result (
              race_id, driver_id, team_id, session_type,
              position, q1_time, q2_time, q3_time,
              source_system, is_verified
            ) VALUES (
              :rid, :did, :tid, :stype,
              :pos, :q1, :q2, :q3,
              'MANUAL', :ver
            )
            RETURNING quali_id INTO :new_id
            """,
            {
                "rid": race_id,
                "did": driver_id,
                "tid": team_id,
                "stype": session_type,
                "pos": position,
                "q1": q1_time,
                "q2": q2_time,
                "q3": q3_time,
                "ver": is_verified,
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query(
        """
        SELECT q.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM qualifying_result q
        JOIN driver d ON d.driver_id = q.driver_id
        JOIN team t ON t.team_id = q.team_id
        WHERE q.quali_id = :id
        """,
        {"id": new_id},
    )
    return jsonify(created[0] if created else {"quali_id": new_id}), 201


@api.put("/qualifying/<int:quali_id>")
def update_qualifying_result(quali_id: int):
    existing = db.query("SELECT * FROM qualifying_result WHERE quali_id = :id", {"id": quali_id})
    if not existing:
        return error("Qualifying result not found", 404)
    q = existing[0]
    if q.get("source_system") == "JOLPICA" and q.get("is_verified") == "Y":
        return error("Verified historical qualifying results cannot be modified", 403)

    body = request.get_json(silent=True) or {}
    team_id = body.get("team_id", q["team_id"])
    position = body.get("position", q.get("position"))
    q1_time = body.get("q1_time", q.get("q1_time"))
    q2_time = body.get("q2_time", q.get("q2_time"))
    q3_time = body.get("q3_time", q.get("q3_time"))
    is_verified = (body.get("is_verified") or q.get("is_verified") or "N").strip().upper()

    try:
        team_id = int(team_id)
        position = int(position) if position is not None and str(position).strip() != "" else None
    except (ValueError, TypeError):
        return error("team_id and position must be valid integers", 400)

    if is_verified not in ("Y", "N"):
        return error("is_verified must be 'Y' or 'N'", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE qualifying_result
            SET team_id = :tid,
                position = :pos,
                q1_time = :q1,
                q2_time = :q2,
                q3_time = :q3,
                is_verified = :ver
            WHERE quali_id = :id
            """,
            {
                "tid": team_id,
                "pos": position,
                "q1": q1_time,
                "q2": q2_time,
                "q3": q3_time,
                "ver": is_verified,
                "id": quali_id,
            },
        )
        conn.commit()

    updated = db.query(
        """
        SELECT q.*, d.first_name, d.last_name, d.driver_code, t.team_name, t.primary_color
        FROM qualifying_result q
        JOIN driver d ON d.driver_id = q.driver_id
        JOIN team t ON t.team_id = q.team_id
        WHERE q.quali_id = :id
        """,
        {"id": quali_id},
    )
    return jsonify(updated[0])


@api.delete("/qualifying/<int:quali_id>")
def delete_qualifying_result(quali_id: int):
    existing = db.query("SELECT * FROM qualifying_result WHERE quali_id = :id", {"id": quali_id})
    if not existing:
        return error("Qualifying result not found", 404)
    q = existing[0]
    if q.get("source_system") == "JOLPICA" and q.get("is_verified") == "Y":
        return error("Verified historical qualifying results cannot be deleted", 403)

    db.execute("DELETE FROM qualifying_result WHERE quali_id = :id", {"id": quali_id})
    return jsonify({"deleted": True, "quali_id": quali_id})


@api.post("/races/<int:race_id>/verify")
def verify_race_sessions(race_id: int):
    race = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not race:
        return error("Race not found", 404)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE race_result SET is_verified = 'Y' WHERE race_id = :id AND source_system = 'MANUAL'",
            {"id": race_id},
        )
        res_count = cur.rowcount
        cur.execute(
            "UPDATE qualifying_result SET is_verified = 'Y' WHERE race_id = :id AND source_system = 'MANUAL'",
            {"id": race_id},
        )
        quali_count = cur.rowcount
        conn.commit()

    return jsonify({
        "race_id": race_id,
        "verified_results": res_count,
        "verified_qualifying": quali_count,
        "is_verified": True,
    })


@api.post("/races/<int:race_id>/unverify")
def unverify_race_sessions(race_id: int):
    race = db.query("SELECT * FROM race WHERE race_id = :id", {"id": race_id})
    if not race:
        return error("Race not found", 404)
    if race[0].get("source_system") == "JOLPICA":
        return error("Historical race sessions cannot be unverified", 403)

    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE race_result SET is_verified = 'N' WHERE race_id = :id AND source_system = 'MANUAL'",
            {"id": race_id},
        )
        res_count = cur.rowcount
        cur.execute(
            "UPDATE qualifying_result SET is_verified = 'N' WHERE race_id = :id AND source_system = 'MANUAL'",
            {"id": race_id},
        )
        quali_count = cur.rowcount
        conn.commit()

    return jsonify({
        "race_id": race_id,
        "unverified_results": res_count,
        "unverified_qualifying": quali_count,
        "is_verified": False,
    })


@api.post("/drivers")
def create_driver():
    body = request.get_json(silent=True) or {}
    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    driver_ref = (body.get("driver_ref") or f"{first_name.lower()}_{last_name.lower()}").strip().lower()
    driver_ref = re.sub(r"[^a-z0-9_]+", "_", driver_ref).strip("_")
    driver_code = (body.get("driver_code") or "").strip().upper()[:5] or None
    permanent_number = body.get("permanent_number")
    nationality = (body.get("nationality") or "").strip() or None
    country_id = body.get("country_id")

    if not first_name or not last_name or not driver_ref:
        return error("first_name, last_name, and driver_ref are required", 400)

    try:
        permanent_number = int(permanent_number) if permanent_number is not None and str(permanent_number).strip() != "" else None
        country_id = int(country_id) if country_id is not None and str(country_id).strip() != "" else None
    except (ValueError, TypeError):
        return error("permanent_number and country_id must be valid numbers", 400)

    if permanent_number is not None and not (1 <= permanent_number <= 99):
        return error("permanent_number must be between 1 and 99", 400)

    dup = db.query("SELECT driver_id FROM driver WHERE driver_ref = :ref", {"ref": driver_ref})
    if dup:
        return error(f"Driver with reference '{driver_ref}' already exists", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO driver (
              driver_ref, driver_code, permanent_number,
              first_name, last_name, nationality, country_id,
              source_system
            ) VALUES (
              :ref, :code, :pnum,
              :fname, :lname, :nat, :cid,
              'MANUAL'
            )
            RETURNING driver_id INTO :new_id
            """,
            {
                "ref": driver_ref,
                "code": driver_code,
                "pnum": permanent_number,
                "fname": first_name[:80],
                "lname": last_name[:80],
                "nat": nationality[:80] if nationality else None,
                "cid": country_id,
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query("SELECT * FROM driver WHERE driver_id = :id", {"id": new_id})
    return jsonify(created[0] if created else {"driver_id": new_id}), 201


@api.post("/teams")
def create_team():
    body = request.get_json(silent=True) or {}
    team_name = (body.get("team_name") or "").strip()
    constructor_ref = (body.get("constructor_ref") or team_name.lower()).strip().lower()
    constructor_ref = re.sub(r"[^a-z0-9_]+", "_", constructor_ref).strip("_")
    nationality = (body.get("nationality") or "").strip() or None
    country_id = body.get("country_id")
    primary_color = (body.get("primary_color") or "#e10600").strip()

    if not team_name or not constructor_ref:
        return error("team_name and constructor_ref are required", 400)

    try:
        country_id = int(country_id) if country_id is not None and str(country_id).strip() != "" else None
    except (ValueError, TypeError):
        return error("country_id must be an integer", 400)

    dup = db.query(
        "SELECT team_id FROM team WHERE constructor_ref = :ref OR LOWER(team_name) = :name",
        {"ref": constructor_ref, "name": team_name.lower()},
    )
    if dup:
        return error(f"Team '{team_name}' or constructor_ref '{constructor_ref}' already exists", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO team (
              constructor_ref, team_name, nationality, country_id,
              primary_color, source_system
            ) VALUES (
              :ref, :tname, :nat, :cid,
              :color, 'MANUAL'
            )
            RETURNING team_id INTO :new_id
            """,
            {
                "ref": constructor_ref[:50],
                "tname": team_name[:120],
                "nat": nationality[:80] if nationality else None,
                "cid": country_id,
                "color": primary_color[:20],
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query("SELECT * FROM team WHERE team_id = :id", {"id": new_id})
    return jsonify(created[0] if created else {"team_id": new_id}), 201


@api.post("/circuits")
def create_circuit():
    body = request.get_json(silent=True) or {}
    circuit_name = (body.get("circuit_name") or "").strip()
    circuit_ref = (body.get("circuit_ref") or circuit_name.lower()).strip().lower()
    circuit_ref = re.sub(r"[^a-z0-9_]+", "_", circuit_ref).strip("_")
    locality = (body.get("locality") or "").strip() or None
    country_id = body.get("country_id")

    if not circuit_name or not circuit_ref:
        return error("circuit_name and circuit_ref are required", 400)

    try:
        country_id = int(country_id) if country_id is not None and str(country_id).strip() != "" else None
    except (ValueError, TypeError):
        return error("country_id must be an integer", 400)

    dup = db.query("SELECT circuit_id FROM circuit WHERE circuit_ref = :ref", {"ref": circuit_ref})
    if dup:
        return error(f"Circuit reference '{circuit_ref}' already exists", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO circuit (
              circuit_ref, circuit_name, locality, country_id
            ) VALUES (
              :ref, :cname, :loc, :cid
            )
            RETURNING circuit_id INTO :new_id
            """,
            {
                "ref": circuit_ref[:50],
                "cname": circuit_name[:150],
                "loc": locality[:100] if locality else None,
                "cid": country_id,
                "new_id": new_id_var,
            },
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    created = db.query("SELECT * FROM circuit WHERE circuit_id = :id", {"id": new_id})
    return jsonify(created[0] if created else {"circuit_id": new_id}), 201


@api.post("/seasons/<int:year>/driver-contracts")
def create_driver_contract(year: int):
    body = request.get_json(silent=True) or {}
    driver_id = body.get("driver_id")
    team_id = body.get("team_id")
    car_number = body.get("car_number")
    role_note = (body.get("role_note") or "").strip() or None

    if not driver_id or not team_id:
        return error("driver_id and team_id are required", 400)

    try:
        driver_id = int(driver_id)
        team_id = int(team_id)
        car_number = int(car_number) if car_number is not None and str(car_number).strip() != "" else None
    except (ValueError, TypeError):
        return error("driver_id, team_id, and car_number must be integers", 400)

    dup = db.query(
        "SELECT contract_id FROM driver_contract WHERE season_year = :y AND driver_id = :d AND team_id = :t",
        {"y": year, "d": driver_id, "t": team_id},
    )
    if dup:
        return error("This driver is already contracted to this team for this season", 400)

    with db.connection() as conn:
        cur = conn.cursor()
        new_id_var = cur.var(oracledb.NUMBER)
        cur.execute(
            """
            INSERT INTO driver_contract (
              driver_id, team_id, season_year, car_number, role_note
            ) VALUES (
              :did, :tid, :yr, :cnum, :rnote
            )
            RETURNING contract_id INTO :new_id
            """,
            {"did": driver_id, "tid": team_id, "yr": year, "cnum": car_number, "rnote": role_note, "new_id": new_id_var},
        )
        conn.commit()
        new_id = int(new_id_var.getvalue()[0])

    return jsonify({"contract_id": new_id, "driver_id": driver_id, "team_id": team_id, "season_year": year}), 201

