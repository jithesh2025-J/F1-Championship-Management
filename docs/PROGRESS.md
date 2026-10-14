# Project Progress

Last updated: 2026-10-11

## Step 1 — Audit

Completed a read-only audit against `README.md`.

- All README-required folders are present.
- Database, pipeline, backend, frontend, test, and documentation files are present and non-empty.
- `.env` exists but still contains the placeholder Oracle password.
- This progress file was missing and has now been added.
- Raw and processed data caches have not yet been populated.

## Next

Proceed with Oracle user creation and database scripts.

## Step 2 — Environment

Completed.

- Recreated the project `.venv` with the installed Windows CPython 3.13 runtime because the existing MinGW Python 3.14 environment could not install the required `cryptography` wheel.
- Installed all packages from `requirements.txt`.
- Confirmed `.env` uses `f1_champ`, configured application password, and DSN `localhost:1521/FREEPDB1`.

## Step 3 — Database

Completed.

- OS-authenticated SYSDBA execution of `scripts/create_app_user.sql` succeeded.
- `01_schema.sql`, `02_views.sql`, `03_procedures.sql`, and `04_triggers.sql` all executed successfully through `scripts/run_sql.py`.
- No Oracle compilation errors were reported.

## Step 4 — Data

Completed.

- Downloaded and cached 369 Jolpica responses for seasons 2023–2025.
- Normalized 29 countries, 3 seasons, 12 teams, 43 drivers, 24 circuits, 70 contracts, 70 races, 1,398 qualifying rows, 1,758 session results, and 2,558 pit stops with no validation failures.
- Fixed importer handling of lookup-only fields and canonicalized `UK`/`United Kingdom` before import.
- Imported all records successfully with `MERGE`.
- Standings verification passed with zero driver or constructor point mismatches.

## Next

Finish documentation and leave the verified Flask process available for the dashboard.

## Step 5 — App

Completed.

- Flask started successfully on `http://127.0.0.1:5000`.
- `/api/health` returned HTTP 200 with `database: connected`, `schema_ready: true`, and 1,758 race-result rows.
- Main dashboard, standings, calendar, results, qualifying, pit stops, drivers, teams, circuits, CRUD collections, and analytics endpoints returned HTTP 200.
- The frontend endpoint contract issue was fixed by making the driver-standings path explicit without changing its generated URL.

## Step 6 — Tests

Completed.

- `python -m pytest -q`: **9 passed**.

## Final state

The README workflow is complete locally. The Flask server is running in the attached session; stop it with its process ID when finished.

## Frontend redesign — Stage 0 plan

Planning only; implementation waits for review approval.

### Design system

- Dark graphite background with elevated charcoal panels, thin neutral borders, and restrained shadows.
- F1 red is the only global accent for actions, active navigation, focus, and key highlights.
- Team colours are data-driven accents only: stripes, legend markers, and chart series use `team.primary_color` when available.
- Typography uses local/system sans-serif stacks: a condensed display stack for headings and a clean UI stack for data. No web font CDN.
- Small uppercase panel labels, tabular numerals, 8px spacing rhythm, 12px panel radius, and responsive CSS grid.
- Shared components: app shell, top bar, season selector, panel header, KPI card, animated numeric value, badge, data table, gauge, sparkline, chart card, empty state, loading skeleton, and error banner.

### Planned read-only data surfaces

New SQL will be added in a separate `database/06_premium_analytics.sql` file and exposed through read-only Flask routes. Existing schema, standings views, standings logic, and response shapes remain unchanged.

| Surface | Purpose |
|---|---|
| `v_driver_points_progression` | Cumulative driver points by season and round |
| `v_driver_form` | Recent classified finishes and points for form sparklines |
| `v_race_grid_finish` | Grid position versus finish position by race and driver |
| `v_pit_stop_analysis` | Stop counts and duration aggregates by race/team/driver |
| `v_driver_profile_stats` | Profile totals for wins, podiums, DNFs, points, and starts |
| `v_head_to_head` | Driver pair comparison for a selected season |
| `v_season_rate_metrics` | Database-derived win, podium, and DNF percentages |

Planned endpoints are read-only and return JSON:

- `GET /api/seasons/<year>/points-progression`
- `GET /api/seasons/<year>/driver-form`
- `GET /api/races/<race_id>/grid-finish`
- `GET /api/races/<race_id>/pit-analysis`
- `GET /api/drivers/<driver_id>/profile`
- `GET /api/teams/<team_id>/profile`
- `GET /api/head-to-head?season=<year>&driver_a=<id>&driver_b=<id>`
- `GET /api/seasons/<year>/rate-metrics`

### Page layouts

- **Stage 1 shell:** premium top bar, compact sidebar, season context, responsive panels, badges, tables, and shared loading/error states.
- **Stage 2 dashboard:** champion hero, title-fight points/gap gauges, cumulative points chart, latest race summary, and database-backed stat cards.
- **Stage 3 standings:** driver/constructor toggle, podium treatment, team-colour stripes, points gap, search/sort controls, and recent-form sparklines.
- **Stage 4 race pages:** race order table, grid-versus-finish chart, pit-stop analysis, and a labelled decorative circuit outline.
- **Stage 5 profiles:** driver/team profile header, database-backed career/season metrics, team history, and head-to-head comparison.
- **Stage 6 analytics:** win/podium/DNF percentage gauges plus SQL gallery cards containing the SQL text, plain-English explanation, and live Oracle result.
- **Stage 7 polish:** responsive breakpoints, keyboard/focus states, reduced-motion support, accessible labels, loading/error/empty states, and final visual consistency pass.

### Validation gates

Each approved stage will run `python -m pytest -q`, preserve the API/frontend alignment test, and update this progress file before stopping for review. Chart rendering will use a locally served library under `frontend/vendor/`; no CDN assets will be introduced.

## Frontend redesign — Stage 1

Completed and awaiting review.

- Replaced the Google Fonts CDN links with local/system font stacks.
- Added the premium graphite/red shell, grouped navigation, uppercase labels, season context, database status, thin borders, responsive layout, focus states, and reduced-motion support.
- Preserved all existing navigation `data-view` hooks, element IDs, API calls, and current page behavior.
- Browser smoke check passed at `http://127.0.0.1:5000/`; Oracle status displayed as connected.
- Test gate: `python -m pytest -q` — **9 passed**.

## Next

After approval, implement Stage 2 dashboard data surfaces and database-backed visualizations.

## Reference image and clarified redesign brief

- Confirmed the supplied reference image is visible and saved at `docs/design/reference.png`.
- The image is used only for layout, styling, and component inspiration; its names, numbers, teams, points, counts, taglines, and other displayed values will not be copied.
- No official F1 logos, team logos, or real driver photos will be added. The implementation will use a text wordmark, simple red mark, initials badges, team-colour rings/stripes, and labelled decorative local assets only.
- The sidebar, global season tabs, search, hero banner, five database-backed stat cards, standings panels, season overview, progression chart, race winners, circuits strip, and quick-link tiles are now the target layout.
- A local `frontend/vendor/` chart library and local font/assets are required; no CDN or runtime external requests will be introduced.
- The originally planned endpoint names will be aligned to the clarified dashboard contract:
  `/api/dashboard/summary`, `/api/dashboard/season-overview`,
  `/api/dashboard/progression`, `/api/dashboard/race-winners`,
  `/api/dashboard/circuits`, and `/api/search`.
- Stage 0 remains planning-only. Before Stage 2 implementation, the exact SQL for each new endpoint will be shown in a new database script and covered by endpoint tests.

## Frontend redesign — Stage 1 (clarified reference shell)

Completed and awaiting review.

- Added `frontend/css/tokens.css` with the red/graphite palette, spacing scale, radii, typography stacks, motion, and panel tokens.
- Updated the app shell toward the supplied reference: grouped fixed sidebar, full navigation set, season tabs, global search field, profile initials badge, Oracle status, responsive layout, and existing page hooks.
- Added Seasons and Data management navigation targets without changing existing API response shapes; Seasons is backed by the existing `/api/seasons` endpoint and Data management opens the existing sponsor management surface.
- Removed external font dependencies; no CDN or runtime external request was added.
- Browser smoke check passed; clicking the 2023 season tab changed the global season and reloaded the dashboard.
- Test gate: `python -m pytest -q` — **9 passed**.

## Next

After approval, implement the database-backed Stage 2 dashboard surfaces. First show the exact SQL for each new read-only endpoint, then add views/routes/tests and stop for review.

## Frontend redesign — Stage 2

Completed and awaiting review.

- Added `database/06_dashboard_views.sql` with read-only summary and driver/team cumulative progression views.
- Added read-only endpoints for dashboard summary, season overview, progression, race winners, and circuits.
- Rebuilt the dashboard from Oracle responses: hero counts, five stat cards, top-five driver/constructor standings, season overview, latest race winner, race-winner list, circuits, and a drivers/teams cumulative points SVG chart.
- Team colours are used only when returned by the database for data markers; the rest of the chrome remains black/red.
- The race-car silhouette and circuit lines are CSS-decorative and labelled as such in the markup; no telemetry, tyre, or G-force panels were added.
- Added endpoint alignment coverage to `tests/test_api_contract.py`.
- Live smoke checks: all six Stage 2 endpoint requests returned HTTP 200; the dashboard rendered in the browser with connected Oracle status.
- Test gate: `python -m pytest -q` — **10 passed**.

## Frontend redesign — Stage 3

Completed and awaiting review.

- Added `database/07_standings_views.sql` with read-only form views for the last five completed rounds per driver/team.
- Added read-only `/api/standings/form?season=&mode=drivers|teams` endpoint with verified Grand Prix only; never changes championship totals.
- Redesigned standings rendering with:
  - Driver/constructor toggle (mode selector)
  - Search input to filter by driver name or team
  - Sort options: championship position, points, points gap, race wins
  - Podium row highlighting (positions 1–3)
  - Team-colour left stripe on each row
  - Points cell with leader gap display
  - Form sparkline showing the last five race finishes (mini SVG chart)
  - Responsive table with inline driver/team subtitles
- Live endpoint test: 105 driver form rows for 2025, all verified GP results.
- Test gate: `python -m pytest -q` — **10 passed**.

## Next

Completed Stage 4.

## Frontend redesign — Stage 4

Completed and verified.

- Added `database/08_race_views.sql` with read-only views:
  - `v_race_grid_finish`: per race and driver: grid position, finishing position, positions gained/lost, points, status (finished/DNF reason), laps completed, and fastest lap rank (Grand Prix session_type = 'RACE', verified only).
  - `v_pit_stop_analysis`: per race and driver: stop count, fastest stop duration (ms and formatted seconds), slowest stop duration, and average stop duration.
- Added read-only backend endpoints:
  - `GET /api/races/<race_id>/grid-finish`: returns race grid-vs-finish classification.
  - `GET /api/races/<race_id>/pit-analysis`: returns race pit stop statistics and driver stop breakdown.
  - `GET /api/search?q=`: case-insensitive parameterised search across drivers, teams, races, and circuits (min 2 characters, max 10 results, each with type, label, link, and view).
  - `GET /api/seasons/<year>/race-cards`: read-only endpoint powering season race cards with winner and pole sitter.
- Created 24 simplified local SVG track outlines in `frontend/assets/circuits/<circuit_ref>.svg` plus `generic.svg` fallback.
- Rebuilt Race pages:
  - **Calendar & Results**: season race cards displaying round, race name, circuit, date, winner with team, pole sitter, and decorative SVG track layout, reacting to the global season tabs.
  - **Race detail page**: podium block (1st, 2nd, 3rd with driver initials badges and points), full race order table (position, driver, team badge with color stripe, grid, positions gained/lost pill, time or status, points), grid-vs-finish paired delta bars chart, pit-stop analysis (total stops, fastest stop highlighted with driver name, average duration, driver stop table), and decorative circuit outline.
  - Loading skeletons, empty states, and error banners.
- Implemented global search:
  - 250ms debounced input wired to `/api/search`.
  - Type-grouped dropdown (Drivers, Teams, Races, Circuits).
  - Full keyboard navigation (ArrowUp, ArrowDown, Enter, Escape) and click-to-navigate.
- Added 6 bottom dashboard quick-link tiles (Race results, Qualifying, Pit stops, Penalties, Analytics, Data management) with background image support (`frontend/assets/img/*.webp`) and CSS red gradient placeholders.
- Test gate: `python -m pytest -q` — **13 passed**.

## Visual Fidelity Pass (Dashboard & Chrome)

Completed and verified against `docs/design/reference.png`.

1. **Stat cards**:
   - All 5 stat cards arranged in a single horizontal row (`repeat(5, 1fr)`), wrapping only below 1200px.
   - Inline SVG icons added to each card (Calendar, Racetrack, Helmet, Constructors, Pit Stop) with neon-red glow filter.
   - Formatted numerical values with thousands separators (e.g. `2,558` pit stops) via `Number(val).toLocaleString()`.
2. **Hero panel**:
   - Integrated `hero-car.png` (with fallback chain to `.webp` and `.jpg`) on the right side of the hero section.
   - Dark gradient overlay preserves crisp text contrast and readability.
   - Added subtle red light-streak background pattern and luminous red glow panel border (`box-shadow: 0 0 28px rgba(225, 6, 0, 0.22)`).
   - Added editorial quote tagline `SAME CARS. REAL DATA. THREE SEASONS. ENDLESS INSIGHTS.` on the right.
3. **Progression chart**:
   - Distinct color shades per driver: teammates sharing a base color are distinguished by lighter tints (`adjustColorForTeammate`).
   - Legend indicator colors match the line colors.
   - Y-axis numerical labels and vertical "Points" title rendered in SVG.
   - X-axis round labels and horizontal "Race Round" title rendered in SVG.
   - Interactive hover tooltips displaying driver name, round number, and cumulative points upon hovering over point markers.
4. **Circuits carousel**:
   - Larger cards inside a horizontal scroll-snap container.
   - Styled carousel navigation buttons (`#circuitsPrev`, `#circuitsNext`) for smooth left/right scrolling.
   - Displays SVG track outline, circuit name, locality/country, and season badges.
5. **Quick-link tiles**:
   - Unified card height, typography, description spacing, and red arrow alignment across all six tiles.
   - Display tile images (`tile-results`, `tile-qualifying`, `tile-pitstops`, `tile-penalties`, `tile-analytics`, `tile-data`) with dark gradient overlay and CSS fallback.
6. **Latest round card**:
   - Formatted race date as `"07 Dec 2025"` via `formatF1Date()`.
   - Repositioned directly beside the progression chart in `dashboard-grid-bottom` column alongside the Race Winners panel.
7. **Sidebar**:
   - Added clean line SVG icons to all navigation buttons.
   - Integrated `sidebar-helmet.png` with three-line illuminated tagline `DATA / DRIVES / CHAMPIONS` at the bottom of the sidebar.
8. **Neon aesthetic & contrast**:
   - Added red neon glows on hover/active nav items, tabs, and cards.
   - Red-tinted panel borders and subtle diagonal streak background pattern.
   - Guaranteed text contrast and readability across all screens.
- Test gate: `python -m pytest -q` — **13 passed**.

## Dashboard Refinements & Bug Fixes

Completed and verified:

1. **Driver Standings Team Column**:
   - Diagnosed root cause: `prc_driver_standings` and `v_driver_standings` return driver statistics without `team_name` or `primary_color`, causing the frontend's `r.team_name` reference to evaluate to `undefined` ("—").
   - Fixed by concurrently querying `/api/standings/form?season=&mode=drivers`, mapping `driver_id` to `{ team_name, primary_color }`, and rendering the team name with its color stripe.
   - Populated standard F1 constructor `primary_color` values in the Oracle `team` table.
2. **Standings Tables Responsive Layout**:
   - Replaced generic table markup with `dashboardTable()`, using compact padding (`8px 6px`) and `.cell-name` truncation with `text-overflow: ellipsis`.
   - Hidden the "Podiums" column under 1400px via `.col-podiums` responsive CSS rule to prevent table overflow.
   - Enabled smooth container-level horizontal scrolling.
3. **Season Overview Formatting**:
   - Added spacing and bullet divider: `Max Verstappen · 575 pts`.
   - Styled `.overview-row` with a 3-column CSS grid to keep rows aligned and prevent awkward wrapping.
4. **Season Overview Driver Count Verification**:
   - Verified SQL uses `COUNT(DISTINCT rr.driver_id)` on verified GP race results.
   - Confirmed that 22 drivers in 2023 (20 regular + Nyck de Vries & Liam Lawson) and 24 drivers in 2024 (20 regular + Bearman, Colapinto, Doohan, Lawson) are exact historical counts matching the race numbers.
   - Optimized the endpoint query using fast correlated scalar subqueries.
5. **Hero Car Fade & Tagline**:
   - Applied smooth CSS gradient mask (`linear-gradient(to right, transparent, ...)`) to `.hero-car-img`, eliminating the hard left edge.
   - Placed the tagline quote directly over the upper image area with drop shadow.
   - Constrained text container width to prevent overlap with the car.
6. **Latest Round Card Repositioning**:
   - Integrated the latest round highlight directly into the chart panel below the progression chart and legend (`.latest-round-bar`).
   - Adjusted chart height to eliminate dead whitespace.
- Test gate: `python -m pytest -q` — **13 passed**.

## Analytics Page Upgrade (SQL Gallery, Safe Console, Trigger Demo)

Completed and verified:

1. **Curated Query Gallery (`database/09_demo_queries.sql`)**:
   - Added 5 Oracle-verified analytical queries demonstrating key DBMS concepts:
     - `top-drivers-2025-wins`: Top 5 drivers by 2025 GP wins (JOIN, GROUP BY, AGGREGATION, FETCH FIRST).
     - `race-podium`: 2024 Monaco GP podium classification (JOIN, FILTERING, ORDER BY).
     - `rank-above-average`: Driver rankings with analytic `RANK()` window function & scalar subquery above season average (WINDOW FUNCTION, SUBQUERY, VIEW).
     - `biggest-grid-gainers`: Top 10 grid-to-finish position gainers from `v_race_grid_finish` (VIEW, FILTERING, SORTING).
     - `constructors-having-wins`: Constructors with >5 wins using `GROUP BY` and `HAVING` (JOIN, GROUP BY, HAVING).
   - Added read-only `GET /api/analytics/queries` returning `id`, `title`, `explanation`, `sql`, and `tags`.
   - Added `POST /api/analytics/run/<id>` (with backward-compatible GET) returning `columns`, `rows`, `row_count`, and `execution_time_ms`.
   - Frontend: Each query rendered in a dedicated card with concept tags, plain-English explanation, syntax-highlighted SQL box, "Copy SQL" clipboard button, "Load in Console" button, and live execution table showing rows and millisecond timing.

2. **Safe Query Console**:
   - Added `scripts/create_viewer_user.sql` creating read-only Oracle user `f1_viewer` with `CREATE SESSION` and `SELECT` grants generated dynamically across tables and views.
   - Added `F1_VIEWER_USER` and `F1_VIEWER_PASSWORD` to `.env.example` and `backend/config.py`, with dedicated connection pool `get_viewer_pool()` in `backend/db.py`.
   - Added `POST /api/analytics/console` with multi-layered safety guardrails:
     - Restricted exclusively to `127.0.0.1` / localhost.
     - Enforces single statement whitelist (`SELECT` or `WITH`).
     - Rejects semicolons and comments (`--`, `/* */`).
     - Blacklists DDL, DML mutations, procedural execution, and privilege keywords (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `EXECUTE`, `CALL`, `BEGIN`, `DECLARE`).
     - Enforces 200-row cap and 10-second call timeout.
     - Returns readable Oracle error messages.
     - Documented deliberate safety exception to the "bind variables only" rule in code comments.
   - Frontend: Monospace editor, `Ctrl+Enter` shortcut, gallery query selector dropdown, timing and row count badges, and error banner.

3. **Protected Results Trigger Demo**:
   - Added `POST /api/analytics/trigger-demo`:
     - Attempts to delete a verified historical race result in a transaction.
     - Intercepted by `trg_race_result_protect`, raising `ORA-20001: Verified historical race results cannot be deleted.`
     - Always executes `conn.rollback()`.
     - Validates and returns that table row count before and after is identical.
   - Frontend: "Protected results trigger" card with "Test Protected Delete" button, displaying attempted SQL, caught Oracle exception, and confirmed identical row counts before and after.

4. **Testing Gate**:
   - Added comprehensive test suite `tests/test_analytics.py` covering query gallery list/run, console validation, keyword/comment/semicolon blocking, row capping, remote IP rejection, and trigger demo integrity check.
   - Test gate: `python -m pytest -q` — **21 passed**.

## Stage 5 Part A — Driver & Team Profiles, Head-to-Head & Rate Gauges

Completed and verified:

1. **Analytical Profile Views (`database/10_profile_views.sql`)**:
   - `v_driver_profile_stats`: Aggregates driver statistics per driver and season: starts, wins, podiums, poles, points, DNFs (classified non-finishes via `classification_status`), average finish position, average grid position, and net positions gained.
   - `v_head_to_head`: Computes dual-driver head-to-head metrics in a season: points, wins, podiums, direct race finishes ahead count, qualifying head-to-head count, and average finish positions for every pair of drivers.
   - `v_season_rate_metrics`: Computes win rate (and win %), podium rate (and podium %), and DNF rate (and DNF %) per driver per season from verified Grand Prix starts.
   - Executed cleanly via `scripts/run_sql.py database/10_profile_views.sql` with zero compilation errors.

2. **Backend API Endpoints (`backend/api.py`)**:
   - `GET /api/drivers/<int:driver_id>/profile`: Returns driver metadata, latest team info, career totals, season-by-season statistics, and round-by-round points for sparklines. Returns 404 for non-existent drivers.
   - `GET /api/teams/<int:team_id>/profile`: Returns constructor bio, career totals, season constructor standings, and driver breakdown with points contribution percentage. Returns 404 for non-existent teams.
   - `GET /api/head-to-head?season=&driver_a=&driver_b=`: Returns comparative head-to-head metrics, team styling, and advantages for two drivers. Enforces required parameters, non-identical driver validation, and 404 handling.
   - `GET /api/seasons/<int:year>/rate-metrics`: Returns full season rate metrics for all drivers in the requested season.

3. **Frontend Implementation (`frontend/js/app.js`, `frontend/css/styles.css`, `frontend/index.html`)**:
   - **Driver Profile Page**:
     - Large initials badge with team color ring glow and car number.
     - Team stripe, nationality, active seasons count, and interactive driver picker dropdown.
     - Career KPI cards: Points, Wins, Podiums, Poles, Starts.
     - Win/Podium/DNF circular ring gauges with toggle between Season and Career views.
     - Round-by-round points sparkline chart with interactive hover tooltips.
     - Full per-season career archive table.
     - Protected notes editor saving to Oracle.
   - **Team Profile Page**:
     - Team header badge, constructor name, nationality, and team switcher.
     - Stat cards: Points, Wins, Podiums, Seasons count.
     - Per-season constructor standings table.
     - Driver contribution section with season pills and horizontal proportional bars showing points share.
     - Drivers per season table and team color/notes management.
   - **Head-to-Head Comparison Page**:
     - Season selector, Driver A selector, Driver B selector, and one-click "Swap" button.
     - Side-by-side driver profile cards with illuminated central "VS" badge.
     - 6 comparative dual horizontal progress bars with advantage highlighting (Points, Wins, Podiums, Races Finished Ahead, Qualifying Ahead, Average Finish).
   - **Universal Deep Linking**:
     - Standings, dashboard panels (driver standings, constructor standings, race winners), race classification tables, qualifying, and pit stop tables link driver and team names directly to their respective profile views.
     - Global search driver/team results navigate directly to profile pages.
     - Hash-based deep link router (`#drivers?id=...`, `#teams?id=...`, `#head-to-head?...`) and delegated click handlers.

4. **Testing Gate**:
   - Added unit and contract tests in `tests/test_profiles.py` and updated `tests/test_api_contract.py`.
   - Test gate: `python -m pytest -q` — **28 passed**.

## Stage 5 Part B — Premium Redesign of Remaining Pages

Completed and verified:

1. **Sidebar and Hero Visual Fixes**:
   - Sidebar "DATA DRIVES CHAMPIONS" card: Adjusted layout and made `frontend/assets/img/sidebar-helmet.png` the full background image with dark overlay gradient, eliminating clipping across desktop viewport heights.
   - Hero Car: Brightened the hero car image (`filter: drop-shadow(...) brightness(1.22) contrast(1.08)`) and softened the gradient overlay so the car pops cleanly against the background.
   - Preserved keyboard `:focus-visible` ring across all interactive controls and links (`a:focus-visible`, `[tabindex]:focus-visible`).

2. **Seasons Page**:
   - Upgraded to a responsive card grid (one card per season: 2025, 2024, 2023).
   - Each card displays total races, drivers, constructors, champion driver (with points and link), champion constructor (with points, team stripe and link), most wins record, and quick action buttons for Calendar and Standings.
   - Endpoint: `GET /api/seasons/overview-cards`.

3. **Drivers Page**:
   - Upgraded to a filterable card grid (`Season`, `Team`, and real-time text `Search`).
   - Each driver card features initials badge with glowing team color ring, championship position badge (`P1` gold, `P2`, etc.), team badge, points, wins, and podiums.
   - Clicking any driver card seamlessly opens their full profile, with a "← Back to all drivers" button to return to the grid.
   - Endpoint: `GET /api/seasons/<year>/driver-cards`.

4. **Teams Page**:
   - Upgraded to a card grid showing team primary color top border, nationality, championship position, constructor points, wins, podiums, and driver pairings with points contribution.
   - Clicking opens the full team profile with a "← Back to all teams" button to return to the grid.
   - Endpoint: `GET /api/seasons/<year>/team-cards`.

5. **Races / Calendar Page**:
   - Added season filter chips (2025, 2024, 2023) for quick switching.
   - Enhanced sprint weekend badge with glowing purple neon styling (`⚡ Sprint Weekend`).
   - Retained high-fidelity circuit track layout SVGs, winner highlights, and race analysis links.

6. **Qualifying Page**:
   - Integrated race selector with season tabs.
   - Highlighted Pole Sitter banner with trophy icon, pole time, team stripe and lap time.
   - Added visual Gap-to-Pole bar chart comparing top qualifiers with team colored bars and delta times (`POLE`, `+0.078s`, etc.).
   - Grid table with Q1, Q2, Q3 elimination times, gap to pole, and highlighted P1 row.

7. **Pit Stops Page**:
   - Integrated race selector with season tabs.
   - KPI cards for Total Stops, Fastest Pit Lane Time (driver, lap, time in seconds), and Average Pit Lane Time (explicitly labeled "pit lane time").
   - Added visual bar chart of the fastest stops in the race with driver code, lap, and team colors.
   - Complete table with Stop #, Driver, Team, Lap, Pit Lane Time, and Time of Day.

8. **Penalties, Sponsors & Data Management**:
   - Prominent badge on all management surfaces: `⚠️ Illustrative Management Data · Excluded from Championship Standings`.
   - Data tables equipped with search and sort controls.
   - Forms with field validation (prevents empty submissions with error toasts).
   - Deletions and deal unassignments require confirmation dialogs (`confirm()`).
   - Dedicated Data Management Console with tabs for Driver Notes, Team Notes, Penalties CRUD, Sponsors CRUD, and Database Integrity Notice.
   - Official race results and points remain strictly read-only and protected by database triggers.

9. **Testing Gate**:
   - Added endpoint tests in `tests/test_profiles.py` for overview-cards, driver-cards, and team-cards.
   - Test gate: `python -m pytest -q` — **32 passed**.
