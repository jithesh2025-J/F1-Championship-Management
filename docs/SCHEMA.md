# Schema notes (table by table)

Objects are created in schema `F1_CHAMP` inside pluggable database `FREEPDB1`.

## COUNTRY

Lookup of circuit countries and mapped driver/constructor nationalities. Avoids repeating country strings (partial 3NF cleanup of location data).

## SEASON

Primary key is the championship year. Dates come from the first and last imported race dates.

## TEAM

Constructors. `CONSTRUCTOR_REF` is the Jolpica/Ergast id (`red_bull`, `mclaren`, …). `PRIMARY_COLOR` and `NOTES` are the only management fields intended for CRUD.

## DRIVER

People. `DRIVER_REF` is the source id. Identity fields are imported; `NOTES` may be updated in the app.

## DRIVER_CONTRACT

Associates a driver with a team for a season. Composite unique `(DRIVER_ID, TEAM_ID, SEASON_YEAR)` allows mid-season transfers (same driver, two teams, one year).

## CIRCUIT

Tracks. Coordinates stored as `NUMBER(10,6)`.

## RACE

One row per round. `HAS_SPRINT` is `Y` when sprint session data exists.

## QUALIFYING_RESULT

Unique `(RACE_ID, DRIVER_ID, SESSION_TYPE)` with `QUALIFYING` or `SPRINT_QUALIFYING`.

## RACE_RESULT

Unique `(RACE_ID, DRIVER_ID, SESSION_TYPE)` with `RACE` or `SPRINT`. `POINTS` are copied from the source for that session — the schema does **not** hardcode 25-18-15 scoring, because sprint scales and fastest-lap bonuses differ by season/session.

`CLASSIFICATION_STATUS` holds Finished, +1 Lap, Retired, engine failures, Disqualified, etc. `POSITION_TEXT` keeps Ergast codes (`R`, `D`, `W`, …).

`SOURCE_SYSTEM = JOLPICA` and `IS_VERIFIED = Y` mark historical rows. A trigger blocks changing points/positions on those rows.

## PIT_STOP

Optional timing data. Unique `(RACE_ID, DRIVER_ID, STOP_NUMBER)`.

## PENALTY

Management entity. Jolpica does not publish a complete penalty feed. App-created rows are `IS_ILLUSTRATIVE = 'Y'` and are excluded from standings views.

## SPONSOR / TEAM_SPONSOR

Many-to-many, season-scoped. Illustrative CRUD for DBMS demonstration of junction tables and a transactional procedure `PRC_ASSIGN_SPONSOR`.

## Views

- `V_DRIVER_STANDINGS` / `V_CONSTRUCTOR_STANDINGS` — `SUM(points)` plus `RANK()`.
- `V_RACE_PODIUMS`, `V_SEASON_TEAM_FORM`, `V_NON_FINISHES`.
- `V_DASHBOARD_SUMMARY` (`06_dashboard_views.sql`) — Aggregated KPI metrics for completed seasons, total races, unique drivers, constructors, and pit stops.
- `V_DRIVER_POINTS_PROGRESSION` / `V_TEAM_POINTS_PROGRESSION` (`06_dashboard_views.sql`) — Cumulative round-by-round points progression.
- `V_DRIVER_STANDINGS_FORM` / `V_TEAM_STANDINGS_FORM` (`07_standings_views.sql`) — Last 5 completed rounds per driver and constructor for trend sparklines.
- `V_RACE_GRID_FINISH` (`08_race_views.sql`) — Per race and driver: grid position, finishing position, positions gained/lost, points, status, and lap metrics.
- `V_PIT_STOP_ANALYSIS` (`08_race_views.sql`) — Per race and driver: stop count, fastest stop duration, slowest stop duration, and average stop duration.

## Execution order

1. `01_schema.sql`
2. `02_views.sql`
3. `03_procedures.sql`
4. `04_triggers.sql`
5. `scripts/import_oracle.py`
6. `05_analytics.sql` (examples; also available via `/api/analytics`)
7. `06_dashboard_views.sql` (dashboard KPIs and progression)
8. `07_standings_views.sql` (standings form views)
9. `08_race_views.sql` (race grid-finish and pit-stop views)

