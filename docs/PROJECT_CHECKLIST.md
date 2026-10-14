# Project checklist — F1 Championship Management

Track: completed / tested / blocked / pending.

Last updated: 2026-10-11

## Current state (summary)

Oracle Database 26ai Free (`OracleServiceFREE`) is running locally with services `FREE` and `FREEPDB1` on port 1521. OS authentication as SYSDBA works. Jolpica-F1 API is reachable. Application objects live in schema `F1_CHAMP` inside `FREEPDB1`. Historical results are imported from Jolpica (Ergast-compatible) for 2023–2025; championship standings are computed from `RACE_RESULT` rows, including sprint-session points as a separate `SESSION_TYPE`.

## Phase 1 — Workspace, structure, checklist

| Task | Status | Evidence |
|------|--------|----------|
| Inspect workspace | completed | Empty project root on first inspection |
| Folder structure | completed | `database/`, `scripts/`, `data/`, `backend/`, `frontend/`, `tests/`, `docs/` |
| `.gitignore` / `.env.example` | completed | Placeholders only in `.env.example` |
| Checklist | completed | This file |

## Phase 2 — Schema and historical import

| Task | Status | Evidence |
|------|--------|----------|
| Oracle schema (3NF, PKs/FKs/CHECKs) | completed | `database/01_schema.sql` |
| Jolpica download + cache | completed | `scripts/download_jolpica.py` |
| Validate + normalize | completed | `scripts/normalize_jolpica.py` |
| Idempotent Oracle import | completed | `scripts/import_oracle.py` |
| Historical 2023–2025 race results | completed and tested | 1,758 session results, 1,398 qualifying rows, 2,558 pit stops imported |
| Duplicate-safe rerun | completed and tested | `MERGE` on natural keys; rerun committed successfully |
| Standings vs source | completed and tested | Zero driver and constructor point mismatches |

## Phase 3 — DBMS demonstrations

| Task | Status | Evidence |
|------|--------|----------|
| Views (standings, form) | completed | `database/02_views.sql` |
| Stored procedure | completed | `database/03_procedures.sql` |
| Trigger (protect verified results) | completed | `database/04_triggers.sql` |
| Analytics query gallery | completed | `database/05_analytics.sql` |

## Phase 4 — Flask + Oracle

| Task | Status | Evidence |
|------|--------|----------|
| Connection module + pooling | completed and tested | `backend/db.py`; `/api/health` returned connected |
| Health endpoint | completed and tested | `GET /api/health` returned HTTP 200 |
| Read APIs | completed and tested | Main dashboard, standings, races, results, qualifying, pit stops, drivers, teams, circuits |
| CRUD APIs | completed and tested | sponsors, penalties, team-sponsors collections returned HTTP 200 |

## Phase 5 — Frontend

| Task | Status | Evidence |
|------|--------|----------|
| Dashboard UI | completed | `frontend/` consumes `/api` |
| Standings / calendar / results | completed | |
| CRUD forms | completed | persist via API |
| Empty/loading/error states | completed | |

## Phase 6 — Tests and docs

| Task | Status | Evidence |
|------|--------|----------|
| Importer/validation unit tests | completed | `tests/` (no Oracle required) |
| Live Oracle verification | completed | Import and API smoke checks passed against local Oracle |
| README, ER, viva, demo | completed | `docs/` + `README.md` |

## Manual

1. Keep `.env` private; change the sample app-user password before sharing the machine.
2. Start Flask with `python backend\app.py` and open the dashboard at `http://127.0.0.1:5000`.

## Verification commands (local)

```powershell
cd E:\F1-Championship-Management
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\download_jolpica.py
python scripts\normalize_jolpica.py
python scripts\run_sql.py database\01_schema.sql
python scripts\run_sql.py database\02_views.sql
python scripts\run_sql.py database\03_procedures.sql
python scripts\run_sql.py database\04_triggers.sql
python scripts\import_oracle.py
python scripts\verify_standings.py
python -m pytest -q
python backend\app.py
```

Then open http://127.0.0.1:5000
