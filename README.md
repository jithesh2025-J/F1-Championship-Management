# F1 Championship Management & Analytics

College DBMS project: Formula 1 seasons **2023, 2024 and 2025** stored in **Oracle Database 26ai Free**, served by a **Flask** API and a dark F1-style dashboard.

Championship tables are **computed from imported race/sprint result points**. Rankings are never typed in by hand.

## Features

- Normalized Oracle schema (3NF-oriented) with PKs, FKs, CHECKs, unique session results
- Historical import from [Jolpica-F1](https://api.jolpi.ca/ergast/f1/) (Ergast-compatible), cached on disk
- Driver and constructor standings, qualifying, pit stops
- Views, stored procedures, triggers, analytics gallery
- CRUD for illustrative sponsors/penalties (labelled, excluded from standings)
- Health check against Oracle

## Architecture

```
Jolpica-F1 API  -->  data/raw (cache)  -->  data/processed  -->  Oracle FREEPDB1 / F1_CHAMP
                                                                      ^
Flask (backend/app.py)  <---- oracledb pool ---------------------------

        |
        v
   frontend/ (HTML/CSS/JS)  served at http://127.0.0.1:5000
```

The website **does not** call Jolpica. Import is a manual pipeline.

## Folder structure

- `database/` — schema, views, procedures, triggers, example analytics SQL
- `scripts/` — download, normalize, Oracle import, SQL runner
- `data/raw/` — cached API JSON (gitignored)
- `data/processed/` — clean records + reports (gitignored)
- `backend/` — Flask + `oracledb`
- `frontend/` — dashboard
- `tests/` — validation tests that do not need Oracle
- `docs/` — ER diagram, schema, normalization, demo, viva

## Requirements

- Windows 10/11
- Oracle Database 26ai Free (service `OracleServiceFREE`, listener port **1521**)
- Python 3.11+ (developed with 3.14)
- Confirmed on this machine: listener services `FREE` and `freepdb1`

## Installation

```powershell
cd E:\F1-Championship-Management
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` so it matches the app user (see next section).

## Oracle configuration

Do **not** guess SYS passwords. This project uses a dedicated user `F1_CHAMP` in **FREEPDB1**.

1. Open PowerShell **as the Windows account that owns the Oracle install** (OS authentication):

```powershell
sqlplus / as sysdba @scripts\create_app_user.sql
```
When prompted, enter your desired password for `f1_champ` (input is masked for security).

2. Put the same username and password into `.env`:

```
ORACLE_USER=f1_champ
ORACLE_PASSWORD=your_app_password
ORACLE_DSN=localhost:1521/FREEPDB1
```

Passwords are set interactively at script runtime and never committed. Never commit `.env`.

Easy Connect uses host `localhost`, port `1521`, service `FREEPDB1` (not the container `FREE`).

### Read-only viewer user (Analytics Safe Console)

For safe, read-only ad-hoc SQL execution in the Analytics console, create the dedicated user `f1_viewer`:

```powershell
sqlplus / as sysdba @scripts\create_viewer_user.sql
```
When prompted, enter your desired password for `f1_viewer` (input is masked for security).

Then configure `.env`:

```
F1_VIEWER_USER=f1_viewer
F1_VIEWER_PASSWORD=your_viewer_password
```

## Database setup order

```powershell
python scripts\run_sql.py database\01_schema.sql
python scripts\run_sql.py database\02_views.sql
python scripts\run_sql.py database\03_procedures.sql
python scripts\run_sql.py database\04_triggers.sql
python scripts\run_sql.py database\06_dashboard_views.sql
python scripts\run_sql.py database\07_standings_views.sql
python scripts\run_sql.py database\08_race_views.sql
python scripts\run_sql.py database\09_demo_queries.sql
python scripts\run_sql.py database\10_profile_views.sql
```

Optional reset (destructive): `python scripts\run_sql.py database\00_drop.sql`

## Historical data import

```powershell
python scripts\download_jolpica.py
python scripts\normalize_jolpica.py
python scripts\import_oracle.py
python scripts\verify_standings.py
```

Download respects cache files, timeouts, 429 backoff, and pagination. Re-run import is safe (`MERGE` + unique keys).

Cross-check important weekends on the official results site in a browser (do not scrape it):

- https://www.formula1.com/en/results/2023/races
- https://www.formula1.com/en/results/2024/races
- https://www.formula1.com/en/results/2025/races

## Flask and frontend

```powershell
python backend\app.py
```

Open http://127.0.0.1:5000  

Health: http://127.0.0.1:5000/api/health

## Tests

```powershell
python -m pytest -q
```

These tests cover validation, SQL splitting, and API/frontend path alignment. They do **not** replace a live Oracle import check.

## Data source attribution

Primary source: **Jolpica-F1**, Ergast-compatible HTTP API at `https://api.jolpi.ca/ergast/f1/`.

- Educational use, conservative request rate, local cache only
- Project code does not redistribute the full raw dump in Git (`data/raw/` is gitignored)
- Review Jolpica’s repository and licence before any public redistribution: https://github.com/jolpica/jolpica-f1
- Formula 1 names, results and branding belong to their rights holders; this is an academic database project, not an official product

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `database: disconnected` | `OracleServiceFREE` running; `.env` DSN `localhost:1521/FREEPDB1`; user `f1_champ` created |
| `ORA-01017` invalid username/password | Password in `.env` must match `create_app_user.sql` |
| `ORA-12514` | Service name must be `FREEPDB1`, not `FREE` |
| Empty dashboard | Run download → normalize → import |
| `ORA-20001` on DELETE | Trigger protecting verified results — expected |
| HTTP 429 during download | Script waits and retries; re-run uses cache |
| Python cannot import `oracledb` | Activate `.venv` and `pip install -r requirements.txt` |

## Docs

- [Project checklist](docs/PROJECT_CHECKLIST.md)
- [ER diagram](docs/ER_DIAGRAM.md)
- [Schema](docs/SCHEMA.md)
- [Normalization](docs/NORMALIZATION.md)
- [Demo script](docs/DEMO_SCRIPT.md)
- [Viva Q&A](docs/VIVA_QA.md)
