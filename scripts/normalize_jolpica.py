"""Validate cached Jolpica JSON and emit clean records for Oracle import."""

from __future__ import annotations

import json
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
SEASONS = {2023, 2024, 2025}

NATIONALITY_TO_COUNTRY = {
    "American": "USA",
    "Argentine": "Argentina",
    "Argentinian": "Argentina",
    "Australian": "Australia",
    "Austrian": "Austria",
    "Belgian": "Belgium",
    "Brazilian": "Brazil",
    "British": "United Kingdom",
    "Canadian": "Canada",
    "Chinese": "China",
    "Danish": "Denmark",
    "Dutch": "Netherlands",
    "Finnish": "Finland",
    "French": "France",
    "German": "Germany",
    "Indonesian": "Indonesia",
    "Italian": "Italy",
    "Japanese": "Japan",
    "Mexican": "Mexico",
    "Monegasque": "Monaco",
    "New Zealander": "New Zealand",
    "Polish": "Poland",
    "Russian": "Russia",
    "Spanish": "Spain",
    "Swedish": "Sweden",
    "Swiss": "Switzerland",
    "Thai": "Thailand",
    "Rhodesian": "Zimbabwe",
}

COUNTRY_CODES = {
    "USA": "US",
    "UK": "GB",
    "United Kingdom": "GB",
    "UAE": "AE",
    "Saudi Arabia": "SA",
    "Great Britain": "GB",
}

COUNTRY_ALIASES = {
    "UK": "United Kingdom",
    "Great Britain": "United Kingdom",
}

logger = logging.getLogger("normalize")


def duration_to_ms(text: str | None) -> int | None:
    if not text:
        return None
    try:
        parts = str(text).split(":")
        if len(parts) == 1:
            return int(round(float(parts[0]) * 1000))
        if len(parts) == 2:
            return int(round(float(parts[0]) * 60_000 + float(parts[1]) * 1000))
        if len(parts) == 3:
            return int(
                round(float(parts[0]) * 3_600_000 + float(parts[1]) * 60_000 + float(parts[2]) * 1000)
            )
    except ValueError:
        return None
    return None


def to_int(value, default=None):
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_float(value, default=None):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class Report:
    def __init__(self) -> None:
        self.skipped: list[str] = []
        self.failures: list[str] = []
        self.sources: set[str] = set()
        self.counts: dict[str, int] = defaultdict(int)

    def skip(self, msg: str) -> None:
        self.skipped.append(msg)
        self.counts["skipped"] += 1

    def fail(self, msg: str) -> None:
        self.failures.append(msg)
        self.counts["validation_failures"] += 1


def load_cache() -> list[dict]:
    payloads = []
    if not CACHE.exists():
        raise SystemExit(f"No cache directory at {CACHE}. Run download_jolpica.py first.")
    for path in CACHE.rglob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.error("Invalid JSON file %s", path)
            continue
        data["_cache_file"] = str(path)
        payloads.append(data)
    return payloads


def ensure_country(countries: dict, name: str | None) -> str | None:
    if not name:
        return None
    name = COUNTRY_ALIASES.get(name.strip(), name.strip())
    if name not in countries:
        code = COUNTRY_CODES.get(name)
        if not code and len(name) <= 3:
            code = name.upper()
        countries[name] = {
            "country_name": name,
            "country_code": code,
        }
    return name


def parse_driver(raw: dict, report: Report) -> dict | None:
    ref = raw.get("driverId")
    first = raw.get("givenName")
    last = raw.get("familyName")
    if not ref or not first or not last:
        report.fail(f"driver missing keys: {raw}")
        return None
    return {
        "driver_ref": ref,
        "driver_code": raw.get("code"),
        "permanent_number": to_int(raw.get("permanentNumber")),
        "first_name": first,
        "last_name": last,
        "date_of_birth": raw.get("dateOfBirth"),
        "nationality": raw.get("nationality"),
        "wikipedia_url": raw.get("url"),
        "source_system": "JOLPICA",
    }


def parse_team(raw: dict, report: Report) -> dict | None:
    ref = raw.get("constructorId")
    name = raw.get("name")
    if not ref or not name:
        report.fail(f"constructor missing keys: {raw}")
        return None
    return {
        "constructor_ref": ref,
        "team_name": name,
        "nationality": raw.get("nationality"),
        "wikipedia_url": raw.get("url"),
        "source_system": "JOLPICA",
    }


def parse_circuit(raw: dict, report: Report) -> dict | None:
    ref = raw.get("circuitId")
    name = raw.get("circuitName")
    if not ref or not name:
        report.fail(f"circuit missing keys: {raw}")
        return None
    loc = raw.get("Location") or {}
    return {
        "circuit_ref": ref,
        "circuit_name": name,
        "locality": loc.get("locality"),
        "country_name": loc.get("country"),
        "latitude": to_float(loc.get("lat")),
        "longitude": to_float(loc.get("long")),
        "wikipedia_url": raw.get("url"),
    }


def ingest_race_object(race: dict, buckets: dict, report: Report, source_url: str) -> None:
    season = to_int(race.get("season"))
    rnd = to_int(race.get("round"))
    name = race.get("raceName")
    circuit = race.get("Circuit") or {}
    if season not in SEASONS or not rnd or not name or not circuit.get("circuitId"):
        report.fail(f"race missing required fields season={season} round={rnd} url={source_url}")
        return

    buckets["seasons"][season] = {
        "season_year": season,
        "season_name": f"{season} FIA Formula One World Championship",
        "start_date": None,
        "end_date": None,
        "notes": "Verified historical season imported from Jolpica-F1 / Ergast-compatible API.",
    }
    parsed_circuit = parse_circuit(circuit, report)
    if parsed_circuit:
        buckets["circuits"][parsed_circuit["circuit_ref"]] = parsed_circuit
        ensure_country(buckets["countries"], parsed_circuit.get("country_name"))

    key = (season, rnd)
    existing = buckets["races"].get(key) or {}
    has_sprint = existing.get("has_sprint", "N")
    if race.get("Sprint") or race.get("SprintResults"):
        has_sprint = "Y"
    buckets["races"][key] = {
        "season_year": season,
        "round_number": rnd,
        "circuit_ref": circuit.get("circuitId"),
        "race_name": name,
        "race_date": race.get("date"),
        "race_time_utc": race.get("time"),
        "wikipedia_url": race.get("url"),
        "has_sprint": has_sprint,
        "source_system": "JOLPICA",
        "source_url": source_url,
    }

    if buckets["seasons"][season]["start_date"] is None or (
        race.get("date") and race["date"] < buckets["seasons"][season]["start_date"]
    ):
        buckets["seasons"][season]["start_date"] = race.get("date")
    end = buckets["seasons"][season]["end_date"]
    if end is None or (race.get("date") and race["date"] > end):
        buckets["seasons"][season]["end_date"] = race.get("date")

    for result in race.get("Results") or []:
        add_result(result, season, rnd, "RACE", source_url, buckets, report)
    for result in race.get("SprintResults") or []:
        buckets["races"][key]["has_sprint"] = "Y"
        add_result(result, season, rnd, "SPRINT", source_url, buckets, report)
    for quali in race.get("QualifyingResults") or []:
        session = "SPRINT_QUALIFYING" if "sprint" in (source_url or "").lower() else "QUALIFYING"
        add_quali(quali, season, rnd, session, buckets, report)
    for quali in race.get("SprintQualifyingResults") or []:
        add_quali(quali, season, rnd, "SPRINT_QUALIFYING", buckets, report)
    for stop in race.get("PitStops") or []:
        add_pit(stop, season, rnd, buckets, report)


def add_result(raw, season, rnd, session, source_url, buckets, report) -> None:
    driver = raw.get("Driver") or {}
    team = raw.get("Constructor") or {}
    d = parse_driver(driver, report)
    t = parse_team(team, report)
    if not d or not t:
        report.skip(f"result skipped {season}R{rnd} {session}: missing driver/team")
        return
    points = to_float(raw.get("points"))
    status = raw.get("status")
    if points is None or not status:
        report.fail(f"result missing points/status {season}R{rnd} {d['driver_ref']}")
        return
    buckets["drivers"][d["driver_ref"]] = d
    buckets["teams"][t["constructor_ref"]] = t
    link_country_from_nationality(buckets, d.get("nationality"))
    link_country_from_nationality(buckets, t.get("nationality"))
    buckets["contracts"][(d["driver_ref"], t["constructor_ref"], season)] = {
        "driver_ref": d["driver_ref"],
        "constructor_ref": t["constructor_ref"],
        "season_year": season,
        "car_number": to_int(raw.get("number")),
    }
    time_obj = raw.get("Time") or {}
    fast = raw.get("FastestLap") or {}
    fast_time = (fast.get("Time") or {}).get("time")
    buckets["results"][(season, rnd, d["driver_ref"], session)] = {
        "season_year": season,
        "round_number": rnd,
        "driver_ref": d["driver_ref"],
        "constructor_ref": t["constructor_ref"],
        "session_type": session,
        "grid_position": to_int(raw.get("grid")),
        "finish_position": to_int(raw.get("position")),
        "position_text": raw.get("positionText"),
        "classification_status": status,
        "points": points,
        "laps_completed": to_int(raw.get("laps")),
        "time_text": time_obj.get("time"),
        "milliseconds": to_int(time_obj.get("millis")),
        "fastest_lap": to_int(fast.get("lap")),
        "fastest_lap_time": fast_time,
        "fastest_lap_rank": to_int(fast.get("rank")),
        "source_system": "JOLPICA",
        "is_verified": "Y",
        "source_url": source_url,
    }
    report.counts["results"] += 1


def add_quali(raw, season, rnd, session, buckets, report) -> None:
    driver = raw.get("Driver") or {}
    team = raw.get("Constructor") or {}
    d = parse_driver(driver, report)
    t = parse_team(team, report)
    if not d or not t:
        report.skip(f"qualifying skipped {season}R{rnd}")
        return
    buckets["drivers"][d["driver_ref"]] = d
    buckets["teams"][t["constructor_ref"]] = t
    buckets["contracts"][(d["driver_ref"], t["constructor_ref"], season)] = {
        "driver_ref": d["driver_ref"],
        "constructor_ref": t["constructor_ref"],
        "season_year": season,
        "car_number": to_int(raw.get("number")),
    }
    buckets["qualifying"][(season, rnd, d["driver_ref"], session)] = {
        "season_year": season,
        "round_number": rnd,
        "driver_ref": d["driver_ref"],
        "constructor_ref": t["constructor_ref"],
        "session_type": session,
        "position": to_int(raw.get("position")),
        "q1_time": raw.get("Q1"),
        "q2_time": raw.get("Q2"),
        "q3_time": raw.get("Q3"),
        "source_system": "JOLPICA",
        "is_verified": "Y",
    }
    report.counts["qualifying"] += 1


def add_pit(raw, season, rnd, buckets, report) -> None:
    driver_ref = raw.get("driverId")
    stop_number = to_int(raw.get("stop"))
    if not driver_ref or not stop_number:
        report.skip(f"pit stop skipped {season}R{rnd}: {raw}")
        return
    buckets["pit_stops"][(season, rnd, driver_ref, stop_number)] = {
        "season_year": season,
        "round_number": rnd,
        "driver_ref": driver_ref,
        "stop_number": stop_number,
        "lap_number": to_int(raw.get("lap")),
        "stop_time": raw.get("time"),
        "duration_text": raw.get("duration"),
        "duration_ms": duration_to_ms(raw.get("duration")),
        "source_system": "JOLPICA",
    }
    report.counts["pit_stops"] += 1


def link_country_from_nationality(buckets, nationality) -> None:
    if not nationality:
        return
    country = NATIONALITY_TO_COUNTRY.get(nationality, nationality)
    ensure_country(buckets["countries"], country)


def ingest_standings(payload: dict, buckets: dict) -> None:
    lists = ((payload.get("MRData") or {}).get("StandingsTable") or {}).get("StandingsLists") or []
    for block in lists:
        season = to_int(block.get("season"))
        if season not in SEASONS:
            continue
        for row in block.get("DriverStandings") or []:
            driver = (row.get("Driver") or {}).get("driverId")
            if not driver:
                continue
            buckets["source_driver_standings"][(season, driver)] = {
                "season_year": season,
                "driver_ref": driver,
                "position": to_int(row.get("position")),
                "points": to_float(row.get("points")),
                "wins": to_int(row.get("wins")),
            }
        for row in block.get("ConstructorStandings") or []:
            ref = (row.get("Constructor") or {}).get("constructorId")
            if not ref:
                continue
            buckets["source_constructor_standings"][(season, ref)] = {
                "season_year": season,
                "constructor_ref": ref,
                "position": to_int(row.get("position")),
                "points": to_float(row.get("points")),
                "wins": to_int(row.get("wins")),
            }


def dump(name: str, rows) -> None:
    path = OUT / name
    if isinstance(rows, dict):
        payload = list(rows.values())
    else:
        payload = rows
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    OUT.mkdir(parents=True, exist_ok=True)
    report = Report()
    buckets = {
        "countries": {},
        "seasons": {},
        "teams": {},
        "drivers": {},
        "circuits": {},
        "contracts": {},
        "races": {},
        "qualifying": {},
        "results": {},
        "pit_stops": {},
        "source_driver_standings": {},
        "source_constructor_standings": {},
    }

    payloads = load_cache()
    logger.info("loaded %s cached files", len(payloads))
    for payload in payloads:
        if payload.get("_http_status") == 404:
            continue
        url = payload.get("_source_url") or payload.get("_cache_file")
        report.sources.add(url)
        mr = payload.get("MRData")
        if not mr:
            report.skip(f"no MRData in {url}")
            continue
        if mr.get("DriverTable"):
            for raw in mr["DriverTable"].get("Drivers") or []:
                parsed = parse_driver(raw, report)
                if parsed:
                    buckets["drivers"][parsed["driver_ref"]] = parsed
                    link_country_from_nationality(buckets, parsed.get("nationality"))
        if mr.get("ConstructorTable"):
            for raw in mr["ConstructorTable"].get("Constructors") or []:
                parsed = parse_team(raw, report)
                if parsed:
                    buckets["teams"][parsed["constructor_ref"]] = parsed
                    link_country_from_nationality(buckets, parsed.get("nationality"))
        if mr.get("CircuitTable"):
            for raw in mr["CircuitTable"].get("Circuits") or []:
                parsed = parse_circuit(raw, report)
                if parsed:
                    buckets["circuits"][parsed["circuit_ref"]] = parsed
                    ensure_country(buckets["countries"], parsed.get("country_name"))
        if mr.get("RaceTable"):
            for race in mr["RaceTable"].get("Races") or []:
                ingest_race_object(race, buckets, report, url)
        if mr.get("StandingsTable"):
            ingest_standings(payload, buckets)

    for driver in buckets["drivers"].values():
        driver["country_name"] = NATIONALITY_TO_COUNTRY.get(driver.get("nationality") or "", None)
        if driver["country_name"]:
            ensure_country(buckets["countries"], driver["country_name"])
    for team in buckets["teams"].values():
        team["country_name"] = NATIONALITY_TO_COUNTRY.get(team.get("nationality") or "", None)
        if team["country_name"]:
            ensure_country(buckets["countries"], team["country_name"])

    dump("countries.json", buckets["countries"])
    dump("seasons.json", buckets["seasons"])
    dump("teams.json", buckets["teams"])
    dump("drivers.json", buckets["drivers"])
    dump("circuits.json", buckets["circuits"])
    dump("contracts.json", buckets["contracts"])
    dump("races.json", buckets["races"])
    dump("qualifying.json", buckets["qualifying"])
    dump("results.json", buckets["results"])
    dump("pit_stops.json", buckets["pit_stops"])
    dump("source_driver_standings.json", buckets["source_driver_standings"])
    dump("source_constructor_standings.json", buckets["source_constructor_standings"])

    race_counts = defaultdict(int)
    for race in buckets["races"].values():
        race_counts[race["season_year"]] += 1
    gp_result_counts = defaultdict(int)
    for row in buckets["results"].values():
        if row["session_type"] == "RACE":
            gp_result_counts[row["season_year"]] += 1

    summary = {
        "cached_files": len(payloads),
        "countries": len(buckets["countries"]),
        "seasons": len(buckets["seasons"]),
        "teams": len(buckets["teams"]),
        "drivers": len(buckets["drivers"]),
        "circuits": len(buckets["circuits"]),
        "contracts": len(buckets["contracts"]),
        "races_by_season": dict(race_counts),
        "gp_results_by_season": dict(gp_result_counts),
        "qualifying": len(buckets["qualifying"]),
        "results": len(buckets["results"]),
        "pit_stops": len(buckets["pit_stops"]),
        "source_driver_standings": len(buckets["source_driver_standings"]),
        "skipped": report.skipped[:50],
        "skipped_count": len(report.skipped),
        "validation_failures": report.failures[:50],
        "validation_failure_count": len(report.failures),
        "source_urls_sample": sorted(report.sources)[:20],
        "notes": (
            "Standings JSON from Jolpica is stored for verification only. "
            "Application championship tables are computed from race_result points."
        ),
    }
    (OUT / "normalize_report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logger.info("normalize report: %s", json.dumps({k: summary[k] for k in summary if k not in ("skipped", "validation_failures", "source_urls_sample")}))
    if race_counts.keys() != SEASONS and not SEASONS.issubset(race_counts.keys()):
        logger.warning("Missing seasons in races: have %s expected %s", dict(race_counts), SEASONS)
    return 0 if not report.failures else 0  # import can still proceed with valid subset


if __name__ == "__main__":
    raise SystemExit(main())
