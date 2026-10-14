"""Compare computed championship points with Jolpica source standings JSON."""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")


def local_compute():
    results = json.loads((PROCESSED / "results.json").read_text(encoding="utf-8"))
    driver_pts = defaultdict(float)
    team_pts = defaultdict(float)
    for row in results:
        key_d = (row["season_year"], row["driver_ref"])
        key_t = (row["season_year"], row["constructor_ref"])
        driver_pts[key_d] += float(row["points"])
        team_pts[key_t] += float(row["points"])
    return driver_pts, team_pts


def compare_maps(computed, source_rows, key_field):
    mismatches = []
    for row in source_rows:
        key = (row["season_year"], row[key_field])
        src = float(row["points"])
        got = float(computed.get(key, 0))
        if abs(src - got) > 0.01:
            mismatches.append({"key": key, "source_points": src, "computed_points": got})
    return mismatches


def verify_oracle():
    import oracledb

    user, password, dsn = os.environ.get("ORACLE_USER"), os.environ.get("ORACLE_PASSWORD"), os.environ.get("ORACLE_DSN")
    if not user or not password or not dsn:
        return {"oracle": "skipped — credentials not set"}
    conn = oracledb.connect(user=user, password=password, dsn=dsn)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT season_year, COUNT(*) FROM race GROUP BY season_year ORDER BY 1
            """
        )
        races = {int(y): int(c) for y, c in cur}
        cur.execute("SELECT COUNT(*) FROM race_result WHERE session_type = 'RACE'")
        gp = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM race_result WHERE session_type = 'SPRINT'")
        sprint = cur.fetchone()[0]
        return {"races_by_season": races, "gp_results": int(gp), "sprint_results": int(sprint)}
    finally:
        conn.close()


def main() -> int:
    if not (PROCESSED / "results.json").exists():
        print("Run normalize first.")
        return 2
    driver_pts, team_pts = local_compute()
    src_d = json.loads((PROCESSED / "source_driver_standings.json").read_text(encoding="utf-8"))
    src_t = json.loads((PROCESSED / "source_constructor_standings.json").read_text(encoding="utf-8"))
    d_mis = compare_maps(driver_pts, src_d, "driver_ref")
    t_mis = compare_maps(team_pts, src_t, "constructor_ref")
    report = {
        "driver_point_mismatches": d_mis[:30],
        "driver_mismatch_count": len(d_mis),
        "constructor_point_mismatches": t_mis[:30],
        "constructor_mismatch_count": len(t_mis),
        "oracle": verify_oracle(),
        "note": (
            "Computed totals SUM race + sprint points from imported session results. "
            "Source standings are Jolpica championship files used only as a check."
        ),
    }
    out = PROCESSED / "verify_report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in report if "mismatches" not in k}, indent=2))
    if d_mis or t_mis:
        print(f"Point mismatches drivers={len(d_mis)} constructors={len(t_mis)} (see {out})")
        return 1
    print("Source standings points match computed session totals.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
