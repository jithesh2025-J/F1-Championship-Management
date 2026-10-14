"""Download 2023–2025 Jolpica-F1 data with local caching.

Does not invent records. Failed optional endpoints (sprint/pits) are cached as 404.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from jolpica_client import JolpicaClient, JolpicaError  # noqa: E402

SEASONS = (2023, 2024, 2025)
CACHE = ROOT / "data" / "raw"


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(ROOT / "data" / "processed" / "download.log", encoding="utf-8"),
        ],
    )


def download_season(client: JolpicaClient, year: int) -> dict:
    log = logging.getLogger("download")
    stats = {
        "season": year,
        "races": 0,
        "drivers": 0,
        "constructors": 0,
        "results": 0,
        "sprint": 0,
        "qualifying": 0,
        "pit_stops": 0,
        "errors": [],
    }

    schedule = client.fetch_json(f"{year}.json", {"limit": 100})
    if not schedule or "MRData" not in schedule:
        raise JolpicaError(f"Season schedule missing for {year}")
    races = (schedule.get("MRData") or {}).get("RaceTable", {}).get("Races") or []
    stats["races"] = len(races)
    log.info("season %s schedule races=%s url=%s", year, stats["races"], schedule.get("_source_url"))

    drivers = client.fetch_paginated(f"{year}/drivers.json", ("DriverTable", "Drivers"))
    stats["drivers"] = len(drivers)
    constructors = client.fetch_paginated(f"{year}/constructors.json", ("ConstructorTable", "Constructors"))
    stats["constructors"] = len(constructors)
    client.fetch_paginated(f"{year}/circuits.json", ("CircuitTable", "Circuits"))
    client.fetch_paginated(f"{year}/driverStandings.json", ("StandingsTable", "StandingsLists"))
    client.fetch_paginated(f"{year}/constructorStandings.json", ("StandingsTable", "StandingsLists"))

    for race in races:
        rnd = race.get("round")
        if not rnd:
            stats["errors"].append(f"{year} race missing round")
            continue
        results = client.fetch_paginated(
            f"{year}/{rnd}/results.json",
            ("RaceTable", "Races"),
        )
        # RaceTable.Races is a list of race objects each with Results
        for race_obj in results:
            stats["results"] += len(race_obj.get("Results") or [])

        quali = client.fetch_paginated(
            f"{year}/{rnd}/qualifying.json",
            ("RaceTable", "Races"),
            allow_404=True,
        )
        for race_obj in quali:
            stats["qualifying"] += len(race_obj.get("QualifyingResults") or [])

        sprint = client.fetch_json(f"{year}/{rnd}/sprint.json", {"limit": 100}, allow_404=True)
        if sprint and sprint.get("MRData"):
            sprint_races = (sprint["MRData"].get("RaceTable") or {}).get("Races") or []
            for race_obj in sprint_races:
                stats["sprint"] += len(race_obj.get("SprintResults") or [])
            stats["races"]  # keep structure

        client.fetch_json(f"{year}/{rnd}/sprint/qualifying.json", {"limit": 100}, allow_404=True)

        pits = client.fetch_paginated(
            f"{year}/{rnd}/pitstops.json",
            ("RaceTable", "Races"),
            allow_404=True,
        )
        for race_obj in pits:
            stats["pit_stops"] += len(race_obj.get("PitStops") or [])

    log.info("season %s stats %s", year, stats)
    return stats


def main() -> int:
    setup_logging()
    CACHE.mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "processed").mkdir(parents=True, exist_ok=True)
    client = JolpicaClient(CACHE)
    summary = []
    try:
        for year in SEASONS:
            summary.append(download_season(client, year))
    except JolpicaError as exc:
        logging.error("Download stopped: %s", exc)
        logging.error("Cached files were preserved. Re-run to resume from cache.")
        return 1
    logging.info("DONE %s", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
