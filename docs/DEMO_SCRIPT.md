# 5–7 minute demonstration

1. **Problem (30s)** — College DBMS project: manage F1 2023–2025 data in Oracle, compute championships from results, show SQL features, CRUD without corrupting history.
2. **Architecture (30s)** — Jolpica cache → normalize → Oracle `F1_CHAMP` → Flask `/api` → dashboard. No SQLite.
3. **Schema (45s)** — Open `docs/ER_DIAGRAM.md`. Point at `RACE_RESULT.SESSION_TYPE` and unique `(race, driver, session)`.
4. **Integrity (45s)** — Open the Analytics page and click the "⚡ Test Protected Delete" button on the **Protected Results Trigger** card. Shows attempted `DELETE`, Oracle trigger exception `ORA-20001`, transaction rollback, and verified identical row counts before and after.
5. **Standings (60s)** — Dashboard for 2024 and 2025. Explain points = `SUM` of GP + sprint from imported rows, not a typed ranking table. Compare with Jolpica `driverStandings` via `python scripts/verify_standings.py`.
6. **SQL gallery & Safe Console (60s)** — Open the Analytics page. Run curated DBMS queries with concept tags (JOIN, GROUP BY, RANK() window function, subqueries, analytical views). Use the Safe Query Console to execute custom ad-hoc SELECT queries with 200-row cap and keyword guardrails.
7. **CRUD (45s)** — Add an illustrative sponsor, assign it with `PRC_ASSIGN_SPONSOR`, refresh; note the banner that this is not historical.
8. **Close (20s)** — Health endpoint, `.env` secrets, data licence (Jolpica/Ergast-compatible, cached locally, not redistributed).
