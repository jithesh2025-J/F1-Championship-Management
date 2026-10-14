const viewEl = document.getElementById("view");
const seasonEl = document.getElementById("season");
const healthEl = document.getElementById("health");
const toastEl = document.getElementById("toast");

const state = {
  view: "dashboard",
  season: 2025,
  races: [],
  selectedRace: null,
  selectedDriver: null,
  selectedTeam: null,
  h2hSeason: 2025,
  h2hDriverA: null,
  h2hDriverB: null,
};

const driverStandingsPath = (year) => `/api/seasons/{year}/driver-standings`.replace("{year}", year);
const raceGridFinishPath = (id) => `/api/races/{id}/grid-finish`.replace("{id}", id);
const racePitAnalysisPath = (id) => `/api/races/{id}/pit-analysis`.replace("{id}", id);
const raceCardsPath = (year) => `/api/seasons/{year}/race-cards`.replace("{year}", year);

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3500);
}

function el(html) {
  viewEl.innerHTML = html;
}

function table(headers, rows, empty = "No rows yet.") {
  if (!rows || !rows.length) return `<div class="empty">${empty}</div>`;
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
  return `<div class="card" style="overflow:auto"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function dashboardTable(headers, rows, empty = "No rows yet.") {
  if (!rows || !rows.length) return `<div class="empty">${empty}</div>`;
  const getColClass = (h, i) => {
    const hl = (h || "").toLowerCase();
    if (hl === "pos") return "col-pos";
    if (hl === "driver") return "cell-name col-driver";
    if (hl === "team") return i === 1 ? "cell-name col-team" : "col-team";
    if (hl === "points") return "col-pts";
    if (hl === "wins") return "col-wins";
    if (hl === "podiums") return "col-podiums";
    return "";
  };
  const head = headers.map((h, i) => `<th class="${getColClass(h, i)}">${h}</th>`).join("");
  const body = rows.map((r) => {
    return `<tr>${r.map((c, i) => {
      const cls = getColClass(headers[i], i);
      return `<td class="${cls}">${c ?? ""}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="dashboard-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function loadHealth() {
  try {
    const h = await api.get("/api/health");
    const n = h.race_results ?? 0;
    healthEl.textContent = h.status === "ok"
      ? `Oracle connected · ${n} result rows`
      : "Database disconnected";
    healthEl.className = "health " + (h.status === "ok" ? "ok" : "bad");
  } catch {
    healthEl.textContent = "API unreachable — start Flask (python backend/app.py)";
    healthEl.className = "health bad";
  }
}

async function loadSeasons() {
  const seasons = await api.get("/api/seasons");
  if (!seasons.length) {
    seasonEl.innerHTML = `<option>No seasons imported</option>`;
    return;
  }
  // Default to 2025 on initial load so historical data is displayed first
  state.season = 2025;
  seasonEl.innerHTML = seasons.map((s) => {
    const isManual = (s.notes && s.notes.toLowerCase().includes("manual")) || s.season_year === 2026;
    const badge = isManual ? " · Manual demo" : ` · ${s.race_count} races`;
    return `<option value="${s.season_year}">${s.season_year}${badge}</option>`;
  }).join("");
  seasonEl.value = state.season;
}

async function render() {
  const v = state.view;
  el(`<div class="loading">Loading ${v}…</div>`);
  try {
    if (v === "dashboard") return await renderDashboard();
    if (v === "seasons") return await renderSeasons();
    if (v === "standings") return await renderStandings();
    if (v === "calendar") return await renderCalendar();
    if (v === "qualifying") return await renderQualifying();
    if (v === "drivers") return await renderDrivers();
    if (v === "teams") return await renderTeams();
    if (v === "head-to-head" || v === "h2h") return await renderHeadToHead();
    if (v === "pits") return await renderPits();
    if (v === "penalties") return await renderPenalties();
    if (v === "sponsors") return await renderSponsors();
    if (v === "analytics") return await renderAnalytics();
    if (v === "data-management") return await renderDataManagement();
    if (v === "season-2026") return await renderSeason2026();
  } catch (err) {
    el(`<div class="banner">${err.message}</div><p class="muted">If this is a database error, import historical data first.</p>`);
  }
}

async function renderSeasons() {
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Championship archive &amp; manual mode</span>
        <h2>Seasons (2023 – 2026)</h2>
        <p class="muted">Completed historical seasons (2023–2025) and active manual data entry season (2026).</p>
      </div>
    </div>
    <div class="seasons-grid" id="seasonsCardsContainer">
      ${Array.from({ length: 4 }).map(() => `<div class="skeleton-card" style="height:280px"></div>`).join("")}
    </div>
  `);

  try {
    let seasons = [];
    try {
      seasons = await api.get("/api/seasons/overview-cards");
    } catch {
      seasons = await api.get("/api/seasons");
    }

    const container = document.getElementById("seasonsCardsContainer");
    if (!container) return;

    if (!seasons.length) {
      container.innerHTML = `<div class="empty full">No seasons imported. Run the data pipeline.</div>`;
      return;
    }

    container.innerHTML = seasons.map((s) => {
      const year = s.season_year;
      const isManual = (s.notes && s.notes.toLowerCase().includes("manual")) || year === 2026;
      const driverPts = s.champ_driver_points != null ? `${s.champ_driver_points} pts` : "";
      const teamPts = s.champ_team_points != null ? `${s.champ_team_points} pts` : "";
      const teamColor = s.champ_team_color || "var(--red)";

      return `
        <div class="season-card">
          <div class="season-card-header">
            <div>
              <div class="season-card-year">${year} <span>F1</span> ${isManual ? '<span class="season-badge-manual">MANUAL DEMO</span>' : ''}</div>
              <span class="muted" style="font-size:0.75rem">${s.season_name || `${year} FIA Formula One World Championship`}</span>
            </div>
            <div class="season-card-counts">
              <span class="season-pill">${s.race_count || 0} Races</span>
              <span class="season-pill">${s.driver_count || 0} Drivers</span>
              <span class="season-pill">${s.constructor_count || (isManual ? 0 : 10)} Teams</span>
            </div>
          </div>

          <div class="season-champs-box">
            <div class="season-champ-item">
              <span class="season-champ-label">🏆 Champion Driver</span>
              <span class="season-champ-val">
                ${s.champ_driver_name ? `<a href="#drivers?id=${s.champ_driver_id || ''}" class="profile-link" data-driver-id="${s.champ_driver_id || ''}">${s.champ_driver_name}</a>` : `<span class="muted">${isManual ? "TBD · In progress" : "—"}</span>`}
                <span class="champ-pts">${driverPts}</span>
              </span>
            </div>
            <div class="season-champ-item">
              <span class="season-champ-label">🏆 Champion Constructor</span>
              <span class="season-champ-val">
                ${s.champ_team_name ? `<span class="team-stripe" style="background:${teamColor}"></span><a href="#teams?id=${s.champ_team_id || ''}" class="profile-link" data-team-id="${s.champ_team_id || ''}">${s.champ_team_name}</a>` : `<span class="muted">${isManual ? "TBD · In progress" : "—"}</span>`}
                <span class="champ-pts">${teamPts}</span>
              </span>
            </div>
          </div>

          <div class="season-stat-row">
            <span>Most Wins</span>
            <strong style="color:#fff">${s.most_wins_driver || (isManual ? "Awaiting race results" : "—")}</strong>
          </div>

          <div class="season-card-actions">
            ${isManual ? `<button class="btn primary" style="flex:1" data-season-manage="${year}">2026 Management →</button>` : `<button class="btn primary" style="flex:1" data-season-calendar="${year}">Calendar →</button>`}
            <button class="btn ghost" style="flex:1" data-season-standings="${year}">Standings →</button>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-season-manage]").forEach((btn) => {
      btn.onclick = () => {
        navigateTo("season-2026");
      };
    });

    container.querySelectorAll("[data-season-calendar]").forEach((btn) => {
      btn.onclick = () => {
        state.season = Number(btn.dataset.seasonCalendar);
        state.selectedRace = null;
        syncSeasonTabs();
        navigateTo("calendar");
      };
    });
    container.querySelectorAll("[data-season-standings]").forEach((btn) => {
      btn.onclick = () => {
        state.season = Number(btn.dataset.seasonStandings);
        syncSeasonTabs();
        navigateTo("standings");
      };
    });
  } catch (err) {
    const container = document.getElementById("seasonsCardsContainer");
    if (container) container.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

function formatF1Date(dateStr) {
  if (!dateStr) return "";
  const clean = String(dateStr).split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10) - 1;
    const d = parts[2].padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (m >= 0 && m < 12) return `${d} ${monthNames[m]} ${y}`;
  }
  return dateStr;
}

function adjustColorForTeammate(hex, index) {
  if (index === 0 || !hex || !hex.startsWith("#")) return hex || "#e10600";
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  let r = parseInt(c.slice(0, 2), 16);
  let g = parseInt(c.slice(2, 4), 16);
  let b = parseInt(c.slice(4, 6), 16);
  r = Math.min(255, Math.round(r * 0.55 + 255 * 0.45));
  g = Math.min(255, Math.round(g * 0.55 + 255 * 0.45));
  b = Math.min(255, Math.round(b * 0.55 + 255 * 0.45));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

async function renderDashboard() {
  const y = state.season;
  const [summary, overview, d, teams, progression, winners, circuits, races, driverForm] = await Promise.all([
    api.get("/api/dashboard/summary"),
    api.get("/api/dashboard/season-overview"),
    api.get(driverStandingsPath(y)),
    api.get(`/api/seasons/${y}/constructor-standings`),
    api.get(`/api/dashboard/progression?season=${y}&mode=${window._progressMode || "drivers"}`),
    api.get("/api/dashboard/race-winners"),
    api.get("/api/dashboard/circuits"),
    api.get(`/api/seasons/${y}/races`),
    api.get(`/api/standings/form?season=${y}&mode=drivers`),
  ]);
  const leader = d[0] ? `${d[0].first_name} ${d[0].last_name}` : "Unavailable";
  const ctor = teams[0]?.team_name || "Unavailable";
  const latest = races.at(-1);
  const latestResults = latest ? await api.get(`/api/races/${latest.race_id}/results?session=RACE`) : [];
  const latestWinner = latestResults[0];
  const currentOverview = overview.find((row) => Number(row.season_year) === y);
  const circuitsById = new Map();
  circuits.forEach((row) => {
    const item = circuitsById.get(row.circuit_id) || { ...row, seasons: [] };
    item.seasons.push(row.season_year);
    circuitsById.set(row.circuit_id, item);
  });
  const driverTeamMap = new Map();
  driverForm.forEach((row) => {
    if (row.driver_id && row.team_name && !driverTeamMap.has(row.driver_id)) {
      driverTeamMap.set(row.driver_id, {
        team_id: row.team_id,
        team_name: row.team_name,
        primary_color: row.primary_color || "var(--red)",
      });
    }
  });
  const chartMode = window._progressMode || "drivers";
  el(`
    <section class="hero-panel">
      <div class="hero-content">
        <span class="eyebrow">F1 championship intelligence</span>
        <h2>Championship <em>Management</em></h2>
        <p>Complete race, results and championship data from ${summary.completed_seasons} verified seasons.</p>
        <span class="hero-meta">${Number(summary.total_races).toLocaleString()} races · ${Number(summary.unique_drivers).toLocaleString()} active drivers · ${Number(summary.constructors).toLocaleString()} constructors</span>
      </div>
      <div class="hero-car-wrap">
        <img src="/assets/img/hero-car.png" alt="Formula 1 car" class="hero-car-img" onerror="this.src='/assets/img/hero-car.webp'; this.onerror=()=>this.src='/assets/img/hero-car.jpg'" loading="eager" />
        <div class="hero-car-overlay"></div>
      </div>
      <div class="hero-tagline-quote">
        <span>SAME CARS.</span>
        <span>REAL DATA.</span>
        <span>THREE SEASONS.</span>
        <span>ENDLESS INSIGHTS.</span>
      </div>
    </section>
    <section class="kpis">
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(summary.completed_seasons).toLocaleString()}</div>
          <h3>Completed seasons</h3>
          <span>2023 · 2024 · 2025</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(summary.total_races).toLocaleString()}</div>
          <h3>Total races</h3>
          <span>${(summary.total_races / Math.max(1, summary.completed_seasons)).toFixed(1)} avg / season</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7 13h10a4 4 0 0 1-4 4H9a2 2 0 0 1-2-2v-2z"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(summary.unique_drivers).toLocaleString()}</div>
          <h3>Unique drivers</h3>
          <span>With race results</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(summary.constructors).toLocaleString()}</div>
          <h3>Constructors</h3>
          <span>Teams recorded</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(summary.total_pit_stops).toLocaleString()}</div>
          <h3>Pit stops</h3>
          <span>From race data</span>
        </div>
      </div>
    </section>
    <section class="dashboard-grid dashboard-grid-top">
      <div class="card dashboard-panel">
        <div class="panel-heading"><div><span class="eyebrow">Season ${y}</span><h3>Driver standings</h3></div><button class="btn ghost" data-view="standings">View full →</button></div>
        ${d.length ? dashboardTable(["Pos", "Driver", "Team", "Points", "Wins", "Podiums"],
          d.slice(0, 5).map((r) => {
            const tm = driverTeamMap.get(r.driver_id) || {};
            const tName = tm.team_name || r.team_name || "—";
            const tColor = tm.primary_color || "var(--red)";
            const teamLink = tm.team_id ? `<a href="#teams?id=${tm.team_id}" class="profile-link standing-team" data-team-id="${tm.team_id}"><span class="team-stripe" style="background:${tColor}"></span>${tName}</a>` : `<span class="standing-team"><span class="team-stripe" style="background:${tColor}"></span>${tName}</span>`;
            return [
              r.championship_position,
              `<a href="#drivers?id=${r.driver_id}" class="profile-link" data-driver-id="${r.driver_id}">${r.first_name} ${r.last_name}</a>`,
              teamLink,
              r.points,
              r.race_wins,
              r.podiums,
            ];
          })) : `<div class="empty" style="padding:28px">No results entered yet for ${y}.<br>${y === 2026 ? '<button class="btn primary btn-sm" style="margin-top:10px" data-view="season-2026">Open 2026 Management →</button>' : ''}</div>`}
      </div>
      <div class="card dashboard-panel">
        <div class="panel-heading"><div><span class="eyebrow">Season ${y}</span><h3>Constructor standings</h3></div><button class="btn ghost" data-view="standings">View full →</button></div>
        ${teams.length ? dashboardTable(["Pos", "Team", "Points", "Wins", "Podiums"],
          teams.slice(0, 5).map((r) => [
            r.championship_position,
            `<a href="#teams?id=${r.team_id}" class="profile-link standing-team" data-team-id="${r.team_id}"><span class="team-stripe" style="background:${r.primary_color || "var(--red)"}"></span>${r.team_name}</a>`,
            r.points,
            r.race_wins,
            r.podiums,
          ])) : `<div class="empty" style="padding:28px">No results entered yet for ${y}.<br>${y === 2026 ? '<button class="btn primary btn-sm" style="margin-top:10px" data-view="season-2026">Open 2026 Management →</button>' : ''}</div>`}
      </div>
      <div class="card dashboard-panel season-overview">
        <div class="panel-heading"><div><span class="eyebrow">Archive &amp; Active</span><h3>Season overview</h3></div></div>
        <div class="overview-list">${overview.map((row) => `
          <div class="overview-row">
            <strong class="overview-year">${row.season_year}</strong>
            <span class="overview-counts">${row.race_count} races · ${row.driver_count} drivers</span>
            <span class="overview-champ">${row.champion_name ? `${row.champion_name} · <b class="champ-pts">${row.champion_points} pts</b>` : (Number(row.season_year) === 2026 ? '<span class="season-badge-manual">MANUAL DEMO</span>' : "—")}</span>
          </div>`).join("")}</div>
      </div>
    </section>
    <section class="dashboard-grid dashboard-grid-bottom">
      <div class="card dashboard-panel chart-panel">
        <div class="panel-heading"><div><span class="eyebrow">Round-by-round</span><h3>Season performance</h3></div>
          <div class="segmented"><button class="${chartMode === "drivers" ? "active" : ""}" data-progress="drivers">Drivers</button><button class="${chartMode === "teams" ? "active" : ""}" data-progress="teams">Teams</button></div>
        </div>
        ${progressionChart(progression, chartMode)}
        ${latest ? `
          <div class="latest-round-bar">
            <div class="latest-round-info">
              <span class="eyebrow">Latest round · ${formatF1Date(latest.race_date)}</span>
              <h4>${latest.race_name}</h4>
            </div>
            <div class="latest-round-winner">
              ${latestWinner ? `Winner: <a href="#drivers?id=${latestWinner.driver_id}" class="profile-link" data-driver-id="${latestWinner.driver_id}"><strong>${latestWinner.first_name} ${latestWinner.last_name}</strong></a> · ${latestWinner.team_id ? `<a href="#teams?id=${latestWinner.team_id}" class="profile-link winner-team" data-team-id="${latestWinner.team_id}">${latestWinner.team_name}</a>` : `<span class="winner-team">${latestWinner.team_name}</span>`}` : "Results pending"}
            </div>
            <button class="btn ghost btn-sm" data-view="calendar">View race details →</button>
          </div>` : ""}
      </div>
      <div class="card dashboard-panel race-winners-panel">
        <div class="panel-heading"><div><span class="eyebrow">All seasons</span><h3>Race winners</h3></div></div>
        <div class="winner-list">${winners.slice(0, 6).map((r) => `
          <div class="winner-row">
            <span class="initial-badge" style="border-color:${r.primary_color || "var(--red)"}">${(r.driver_name || "").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2)}</span>
            <div class="winner-info">
              <a href="#drivers?id=${r.driver_id}" class="profile-link winner-name" data-driver-id="${r.driver_id}">${r.driver_name}</a>
              <span class="winner-team">${r.team_name}</span>
            </div>
            <b class="winner-count">${r.wins}</b>
          </div>`).join("")}</div>
      </div>
    </section>
    <section class="card dashboard-panel circuits-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">World Championship</span><h3>Circuits</h3></div>
        <div class="circuits-actions">
          <div class="circuits-nav-btns">
            <button id="circuitsPrev" class="carousel-btn" aria-label="Previous circuits">‹</button>
            <button id="circuitsNext" class="carousel-btn" aria-label="Next circuits">›</button>
          </div>
          <button class="btn ghost btn-sm" data-view="calendar">View all →</button>
        </div>
      </div>
      <div class="circuit-strip">${Array.from(circuitsById.values()).map((r) => `
        <div class="circuit-card" data-ref="${r.circuit_ref}">
          <div class="circuit-thumb">
            <img src="/assets/circuits/${r.circuit_ref || "generic"}.svg" onerror="this.src='/assets/circuits/generic.svg'" alt="${r.circuit_name} layout" loading="lazy" />
          </div>
          <b>${r.circuit_name}</b>
          <span class="circuit-location">${r.locality || r.country_name || "—"}</span>
          <span class="circuit-seasons">${r.seasons.join(" · ")}</span>
        </div>`).join("")}</div>
    </section>
    <section class="quick-links">
      <button class="quick-tile" data-view="calendar" data-tile="results">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-results.png" onerror="this.src='/assets/img/tile-results.webp'; this.onerror=()=>this.src='/assets/img/tile-results.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Race results</b>
          <span>View completed race results from 2023 – 2025</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
      <button class="quick-tile" data-view="qualifying" data-tile="qualifying">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-qualifying.png" onerror="this.src='/assets/img/tile-qualifying.webp'; this.onerror=()=>this.src='/assets/img/tile-qualifying.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Qualifying</b>
          <span>Grid positions and qualifying times</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
      <button class="quick-tile" data-view="pits" data-tile="pitstops">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-pitstops.png" onerror="this.src='/assets/img/tile-pitstops.webp'; this.onerror=()=>this.src='/assets/img/tile-pitstops.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Pit stops</b>
          <span>Pit stop records and tyre strategies</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
      <button class="quick-tile" data-view="penalties" data-tile="penalties">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-penalties.png" onerror="this.src='/assets/img/tile-penalties.webp'; this.onerror=()=>this.src='/assets/img/tile-penalties.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Penalties</b>
          <span>Race penalties and steward decisions</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
      <button class="quick-tile" data-view="analytics" data-tile="analytics">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-analytics.png" onerror="this.src='/assets/img/tile-analytics.webp'; this.onerror=()=>this.src='/assets/img/tile-analytics.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Analytics</b>
          <span>Advanced queries and visual insights</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
      <button class="quick-tile" data-view="data-management" data-tile="data">
        <div class="quick-tile-img-box">
          <img src="/assets/img/tile-data.png" onerror="this.src='/assets/img/tile-data.webp'; this.onerror=()=>this.src='/assets/img/tile-data.jpg'" alt="" loading="lazy" />
          <div class="quick-tile-img-overlay"></div>
        </div>
        <div class="quick-tile-body">
          <b>Data management</b>
          <span>Manage drivers, teams, races, sponsors and more</span>
          <span class="tile-arrow" aria-hidden="true">→</span>
        </div>
      </button>
    </section>
  `);
  viewEl.querySelectorAll("[data-progress]").forEach((button) => {
    button.onclick = () => { window._progressMode = button.dataset.progress; render(); };
  });
  viewEl.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#nav button").forEach((navButton) => navButton.classList.toggle("active", navButton.dataset.view === button.dataset.view));
      state.view = button.dataset.view;
      if (state.view === "calendar") state.selectedRace = null;
      render();
    };
  });
  viewEl.querySelectorAll(".circuit-card").forEach((card) => {
    card.onclick = () => {
      document.querySelectorAll("#nav button").forEach((navButton) => navButton.classList.toggle("active", navButton.dataset.view === "calendar"));
      state.view = "calendar";
      state.selectedRace = null;
      render();
    };
  });
  const strip = viewEl.querySelector(".circuit-strip");
  const prevBtn = viewEl.querySelector("#circuitsPrev");
  const nextBtn = viewEl.querySelector("#circuitsNext");
  if (strip && prevBtn && nextBtn) {
    prevBtn.onclick = () => strip.scrollBy({ left: -320, behavior: "smooth" });
    nextBtn.onclick = () => strip.scrollBy({ left: 320, behavior: "smooth" });
  }
  const chartWrap = viewEl.querySelector(".chart-wrap");
  if (chartWrap) {
    const tooltip = chartWrap.querySelector(".chart-tooltip");
    chartWrap.querySelectorAll(".chart-dot").forEach((dot) => {
      dot.addEventListener("mouseenter", () => {
        const driver = dot.dataset.driver;
        const round = dot.dataset.round;
        const points = dot.dataset.points;
        tooltip.innerHTML = `<strong>${driver}</strong><span>Round ${round} · ${points} pts</span>`;
        tooltip.classList.add("visible");
        const rect = dot.getBoundingClientRect();
        const wrapRect = chartWrap.getBoundingClientRect();
        tooltip.style.left = `${rect.left - wrapRect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - wrapRect.top - 10}px`;
      });
      dot.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
    });
  }
}

function progressionChart(rows, mode) {
  if (!rows.length) return "<div class='empty'>No progression data for this season.</div>";
  const idKey = mode === "drivers" ? "driver_id" : "team_id";
  const labelKey = mode === "drivers" ? "driver_name" : "team_name";
  const series = new Map();
  const colorUsage = new Map();
  rows.forEach((row) => {
    const id = row[idKey];
    if (!series.has(id)) {
      const baseColor = row.primary_color || "#e10600";
      const usage = colorUsage.get(baseColor) || 0;
      colorUsage.set(baseColor, usage + 1);
      const color = mode === "drivers" ? adjustColorForTeammate(baseColor, usage) : baseColor;
      series.set(id, { label: row[labelKey], color, points: new Map() });
    }
    series.get(id).points.set(Number(row.round_number), Number(row.cumulative_points));
  });
  const width = 740, height = 215, padLeft = 44, padRight = 20, padTop = 14, padBottom = 34;
  const rounds = [...new Set(rows.map((row) => Number(row.round_number)))].sort((a, b) => a - b);
  const rawMax = Math.max(1, ...rows.map((row) => Number(row.cumulative_points)));
  const max = Math.ceil(rawMax / 50) * 50;
  const x = (round) => padLeft + ((round - rounds[0]) / Math.max(1, rounds.at(-1) - rounds[0])) * (width - padLeft - padRight);
  const y = (points) => height - padBottom - (points / max) * (height - padTop - padBottom);

  const yFractions = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = yFractions.map((fraction) => {
    const val = Math.round(max * fraction);
    const yPos = y(val);
    return `<line x1="${padLeft}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" class="chart-grid"/><text x="${padLeft - 8}" y="${yPos + 4}" class="chart-axis-label" text-anchor="end">${val}</text>`;
  }).join("");

  const maxRound = rounds.at(-1) || 24;
  const preferredTicks = [1, 4, 8, 12, 16, 20, 24].filter((r) => r <= maxRound && r >= rounds[0]);
  if (!preferredTicks.includes(maxRound)) preferredTicks.push(maxRound);
  const xLabels = preferredTicks.map((r) => `<text x="${x(r)}" y="${height - padBottom + 16}" class="chart-axis-label" text-anchor="middle">${r}</text>`).join("");

  const lines = [...series.values()].map((item) => {
    const presentRounds = rounds.filter((round) => item.points.has(round));
    const pointsStr = presentRounds.map((round) => `${x(round)},${y(item.points.get(round))}`).join(" ");
    const dotsStr = presentRounds.map((round) => {
      const pts = item.points.get(round);
      return `<circle class="chart-dot" cx="${x(round)}" cy="${y(pts)}" r="3" fill="${item.color}" stroke="#0b0e12" stroke-width="1.5" data-driver="${item.label.replace(/"/g, '&quot;')}" data-round="${round}" data-points="${pts}"/>`;
    }).join("");
    return `<g class="chart-series"><polyline points="${pointsStr}" fill="none" stroke="${item.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dotsStr}</g>`;
  }).join("");

  return `
    <div class="chart-wrap">
      <svg class="progression-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative points progression chart">
        <text x="12" y="${(height - padBottom + padTop) / 2}" class="chart-axis-title" text-anchor="middle" transform="rotate(-90 12 ${(height - padBottom + padTop) / 2})">Points</text>
        ${gridLines}
        ${lines}
        ${xLabels}
        <text x="${(padLeft + width - padRight) / 2}" y="${height - 6}" class="chart-axis-title" text-anchor="middle">Race Round</text>
      </svg>
      <div class="chart-tooltip"></div>
      <div class="chart-legend">${[...series.values()].map((item) => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join("")}</div>
    </div>`;
}

async function renderStandings() {
  const y = state.season;
  const mode = window._standingsMode || "drivers";
  const query = (window._standingsQuery || "").trim().toLowerCase();
  const sort = window._standingsSort || "position";
  const [d, t, form, teams] = await Promise.all([
    api.get(driverStandingsPath(y)),
    api.get(`/api/seasons/${y}/constructor-standings`),
    api.get(`/api/standings/form?season=${y}&mode=${mode}`),
    api.get("/api/teams"),
  ]);
  const colors = new Map(teams.map((team) => [team.team_name, team.primary_color]));
  const formById = new Map();
  form.forEach((row) => {
    const id = mode === "drivers" ? row.driver_id : row.team_id;
    const item = formById.get(id) || { color: row.primary_color, points: [] };
    item.points.push(mode === "drivers" ? row.finish_position : row.points);
    item.color = item.color || row.primary_color;
    formById.set(id, item);
  });
  const standings = mode === "drivers" ? d : t;
  const filtered = standings
    .filter((row) => {
      const label = mode === "drivers"
        ? `${row.first_name} ${row.last_name} ${row.driver_code || ""}`
        : row.team_name;
      return !query || label.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (sort === "points") return Number(b.points) - Number(a.points);
      if (sort === "gap") return (Number(a.points) - Number(standings[0]?.points || 0)) -
        (Number(b.points) - Number(standings[0]?.points || 0));
      if (sort === "wins") return Number(b.race_wins) - Number(a.race_wins);
      return Number(a.championship_position) - Number(b.championship_position);
    });
  const leaderPoints = Number(standings[0]?.points || 0);
  const rowMarkup = filtered.map((row) => {
    const id = mode === "drivers" ? row.driver_id : row.team_id;
    const item = formById.get(id) || { color: colors.get(row.team_name), points: [] };
    const name = mode === "drivers"
      ? `<a href="#drivers?id=${row.driver_id}" class="profile-link" data-driver-id="${row.driver_id}">${row.first_name} ${row.last_name}</a>`
      : `<a href="#teams?id=${row.team_id}" class="profile-link" data-team-id="${row.team_id}">${row.team_name}</a>`;
    const subtitle = mode === "drivers"
      ? (row.team_id
          ? `<a href="#teams?id=${row.team_id}" class="profile-link" data-team-id="${row.team_id}">${row.team_name}</a>`
          : (row.team_name || "Team unavailable"))
      : `${row.race_wins} wins · ${row.podiums} podiums`;
    const gap = Math.max(0, leaderPoints - Number(row.points || 0));
    return `<tr class="${Number(row.championship_position) <= 3 ? "podium-row" : ""}">
      <td><span class="standings-position">${row.championship_position}</span></td>
      <td><div class="standing-name"><span class="team-stripe" style="background:${item.color || "var(--red)"}"></span><strong>${name}</strong><small>${subtitle}</small></div></td>
      ${mode === "drivers" ? `<td>${row.driver_code || "—"}</td>` : ""}
      <td class="points-cell">${row.points}<small>${gap ? `−${gap}` : "LEADER"}</small></td>
      <td>${row.race_wins}</td>
      ${mode === "drivers" ? `<td>${row.sprint_wins}</td>` : ""}
      <td>${row.podiums}</td>
      ${mode === "drivers" ? `<td>${row.avg_finish ?? "—"}</td>` : `<td>${sparkline(item.points, item.color)}</td>`}
      ${mode === "drivers" ? `<td>${sparkline(item.points, item.color)}</td>` : ""}
    </tr>`;
  }).join("");
  el(`
    <div class="standings-intro"><div><span class="eyebrow">Season ${y}</span><h2>Championship standings</h2><p class="muted">Verified Grand Prix and sprint points. Form shows the latest five completed rounds.</p></div>
      <div class="segmented" role="tablist"><button class="${mode === "drivers" ? "active" : ""}" data-standing-mode="drivers">Drivers</button><button class="${mode === "teams" ? "active" : ""}" data-standing-mode="teams">Constructors</button></div>
    </div>
    <div class="toolbar standings-toolbar">
      <label class="search-control"><span class="sr-only">Search standings</span><input id="standingsSearch" placeholder="Search ${mode === "drivers" ? "drivers" : "teams"}" value="${query}" /></label>
      <label class="sort-control">Sort <select id="standingsSort">
        <option value="position" ${sort === "position" ? "selected" : ""}>Championship position</option>
        <option value="points" ${sort === "points" ? "selected" : ""}>Points</option>
        <option value="gap" ${sort === "gap" ? "selected" : ""}>Points gap</option>
        <option value="wins" ${sort === "wins" ? "selected" : ""}>Race wins</option>
      </select></label>
      <span class="muted">${filtered.length} of ${standings.length} classified</span>
    </div>
    <div class="card standings-card" style="overflow:auto"><table class="standings-table"><thead><tr>
      <th>Pos</th><th>${mode === "drivers" ? "Driver" : "Constructor"}</th>${mode === "drivers" ? "<th>Code</th>" : ""}
      <th>Points / gap</th><th>Wins</th>${mode === "drivers" ? "<th>Sprint wins</th>" : ""}<th>Podiums</th>
      ${mode === "drivers" ? "<th>Avg finish</th><th>Form</th>" : "<th>Recent points</th>"}
    </tr></thead><tbody>${rowMarkup || `<tr><td colspan="9"><div class="empty" style="padding:32px"><h4>No results entered yet for ${y}</h4><p class="muted">Standings will automatically calculate once race and sprint results are saved and verified.</p>${y === 2026 ? '<button class="btn primary btn-sm" data-view="season-2026" style="margin-top:10px">Open 2026 Season Management →</button>' : ''}</div></td></tr>`}</tbody></table></div>
  `);
  viewEl.querySelectorAll("[data-standing-mode]").forEach((button) => {
    button.onclick = () => { window._standingsMode = button.dataset.standingMode; window._standingsQuery = ""; render(); };
  });
  document.getElementById("standingsSearch").oninput = (event) => {
    window._standingsQuery = event.target.value;
    renderStandings();
  };
  document.getElementById("standingsSort").onchange = (event) => {
    window._standingsSort = event.target.value;
    renderStandings();
  };
}

function sparkline(values, color) {
  if (!values.length) return `<span class="sparkline muted">—</span>`;
  const width = 76, height = 24, pad = 3;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = pad + index * ((width - pad * 2) / Math.max(1, values.length - 1));
    const y = height - pad - (Number(value) / max) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recent form trend"><polyline points="${points}" fill="none" stroke="${color || "var(--red)"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function raceSelect(races, selectedId) {
  return `<select id="racePick">${races.map((r) =>
    `<option value="${r.race_id}" ${String(r.race_id) === String(selectedId) ? "selected" : ""}>R${r.round_number} ${r.race_name}</option>`
  ).join("")}</select>`;
}

async function renderCalendar() {
  if (state.selectedRace) {
    return await renderRaceDetail(state.selectedRace);
  }
  const y = state.season;
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${y} Championship</span>
        <h2>Calendar &amp; Results</h2>
        <p class="muted">Official Grands Prix, circuit outlines, race winners and pole positions.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === y ? 'active' : ''}" data-cal-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
      </div>
    </div>
    <div class="race-cards-grid" id="raceCardsContainer">
      ${Array.from({ length: 6 }).map(() => `<div class="skeleton-card" style="height:280px"></div>`).join("")}
    </div>
  `);

  viewEl.querySelectorAll("[data-cal-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.calSeason);
      state.selectedRace = null;
      syncSeasonTabs();
      renderCalendar();
    };
  });

  try {
    let raceCards = [];
    try {
      raceCards = await api.get(`/api/seasons/${y}/race-cards`);
    } catch {
      raceCards = await api.get(`/api/seasons/${y}/races`);
    }
    state.races = raceCards;
    const container = document.getElementById("raceCardsContainer");
    if (!container) return;

    if (!raceCards.length) {
      container.innerHTML = y === 2026
        ? `<div class="empty full" style="padding:40px; text-align:center;"><h3>No races scheduled yet for 2026</h3><p class="muted">The 2026 season is configured for manual data entry. Schedule rounds and enter official results in the management workspace.</p><button class="btn primary" data-view="season-2026" style="margin-top:12px">Create 2026 Race →</button></div>`
        : `<div class="banner">No races recorded for ${y}. Run the data import pipeline.</div>`;
      return;
    }

    const cardsHtml = raceCards.map((r) => {
      const dateFormatted = r.race_date ? new Date(r.race_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "TBD";
      const winner = r.winner_name ? `${r.winner_name}` : "Results pending";
      const winnerTeam = r.winner_team ? ` (${r.winner_team})` : "";
      const pole = r.pole_name ? `${r.pole_name}` : "—";
      const isSprint = r.has_sprint === "Y";

      return `
        <div class="race-card" data-race-id="${r.race_id}">
          <div>
            <div class="race-card-header">
              <span class="round-tag">Round ${String(r.round_number).padStart(2, "0")}</span>
              ${isSprint ? `<span class="sprint-tag" style="background:rgba(178,88,255,0.22);color:#d08aff;border:1px solid rgba(178,88,255,0.45);padding:2px 8px;border-radius:4px;font-size:0.68rem;font-weight:700">⚡ Sprint Weekend</span>` : ""}
            </div>
            <h3 class="race-card-title">${r.race_name}</h3>
            <div class="race-card-circuit">${r.circuit_name || "Circuit"} · ${r.locality || r.country_name || ""}</div>
            <div class="race-card-track">
              <img src="/assets/circuits/${r.circuit_ref || "generic"}.svg" onerror="this.src='/assets/circuits/generic.svg'" alt="${r.circuit_name || 'Circuit'} layout" loading="lazy" />
            </div>
          </div>
          <div>
            <div class="race-card-stats">
              <div>
                <div class="race-card-stat-label">Date</div>
                <div class="race-card-stat-val">${dateFormatted}</div>
              </div>
              <div>
                <div class="race-card-stat-label">Pole Position</div>
                <div class="race-card-stat-val" title="${pole}">${pole}</div>
              </div>
              <div style="grid-column: 1 / -1">
                <div class="race-card-stat-label">Winner</div>
                <div class="race-card-stat-val" style="color:var(--gold)" title="${winner}${winnerTeam}">
                  ${winner}${winnerTeam}
                </div>
              </div>
            </div>
            <div class="race-card-action">View race analysis →</div>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = cardsHtml;
    container.querySelectorAll(".race-card").forEach((card) => {
      card.onclick = () => {
        state.selectedRace = Number(card.dataset.raceId);
        render();
      };
    });
  } catch (err) {
    const container = document.getElementById("raceCardsContainer");
    if (container) container.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

async function renderRaceDetail(raceId) {
  el(`<div class="loading">Loading race analysis…</div>`);

  try {
    const session = window._session || "RACE";
    const [raceInfo, gridFinish, pitAnalysis, races] = await Promise.all([
      api.get(`/api/races/${raceId}`),
      api.get(`/api/races/${raceId}/grid-finish`),
      api.get(`/api/races/${raceId}/pit-analysis`),
      api.get(`/api/seasons/${state.season}/races`),
    ]);

    state.races = races;
    const isSprint = session === "SPRINT";
    let results = gridFinish;
    if (isSprint) {
      results = await api.get(`/api/races/${raceId}/results?session=SPRINT`);
    }

    const p1 = results.find((r) => Number(r.finish_position) === 1);
    const p2 = results.find((r) => Number(r.finish_position) === 2);
    const p3 = results.find((r) => Number(r.finish_position) === 3);

    const totalStops = pitAnalysis.reduce((acc, row) => acc + (row.stop_count || row.number_of_stops || 0), 0);
    const fastestStop = pitAnalysis.length ? pitAnalysis.reduce((min, r) => (r.fastest_stop_ms && r.fastest_stop_ms < (min.fastest_stop_ms || 999999)) ? r : min, pitAnalysis[0]) : null;
    const avgDurationMs = pitAnalysis.length ? Math.round(pitAnalysis.reduce((sum, r) => sum + (r.avg_stop_ms || 0), 0) / pitAnalysis.length) : null;

    const dateFormatted = raceInfo.race_date ? new Date(raceInfo.race_date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "Date unavailable";

    el(`
      <div class="race-detail-top">
        <button class="back-btn" id="backToCalendar">← Back to Season Calendar</button>
        <div class="toolbar" style="margin-bottom:0">
          <select id="racePick">
            ${races.map((r) => `<option value="${r.race_id}" ${Number(r.race_id) === Number(raceId) ? "selected" : ""}>Round ${r.round_number}: ${r.race_name}</option>`).join("")}
          </select>
          <select id="sessionPick">
            <option value="RACE" ${session === "RACE" ? "selected" : ""}>Grand Prix</option>
            ${raceInfo.has_sprint === "Y" ? `<option value="SPRINT" ${session === "SPRINT" ? "selected" : ""}>Sprint</option>` : ""}
          </select>
        </div>
      </div>

      <!-- Race Hero Card with Decorative Circuit Outline -->
      <section class="card race-hero-card">
        <div class="race-hero-info">
          <span class="eyebrow">Round ${String(raceInfo.round_number).padStart(2, "0")} · Season ${raceInfo.season_year}</span>
          <h2>${raceInfo.race_name}</h2>
          <div class="race-hero-meta">
            <strong>${raceInfo.circuit_name}</strong> · ${raceInfo.locality || ""}, ${raceInfo.country_name || ""} · ${dateFormatted}
          </div>
        </div>
        <div class="race-hero-track" title="${raceInfo.circuit_name} layout">
          <img src="/assets/circuits/${raceInfo.circuit_ref || "generic"}.svg" onerror="this.src='/assets/circuits/generic.svg'" alt="${raceInfo.circuit_name} outline" />
        </div>
      </section>

      <!-- Podium Block -->
      <section class="podium-section">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Classification</span>
            <h3>Podium Finishers</h3>
          </div>
        </div>
        <div class="podium-grid">
          <!-- P2 -->
          <div class="podium-card p2">
            <div class="podium-step-badge">2</div>
            <span class="initial-badge" style="border-color:${p2?.primary_color || 'var(--line)'}">${p2 ? (((p2.first_name || '')[0] || '') + ((p2.last_name || '')[0] || '')) : '—'}</span>
            <div class="podium-driver-name">${p2 ? `<a href="#drivers?id=${p2.driver_id}" class="profile-link" data-driver-id="${p2.driver_id}">${p2.first_name || ''} ${p2.last_name || ''}</a>` : 'Unclassified'}</div>
            <div class="podium-team-name">${p2?.team_name ? `<a href="#teams?id=${p2.team_id}" class="profile-link" data-team-id="${p2.team_id}">${p2.team_name}</a>` : '—'}</div>
            <div class="podium-meta">
              <span>${p2?.time_text || p2?.status || ''}</span>
              <b>${p2 ? `+${p2.points} pts` : ''}</b>
            </div>
          </div>
          <!-- P1 -->
          <div class="podium-card p1">
            <div class="podium-step-badge">1</div>
            <span class="initial-badge" style="border-color:var(--gold)">${p1 ? (((p1.first_name || '')[0] || '') + ((p1.last_name || '')[0] || '')) : '—'}</span>
            <div class="podium-driver-name" style="font-size:1.15rem">${p1 ? `<a href="#drivers?id=${p1.driver_id}" class="profile-link" data-driver-id="${p1.driver_id}">${p1.first_name || ''} ${p1.last_name || ''}</a>` : 'Unclassified'}</div>
            <div class="podium-team-name" style="color:var(--gold)">${p1?.team_name ? `<a href="#teams?id=${p1.team_id}" class="profile-link" data-team-id="${p1.team_id}">${p1.team_name}</a>` : '—'}</div>
            <div class="podium-meta">
              <span>${p1?.time_text || p1?.status || ''}</span>
              <b style="color:var(--gold)">${p1 ? `+${p1.points} pts` : ''}</b>
            </div>
          </div>
          <!-- P3 -->
          <div class="podium-card p3">
            <div class="podium-step-badge">3</div>
            <span class="initial-badge" style="border-color:${p3?.primary_color || 'var(--line)'}">${p3 ? (((p3.first_name || '')[0] || '') + ((p3.last_name || '')[0] || '')) : '—'}</span>
            <div class="podium-driver-name">${p3 ? `<a href="#drivers?id=${p3.driver_id}" class="profile-link" data-driver-id="${p3.driver_id}">${p3.first_name || ''} ${p3.last_name || ''}</a>` : 'Unclassified'}</div>
            <div class="podium-team-name">${p3?.team_name ? `<a href="#teams?id=${p3.team_id}" class="profile-link" data-team-id="${p3.team_id}">${p3.team_name}</a>` : '—'}</div>
            <div class="podium-meta">
              <span>${p3?.time_text || p3?.status || ''}</span>
              <b>${p3 ? `+${p3.points} pts` : ''}</b>
            </div>
          </div>
        </div>
      </section>

      <!-- Race Order & Grid vs Finish Chart -->
      <div class="dashboard-grid dashboard-grid-bottom" style="margin-top:20px">
        <!-- Full Race Order Table -->
        <div class="card dashboard-panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">${session === "RACE" ? "Grand Prix" : "Sprint"} Classification</span>
              <h3>Full Race Order</h3>
            </div>
            <span class="muted">${results.length} Drivers</span>
          </div>
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Grid</th>
                  <th title="Grid-to-finish position difference">Grid +/-</th>
                  <th>Time / Status</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                ${results.map((r) => {
                  const pos = r.finish_position ?? r.position_text ?? "—";
                  const isPodium = Number(r.finish_position) <= 3;
                  const gained = r.positions_gained != null ? Number(r.positions_gained) : null;
                  const gainClass = gained > 0 ? "gained" : gained < 0 ? "lost" : "neutral";
                  const gainSign = gained > 0 ? `+${gained}` : gained < 0 ? `${gained}` : "0";
                  const isFL = Number(r.fastest_lap_rank) === 1;
                  return `
                    <tr class="${isPodium ? "podium-row" : ""}">
                      <td><span class="standings-position">${pos}</span></td>
                      <td>
                        <div class="standing-name">
                          <span class="team-stripe" style="background:${r.primary_color || 'var(--red)'}"></span>
                          <strong><a href="#drivers?id=${r.driver_id}" class="profile-link" data-driver-id="${r.driver_id}">${r.first_name} ${r.last_name}</a> ${isFL ? '<small style="color:#b258ff;font-weight:700">FL</small>' : ''}</strong>
                          <small>${r.team_name ? `<a href="#teams?id=${r.team_id}" class="profile-link" data-team-id="${r.team_id}">${r.team_name}</a>` : '—'}</small>
                        </div>
                      </td>
                      <td style="font-variant-numeric:tabular-nums">${r.grid_position != null && r.grid_position > 0 ? `P${r.grid_position}` : (r.grid_position === 0 ? 'Pit' : '—')}</td>
                      <td>
                        ${gained != null ? `<span class="gain-pill ${gainClass}">${gainSign}</span>` : '<span class="gain-pill neutral">—</span>'}
                      </td>
                      <td>${r.time_text || r.status || r.classification_status || '—'}</td>
                      <td class="points-cell">${r.points}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Grid vs Finish Delta Chart -->
        <div class="card dashboard-panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">Delta Analysis</span>
              <h3>Grid vs Finish</h3>
            </div>
          </div>
          <div class="grid-finish-chart">
            ${renderGridFinishChart(results)}
          </div>
        </div>
      </div>

      <!-- Pit Stop Analysis -->
      <section class="card dashboard-panel" style="margin-top:20px">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Strategy &amp; Pit Lane</span>
            <h3>Pit Stop Analysis</h3>
          </div>
          <span class="muted">${totalStops} Total Stops</span>
        </div>
        ${pitAnalysis.length ? `
          <div class="pit-summary-cards">
            <div class="card stat-card">
              <h3>Total pit stops</h3>
              <div class="value">${totalStops}</div>
              <span>Recorded in Grand Prix</span>
            </div>
            <div class="card stat-card pit-card-highlight">
              <h3>Fastest stop <span class="pit-fastest-badge">RACE BEST</span></h3>
              <div class="value" style="color:var(--red-bright)">${fastestStop ? `${fastestStop.fastest_duration}s` : '—'}</div>
              <span>${fastestStop ? `${fastestStop.driver_name} (${fastestStop.team_name || 'Team'})` : 'None'}</span>
            </div>
            <div class="card stat-card">
              <h3>Average stop duration</h3>
              <div class="value">${avgDurationMs ? `${(avgDurationMs / 1000).toFixed(3)}s` : '—'}</div>
              <span>Across all completed stops</span>
            </div>
          </div>
          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Stops</th>
                  <th>Fastest Stop</th>
                  <th>Slowest Stop</th>
                  <th>Average Duration</th>
                </tr>
              </thead>
              <tbody>
                ${pitAnalysis.map((p) => {
                  const isFastestInRace = fastestStop && p.fastest_stop_ms === fastestStop.fastest_stop_ms;
                  return `
                    <tr>
                      <td><strong>${p.driver_name}</strong></td>
                      <td>${p.team_name || '—'}</td>
                      <td style="font-variant-numeric:tabular-nums">${p.stop_count || p.number_of_stops}</td>
                      <td style="font-variant-numeric:tabular-nums">
                        ${p.fastest_duration}s
                        ${isFastestInRace ? '<span class="pit-fastest-badge">BEST</span>' : ''}
                      </td>
                      <td style="font-variant-numeric:tabular-nums">${p.slowest_duration}s</td>
                      <td style="font-variant-numeric:tabular-nums">${p.avg_duration ? `${p.avg_duration}s` : '—'}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty">No pit stop data recorded for this race.</div>
        `}
      </section>
    `);

    document.getElementById("backToCalendar").onclick = () => {
      state.selectedRace = null;
      render();
    };
    document.getElementById("racePick").onchange = (e) => {
      state.selectedRace = Number(e.target.value);
      render();
    };
    const sessionPick = document.getElementById("sessionPick");
    if (sessionPick) {
      sessionPick.onchange = (e) => {
        window._session = e.target.value;
        render();
      };
    }
  } catch (err) {
    el(`
      <button class="back-btn" id="backToCalendar" style="margin-bottom:14px">← Back to Season Calendar</button>
      <div class="banner">${err.message}</div>
    `);
    const btn = document.getElementById("backToCalendar");
    if (btn) btn.onclick = () => { state.selectedRace = null; render(); };
  }
}

function renderGridFinishChart(results) {
  if (!results || !results.length) return '<div class="empty">No delta data.</div>';
  const classified = results.filter((r) => r.grid_position != null && r.finish_position != null);
  if (!classified.length) return '<div class="empty">No classified grid/finish data.</div>';

  return classified.map((r) => {
    const grid = Number(r.grid_position);
    const finish = Number(r.finish_position);
    const gained = r.positions_gained != null ? Number(r.positions_gained) : (grid - finish);
    const gainClass = gained > 0 ? "gained" : gained < 0 ? "lost" : "neutral";
    const gainSign = gained > 0 ? `+${gained}` : gained < 0 ? `${gained}` : "0";

    const gridPct = Math.min(100, Math.max(5, (grid / 20) * 100));
    const finishPct = Math.min(100, Math.max(5, (finish / 20) * 100));
    const startX = Math.min(gridPct, finishPct);
    const widthPct = Math.max(4, Math.abs(gridPct - finishPct));
    const color = gained > 0 ? "var(--ok)" : gained < 0 ? "var(--danger)" : "var(--muted)";

    return `
      <div class="gf-row" title="Grid P${grid} → Finish P${finish}">
        <div class="gf-driver-info">
          <span class="team-stripe" style="background:${r.primary_color || 'var(--red)'};height:16px;width:3px"></span>
          <strong>${r.driver_code || r.last_name}</strong>
          <small class="muted">P${grid} → P${finish}</small>
        </div>
        <div class="gf-bars-container">
          <div class="gf-bar-track" style="left:${startX}%;width:${widthPct}%;background:${color};opacity:0.35"></div>
          <div class="gf-marker" style="left:${gridPct}%;background:var(--muted);width:2px" title="Grid P${grid}"></div>
          <div class="gf-marker" style="left:${finishPct}%;background:${color};width:3px" title="Finish P${finish}"></div>
        </div>
        <div style="text-align:right">
          <span class="gain-pill ${gainClass}">${gainSign}</span>
        </div>
      </div>
    `;
  }).join("");
}


async function renderQualifying() {
  const races = await api.get(`/api/seasons/${state.season}/races`);
  if (!races.length) {
    el(`
      <div class="standings-intro">
        <div>
          <span class="eyebrow">Season ${state.season} Qualifying</span>
          <h2>Starting Grid &amp; Qualifying Times</h2>
          <p class="muted">Official Q1, Q2 and Q3 elimination lap times, pole position delta, and gap-to-pole breakdown.</p>
        </div>
        <div class="filter-chips">
          ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === state.season ? 'active' : ''}" data-q-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
        </div>
      </div>
      <div class="empty full" style="padding:40px; text-align:center;">
        <h3>No qualifying sessions entered yet for ${state.season}</h3>
        <p class="muted">Add races and enter qualifying times in the 2026 Season Management workspace.</p>
        ${state.season === 2026 ? '<button class="btn primary" data-view="season-2026" style="margin-top:10px">Open 2026 Management →</button>' : ''}
      </div>
    `);
    viewEl.querySelectorAll("[data-q-season]").forEach((btn) => {
      btn.onclick = () => {
        state.season = Number(btn.dataset.qSeason);
        state.selectedRace = null;
        syncSeasonTabs();
        renderQualifying();
      };
    });
    return;
  }
  const id = state.selectedRace || races[0].race_id;
  state.selectedRace = Number(id);

  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${state.season} Qualifying</span>
        <h2>Starting Grid &amp; Qualifying Times</h2>
        <p class="muted">Official Q1, Q2 and Q3 elimination lap times, pole position delta, and gap-to-pole breakdown.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === state.season ? 'active' : ''}" data-q-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:20px">
      ${await raceSelect(races, id)}
    </div>
    <div id="qualiContent">
      <div class="skeleton-card" style="height:100px; margin-bottom:16px"></div>
      <div class="skeleton-card" style="height:350px"></div>
    </div>
  `);

  viewEl.querySelectorAll("[data-q-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.qSeason);
      state.selectedRace = null;
      syncSeasonTabs();
      renderQualifying();
    };
  });

  const racePicker = document.getElementById("racePick");
  if (racePicker) {
    racePicker.onchange = (e) => {
      state.selectedRace = Number(e.target.value);
      renderQualifying();
    };
  }

  try {
    const rows = await api.get(`/api/races/${id}/qualifying?session=QUALIFYING`);
    const c = document.getElementById("qualiContent");
    if (!c) return;

    if (!rows.length) {
      c.innerHTML = `<div class="empty full">No qualifying data recorded for this race.</div>`;
      return;
    }

    const poleRow = rows.find((r) => Number(r.position) === 1) || rows[0];
    const poleMs = poleRow ? (poleRow.q3_ms || poleRow.q2_ms || poleRow.q1_ms) : null;
    const poleTime = poleRow ? (poleRow.q3_time || poleRow.q2_time || poleRow.q1_time || "—") : "—";
    const poleColor = poleRow?.primary_color || "var(--gold)";

    // Top 12 gap chart
    const topGapRows = rows.slice(0, 12).filter((r) => (r.q3_ms || r.q2_ms || r.q1_ms));
    const maxGap = Math.max(1200, ...topGapRows.map((r) => ((r.q3_ms || r.q2_ms || r.q1_ms) - (poleMs || 0))));

    const poleBannerHtml = poleRow ? `
      <div class="quali-pole-banner">
        <div style="font-size:1.8rem; line-height:1">🏆</div>
        <div style="flex:1">
          <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); font-weight:700">Pole Position</div>
          <h3 style="margin:2px 0 0 0; font-family:var(--font-heading); color:#fff; font-size:1.3rem">
            <a href="#drivers?id=${poleRow.driver_id}" class="profile-link" data-driver-id="${poleRow.driver_id}">${poleRow.first_name} ${poleRow.last_name}</a>
            <span style="font-size:0.85rem; color:var(--muted); margin-left:6px">${poleRow.driver_code || ""}</span>
          </h3>
          <span class="muted" style="font-size:0.78rem">
            <span class="team-stripe" style="background:${poleColor}"></span>
            ${poleRow.team_name || ""}
          </span>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--font-heading); font-size:1.6rem; font-weight:800; color:var(--gold); letter-spacing:0.02em">${poleTime}</div>
          <span class="muted" style="font-size:0.72rem">Pole Lap Time</span>
        </div>
      </div>
    ` : "";

    const gapChartHtml = topGapRows.length > 1 ? `
      <div class="card dashboard-panel" style="margin-bottom:20px; padding:18px">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">Gap to Pole</span>
            <h3>Top Qualifiers Delta</h3>
          </div>
          <span class="muted">Milliseconds behind P1</span>
        </div>
        <div class="quali-gap-chart">
          ${topGapRows.map((r) => {
            const bestMs = r.q3_ms || r.q2_ms || r.q1_ms;
            const deltaMs = poleMs ? Math.max(0, bestMs - poleMs) : 0;
            const deltaSec = deltaMs === 0 ? "POLE" : `+${(deltaMs / 1000).toFixed(3)}s`;
            const barPct = deltaMs === 0 ? 100 : Math.max(8, Math.round((1 - (deltaMs / maxGap)) * 100));
            const barColor = r.primary_color || "var(--red)";

            return `
              <div class="quali-gap-row">
                <div>
                  <span class="team-stripe" style="background:${barColor}"></span>
                  <strong>${r.driver_code || r.last_name.slice(0, 3).toUpperCase()}</strong>
                  <small class="muted" style="margin-left:4px">P${r.position}</small>
                </div>
                <div class="quali-gap-bar-wrap">
                  <div class="quali-gap-bar" style="width:${barPct}%; background:${barColor}; opacity:${deltaMs === 0 ? '1' : '0.75'}"></div>
                </div>
                <div style="text-align:right; font-weight:700; font-variant-numeric:tabular-nums; color:${deltaMs === 0 ? 'var(--gold)' : 'var(--muted-strong)'}">
                  ${deltaSec}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : "";

    const tableHtml = `
      <div class="card standings-card" style="overflow:auto">
        <table class="standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const isPole = Number(r.position) === 1;
              const bestMs = r.q3_ms || r.q2_ms || r.q1_ms;
              const deltaMs = (poleMs && bestMs) ? Math.max(0, bestMs - poleMs) : null;
              const deltaSec = deltaMs === null ? "—" : (deltaMs === 0 ? "POLE" : `+${(deltaMs / 1000).toFixed(3)}s`);
              const color = r.primary_color || "var(--red)";

              return `
                <tr class="${isPole ? "podium-row" : ""}">
                  <td><span class="standings-position">${isPole ? "🏆 P1" : `P${r.position ?? "—"}`}</span></td>
                  <td>
                    <div class="standing-name">
                      <span class="team-stripe" style="background:${color}"></span>
                      <strong><a href="#drivers?id=${r.driver_id}" class="profile-link" data-driver-id="${r.driver_id}">${r.first_name} ${r.last_name}</a></strong>
                      <small>${r.driver_code ? `(${r.driver_code})` : ""}</small>
                    </div>
                  </td>
                  <td>
                    ${r.team_id ? `<a href="#teams?id=${r.team_id}" class="profile-link" data-team-id="${r.team_id}">${r.team_name}</a>` : (r.team_name || "—")}
                  </td>
                  <td style="font-variant-numeric:tabular-nums">${r.q1_time || "—"}</td>
                  <td style="font-variant-numeric:tabular-nums">${r.q2_time || "—"}</td>
                  <td style="font-variant-numeric:tabular-nums"><strong>${r.q3_time || "—"}</strong></td>
                  <td style="font-variant-numeric:tabular-nums; color:${isPole ? 'var(--gold)' : 'var(--muted-strong)'}">
                    <strong>${deltaSec}</strong>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    c.innerHTML = poleBannerHtml + gapChartHtml + tableHtml;
  } catch (err) {
    const c = document.getElementById("qualiContent");
    if (c) c.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

function renderRingGaugeSvg(label, pct, rate, countText, strokeColor) {
  const r = 38;
  const circumference = 2 * Math.PI * r; // ~238.76
  const validRate = Math.min(1, Math.max(0, rate != null ? rate : (pct / 100) || 0));
  const offset = circumference * (1 - validRate);
  const displayPct = pct != null ? Number(pct).toFixed(1) : (validRate * 100).toFixed(1);
  return `
    <div class="gauge-card">
      <div class="gauge-svg-wrap">
        <svg class="gauge-svg" viewBox="0 0 100 100" width="100" height="100">
          <circle cx="50" cy="50" r="${r}" stroke="rgba(255,255,255,0.08)" stroke-width="8" fill="none" />
          <circle cx="50" cy="50" r="${r}" stroke="${strokeColor}" stroke-width="8" fill="none"
            stroke-dasharray="${circumference.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
            stroke-linecap="round" />
        </svg>
        <div class="gauge-center-text">${displayPct}%</div>
      </div>
      <div class="gauge-title">${label}</div>
      <div class="gauge-subtext">${countText}</div>
    </div>
  `;
}

function renderDriverSparklineSvg(rounds, primaryColor) {
  if (!rounds || !rounds.length) return `<div class="empty">No round points data recorded.</div>`;
  const width = 600;
  const height = 110;
  const padLeft = 32;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 22;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const ptsList = rounds.map((r) => Number(r.points || 0));
  const maxPts = Math.max(26, ...ptsList);

  const coords = rounds.map((r, i) => {
    const x = padLeft + (rounds.length === 1 ? chartW / 2 : (i / (rounds.length - 1)) * chartW);
    const y = padTop + chartH - (Number(r.points || 0) / maxPts) * chartH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, ...r };
  });

  const pointsStr = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPoints = `${coords[0].x},${padTop + chartH} ${pointsStr} ${coords.at(-1).x},${padTop + chartH}`;
  const stroke = primaryColor || "var(--red)";

  return `
    <div class="sparkline-chart-wrap">
      <svg class="profile-sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="driverSparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${stroke}" stop-opacity="0.32" />
            <stop offset="100%" stop-color="${stroke}" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Horizontal grid line at 25 and 0 -->
        <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 4" />
        <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="rgba(255,255,255,0.12)" />
        <text x="4" y="${padTop + 4}" fill="#727885" font-size="9" font-family="sans-serif">${maxPts}</text>
        <text x="4" y="${padTop + chartH}" fill="#727885" font-size="9" font-family="sans-serif">0</text>
        <!-- Fill polygon -->
        <polygon points="${areaPoints}" fill="url(#driverSparkGrad)" />
        <!-- Polyline -->
        <polyline points="${pointsStr}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Interactive circles -->
        ${coords.map((c) => `
          <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${stroke}" stroke="#111418" stroke-width="1.5">
            <title>Round ${c.round_number}: ${c.race_name} &#10;${c.points} pts (Finish: ${c.finish_position ? 'P' + c.finish_position : 'DNF'})</title>
          </circle>
        `).join("")}
      </svg>
    </div>
  `;
}

async function renderDrivers() {
  if (state.selectedDriver) {
    return await renderDriverProfile(state.selectedDriver);
  }
  return await renderDriversGrid();
}

async function renderDriversGrid() {
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${state.season} Grid</span>
        <h2>Drivers</h2>
        <p class="muted">Classified drivers, championship points, race wins and career records. Select a driver to open their full analytical profile.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((y) => `<button class="filter-chip ${y === state.season ? 'active' : ''}" data-driver-season="${y}">${y === 2026 ? '2026 (Manual)' : `Season ${y}`}</button>`).join("")}
      </div>
    </div>
    <div class="toolbar standings-toolbar">
      <label class="search-control">
        <span class="sr-only">Search drivers</span>
        <input id="driverGridSearch" placeholder="Search drivers by name or code..." />
      </label>
      <label class="sort-control">Team 
        <select id="driverTeamFilter">
          <option value="">All Teams</option>
        </select>
      </label>
      <span class="muted" id="driverGridCount">Loading…</span>
    </div>
    <div class="driver-cards-grid" id="driverCardsContainer">
      ${Array.from({ length: 8 }).map(() => `<div class="skeleton-card" style="height:210px"></div>`).join("")}
    </div>
  `);

  viewEl.querySelectorAll("[data-driver-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.driverSeason);
      syncSeasonTabs();
      renderDriversGrid();
    };
  });

  try {
    let drivers = [];
    try {
      drivers = await api.get(`/api/seasons/${state.season}/driver-cards`);
    } catch {
      drivers = await api.get(`/api/drivers?season=${state.season}`);
    }

    const container = document.getElementById("driverCardsContainer");
    if (!container) return;

    if (!drivers.length) {
      container.innerHTML = state.season === 2026
        ? `<div class="empty full" style="padding:40px; text-align:center;"><h3>No drivers classified yet for 2026</h3><p class="muted">Drivers appear once 2026 results or driver contracts are entered.</p><button class="btn primary" data-view="season-2026" style="margin-top:12px">2026 Management Workspace →</button></div>`
        : `<div class="empty full">No drivers found for season ${state.season}.</div>`;
      return;
    }

    const teams = Array.from(new Set(drivers.map((d) => d.team_name).filter(Boolean))).sort();
    const teamSelect = document.getElementById("driverTeamFilter");
    if (teamSelect) {
      teamSelect.innerHTML = `<option value="">All Teams</option>` + teams.map((t) => `<option value="${t}">${t}</option>`).join("");
    }

    function applyFilter() {
      const q = (document.getElementById("driverGridSearch")?.value || "").trim().toLowerCase();
      const selectedTeam = document.getElementById("driverTeamFilter")?.value || "";

      const filtered = drivers.filter((d) => {
        const matchesQ = !q || `${d.first_name} ${d.last_name} ${d.driver_code || ""}`.toLowerCase().includes(q);
        const matchesTeam = !selectedTeam || d.team_name === selectedTeam;
        return matchesQ && matchesTeam;
      });

      const countEl = document.getElementById("driverGridCount");
      if (countEl) countEl.textContent = `${filtered.length} of ${drivers.length} drivers`;

      const gridEl = document.getElementById("driverCardsContainer");
      if (!gridEl) return;

      if (!filtered.length) {
        gridEl.innerHTML = `<div class="empty full">No drivers match your search criteria.</div>`;
        return;
      }

      gridEl.innerHTML = filtered.map((d) => {
        const initials = `${d.first_name?.[0] || ""}${d.last_name?.[0] || ""}`;
        const color = d.primary_color || "var(--red)";
        const pos = d.championship_position;
        const posClass = pos === 1 ? "gold" : "";

        return `
          <div class="driver-card" data-driver-card-id="${d.driver_id}">
            <div class="driver-card-top">
              <div class="driver-card-avatar" style="border:2px solid ${color}; box-shadow:0 0 10px ${color}44;">
                ${initials}
              </div>
              <div class="driver-card-pos ${posClass}">
                ${pos ? `P${pos}` : "—"}
              </div>
            </div>
            <div>
              <h3 class="driver-card-name">${d.first_name} ${d.last_name}</h3>
              <div class="driver-card-team">
                <span class="team-stripe" style="background:${color}"></span>
                ${d.team_name || "Independent"} · ${d.driver_code || `#${d.permanent_number || ""}`}
              </div>
            </div>
            <div class="driver-card-stats">
              <div>
                <div class="driver-stat-val">${d.points ?? 0}</div>
                <div class="driver-stat-lbl">Points</div>
              </div>
              <div>
                <div class="driver-stat-val">${d.wins ?? 0}</div>
                <div class="driver-stat-lbl">Wins</div>
              </div>
              <div>
                <div class="driver-stat-val">${d.podiums ?? 0}</div>
                <div class="driver-stat-lbl">Podiums</div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      gridEl.querySelectorAll("[data-driver-card-id]").forEach((card) => {
        card.onclick = () => {
          state.selectedDriver = Number(card.dataset.driverCardId);
          render();
        };
      });
    }

    applyFilter();

    const searchInput = document.getElementById("driverGridSearch");
    if (searchInput) searchInput.oninput = applyFilter;
    if (teamSelect) teamSelect.onchange = applyFilter;
  } catch (err) {
    const container = document.getElementById("driverCardsContainer");
    if (container) container.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

async function renderDriverProfile(driverId) {
  const driversList = await api.get(`/api/drivers?season=${state.season}`);
  const targetId = driverId || state.selectedDriver || driversList[0]?.driver_id;
  state.selectedDriver = Number(targetId);

  const p = await api.get(`/api/drivers/${state.selectedDriver}/profile`);
  const initials = `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`;
  const color = p.primary_color || "var(--red)";

  const activeGaugeMode = window._driverGaugeMode || "season";
  const sData = p.seasons.find((s) => s.season_year === state.season) || p.seasons[0] || {};
  const gaugeData = activeGaugeMode === "career" ? p.career : sData;

  const sparklineRounds = p.rounds.filter((r) => r.season_year === state.season);
  const displayRounds = sparklineRounds.length ? sparklineRounds : p.rounds;

  el(`
    <div class="back-btn-bar">
      <button class="btn ghost" id="backToDriversGrid">← Back to all drivers</button>
    </div>

    <section class="profile-hero">
      <div class="profile-header-main">
        <div class="profile-identity">
          <div class="profile-avatar-large" style="border-color:${color}; box-shadow:0 0 18px ${color}44;">
            ${initials}
          </div>
          <div class="profile-info">
            <h2>
              ${p.first_name} ${p.last_name}
              <span class="profile-code">${p.driver_code || ""}</span>
              <span class="profile-number">#${p.permanent_number ?? "—"}</span>
            </h2>
            <div class="profile-tags">
              ${p.team_name ? `
                <a href="#teams?id=${p.team_id || ''}" class="profile-link profile-team-badge" data-team-id="${p.team_id || ''}">
                  <span class="team-stripe" style="background:${color}"></span>
                  ${p.team_name}
                </a>` : ""}
              ${p.nationality ? `<span class="profile-pill">${p.nationality}</span>` : ""}
              <span class="profile-pill">${p.career.seasons_count} seasons active</span>
              ${p.wikipedia_url ? `<a href="${p.wikipedia_url}" target="_blank" rel="noreferrer" class="profile-pill profile-link">Wikipedia ↗</a>` : ""}
            </div>
          </div>
        </div>
        <div class="profile-switcher">
          <label for="driverPicker" class="sr-only">Switch driver</label>
          <select id="driverPicker">
            ${driversList.map((d) => `
              <option value="${d.driver_id}" ${d.driver_id === state.selectedDriver ? "selected" : ""}>
                ${d.first_name} ${d.last_name} (${d.driver_code || d.permanent_number || "F1"})
              </option>
            `).join("")}
          </select>
        </div>
      </div>
    </section>

    <!-- Career KPI Cards -->
    <section class="kpis">
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(p.career.points).toLocaleString()}</div>
          <h3>Career points</h3>
          <span>${p.career.seasons_count} completed seasons</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.wins}</div>
          <h3>Grand Prix wins</h3>
          <span>Official victories</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7"/><path d="M14 14.66V17c0 .55.45 1 1 1h2"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.podiums}</div>
          <h3>Podiums</h3>
          <span>Top 3 finishes</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="14" x2="15" y2="11"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.poles}</div>
          <h3>Pole positions</h3>
          <span>GP qualifying poles</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.starts}</div>
          <h3>Race starts</h3>
          <span>${p.career.dnfs} DNFs recorded</span>
        </div>
      </div>
    </section>

    <!-- Ring Gauges & Sparkline Grid -->
    <div class="dashboard-grid dashboard-grid-top" style="margin-top:20px">
      <!-- Rate Metrics Ring Gauges -->
      <div class="card dashboard-panel gauges-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Rate metrics</span>
            <h3>Performance gauges</h3>
          </div>
          <div class="segmented">
            <button class="${activeGaugeMode === "season" ? "active" : ""}" data-gauge-mode="season">${state.season}</button>
            <button class="${activeGaugeMode === "career" ? "active" : ""}" data-gauge-mode="career">Career</button>
          </div>
        </div>
        <div class="gauges-grid">
          ${renderRingGaugeSvg("Win rate", gaugeData.win_pct, gaugeData.win_rate, `${gaugeData.wins || 0} wins / ${gaugeData.starts || 0} starts`, "var(--gold)")}
          ${renderRingGaugeSvg("Podium rate", gaugeData.podium_pct, gaugeData.podium_rate, `${gaugeData.podiums || 0} podiums / ${gaugeData.starts || 0} starts`, "var(--ok)")}
          ${renderRingGaugeSvg("DNF rate", gaugeData.dnf_pct, gaugeData.dnf_rate, `${gaugeData.dnfs || 0} retirements`, "var(--red-bright)")}
        </div>
      </div>

      <!-- Points per Race Sparkline -->
      <div class="card dashboard-panel sparkline-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Season ${state.season} points</span>
            <h3>Round-by-round points</h3>
          </div>
          <span class="muted">${displayRounds.length} rounds</span>
        </div>
        ${renderDriverSparklineSvg(displayRounds, color)}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:0.75rem; color:var(--muted)">
          <span>R1: ${displayRounds[0]?.race_name || "Start"}</span>
          <span>Avg: ${(displayRounds.reduce((acc, r) => acc + (r.points || 0), 0) / Math.max(1, displayRounds.length)).toFixed(1)} pts / race</span>
          <span>R${displayRounds.at(-1)?.round_number || displayRounds.length}: ${displayRounds.at(-1)?.race_name || "Final"}</span>
        </div>
      </div>
    </div>

    <!-- Per-Season Table -->
    <section class="card dashboard-panel" style="margin-top:20px">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Career archive</span>
          <h3>Season-by-season breakdown</h3>
        </div>
        <span class="muted">${p.seasons.length} Seasons</span>
      </div>
      <div style="overflow:auto">
        <table class="standings-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Team</th>
              <th>Starts</th>
              <th>Wins</th>
              <th>Podiums</th>
              <th>Poles</th>
              <th>Points</th>
              <th>DNFs</th>
              <th>Avg Grid</th>
              <th>Avg Finish</th>
              <th title="Net positions gained or lost on track (grid position minus finish position, not championship points)">Grid +/-</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            ${p.seasons.map((s) => `
              <tr class="${Number(s.championship_position) === 1 ? "podium-row" : ""}">
                <td><strong style="color:var(--red-bright)">${s.season_year}</strong></td>
                <td>
                  <a href="#teams?id=${s.team_id || ''}" class="profile-link standing-team" data-team-id="${s.team_id || ''}">
                    <span class="team-stripe" style="background:${s.primary_color || 'var(--red)'}"></span>
                    ${s.team_name || "—"}
                  </a>
                </td>
                <td style="font-variant-numeric:tabular-nums">${s.starts}</td>
                <td style="font-variant-numeric:tabular-nums">${s.wins}</td>
                <td style="font-variant-numeric:tabular-nums">${s.podiums}</td>
                <td style="font-variant-numeric:tabular-nums">${s.poles}</td>
                <td class="points-cell">${s.points}</td>
                <td style="font-variant-numeric:tabular-nums">${s.dnfs}</td>
                <td style="font-variant-numeric:tabular-nums">${s.avg_grid ?? "—"}</td>
                <td style="font-variant-numeric:tabular-nums">${s.avg_finish ?? "—"}</td>
                <td>
                  <span class="gain-pill ${s.positions_gained > 0 ? "gained" : s.positions_gained < 0 ? "lost" : "neutral"}">
                    ${s.positions_gained > 0 ? `+${s.positions_gained}` : `${s.positions_gained ?? 0}`}
                  </span>
                </td>
                <td><span class="standings-position">${s.championship_position ? `P${s.championship_position}` : "—"}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Driver Notes Management -->
    <section class="card" style="margin-top:20px; padding:20px;">
      <div class="panel-heading" style="margin-bottom:12px">
        <div>
          <span class="eyebrow">Database records</span>
          <h3>Driver notes (Oracle)</h3>
        </div>
      </div>
      <div style="display:flex; gap:12px; align-items:center;">
        <input id="driverNotesInput" class="dnote" value="${(p.notes || "").replaceAll('"', '&quot;')}" placeholder="Add scouting or technical notes..." style="flex:1" />
        <button class="btn primary" id="saveDriverNotesBtn">Save notes</button>
      </div>
      <p class="muted" style="margin-top:8px; margin-bottom:0; font-size:0.75rem;">Only notes are editable. Historical race results and points are locked by database triggers.</p>
    </section>
  `);

  const backBtn = document.getElementById("backToDriversGrid");
  if (backBtn) {
    backBtn.onclick = () => {
      state.selectedDriver = null;
      render();
    };
  }

  document.getElementById("driverPicker").onchange = (e) => {
    state.selectedDriver = Number(e.target.value);
    render();
  };

  viewEl.querySelectorAll("[data-gauge-mode]").forEach((btn) => {
    btn.onclick = () => {
      window._driverGaugeMode = btn.dataset.gaugeMode;
      renderDriverProfile(state.selectedDriver);
    };
  });

  const saveBtn = document.getElementById("saveDriverNotesBtn");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const notes = document.getElementById("driverNotesInput").value;
      try {
        await api.send(`/api/drivers/${state.selectedDriver}`, "PUT", { notes });
        toast("Driver notes saved to Oracle.");
      } catch (err) {
        toast(err.message);
      }
    };
  }
}
async function renderTeams() {
  if (state.selectedTeam) {
    return await renderTeamProfile(state.selectedTeam);
  }
  return await renderTeamsGrid();
}

async function renderTeamsGrid() {
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${state.season} Constructors</span>
        <h2>Teams</h2>
        <p class="muted">Formula 1 constructor championship standings, official points, driver pairings and technical colors. Select a team to open their profile.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((y) => `<button class="filter-chip ${y === state.season ? 'active' : ''}" data-team-season="${y}">${y === 2026 ? '2026 (Manual)' : `Season ${y}`}</button>`).join("")}
      </div>
    </div>
    <div class="team-cards-grid" id="teamCardsContainer">
      ${Array.from({ length: 6 }).map(() => `<div class="skeleton-card" style="height:230px"></div>`).join("")}
    </div>
  `);

  viewEl.querySelectorAll("[data-team-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.teamSeason);
      syncSeasonTabs();
      renderTeamsGrid();
    };
  });

  try {
    let teams = [];
    try {
      teams = await api.get(`/api/seasons/${state.season}/team-cards`);
    } catch {
      teams = await api.get(`/api/teams`);
    }

    const container = document.getElementById("teamCardsContainer");
    if (!container) return;

    if (!teams.length) {
      container.innerHTML = state.season === 2026
        ? `<div class="empty full" style="padding:40px; text-align:center;"><h3>No constructor standings classified yet for 2026</h3><p class="muted">Constructor standings calculate automatically from verified race results.</p><button class="btn primary" data-view="season-2026" style="margin-top:12px">2026 Management Workspace →</button></div>`
        : `<div class="empty full">No teams found for season ${state.season}.</div>`;
      return;
    }

    container.innerHTML = teams.map((t) => {
      const color = t.primary_color || "var(--red)";
      const pos = t.championship_position;
      const posClass = pos === 1 ? "gold" : "";
      const drivers = t.drivers || [];

      return `
        <div class="team-card" style="border-top-color:${color}" data-team-card-id="${t.team_id}">
          <div class="team-card-header">
            <div>
              <h3 class="team-card-name">${t.team_name}</h3>
              <span class="muted" style="font-size:0.75rem">${t.nationality || "Formula 1 Team"}</span>
            </div>
            <div class="driver-card-pos ${posClass}">
              ${pos ? `P${pos}` : "—"}
            </div>
          </div>

          <div class="driver-card-stats">
            <div>
              <div class="driver-stat-val">${t.points ?? 0}</div>
              <div class="driver-stat-lbl">Points</div>
            </div>
            <div>
              <div class="driver-stat-val">${t.wins ?? 0}</div>
              <div class="driver-stat-lbl">Wins</div>
            </div>
            <div>
              <div class="driver-stat-val">${t.podiums ?? 0}</div>
              <div class="driver-stat-lbl">Podiums</div>
            </div>
          </div>

          ${drivers.length ? `
            <div class="team-card-drivers">
              ${drivers.map((d) => `
                <div class="team-driver-row">
                  <span><strong>${d.driver_name}</strong> <small class="muted">${d.driver_code ? `(${d.driver_code})` : ""}</small></span>
                  <span class="champ-pts">${d.points} pts ${d.wins > 0 ? `· ${d.wins}w` : ""}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-team-card-id]").forEach((card) => {
      card.onclick = () => {
        state.selectedTeam = Number(card.dataset.teamCardId);
        render();
      };
    });
  } catch (err) {
    const container = document.getElementById("teamCardsContainer");
    if (container) container.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

async function renderTeamProfile(teamId) {
  const teamsList = await api.get("/api/teams");
  const targetId = teamId || state.selectedTeam || teamsList[0]?.team_id;
  state.selectedTeam = Number(targetId);

  const p = await api.get(`/api/teams/${state.selectedTeam}/profile`);
  const color = p.primary_color || "var(--red)";
  const initials = p.constructor_ref ? p.constructor_ref.slice(0, 3).toUpperCase() : p.team_name.slice(0, 3).toUpperCase();

  const activeContribYear = window._teamContribYear || state.season;
  const contribDrivers = p.drivers.filter((d) => d.season_year === activeContribYear);
  const teamSeasonPts = p.seasons.find((s) => s.season_year === activeContribYear)?.points || 0;

  el(`
    <div class="back-btn-bar">
      <button class="btn ghost" id="backToTeamsGrid">← Back to all teams</button>
    </div>

    <section class="profile-hero">
      <div class="profile-header-main">
        <div class="profile-identity">
          <div class="profile-avatar-large" style="border-color:${color}; box-shadow:0 0 18px ${color}44;">
            ${initials}
          </div>
          <div class="profile-info">
            <h2>${p.team_name}</h2>
            <div class="profile-tags">
              <span class="profile-team-badge">
                <span class="team-stripe" style="background:${color}"></span>
                ${color}
              </span>
              ${p.nationality ? `<span class="profile-pill">${p.nationality}</span>` : ""}
              <span class="profile-pill">${p.career.seasons_count} seasons</span>
              ${p.wikipedia_url ? `<a href="${p.wikipedia_url}" target="_blank" rel="noreferrer" class="profile-pill profile-link">Wikipedia ↗</a>` : ""}
            </div>
          </div>
        </div>
        <div class="profile-switcher">
          <label for="teamPicker" class="sr-only">Switch team</label>
          <select id="teamPicker">
            ${teamsList.map((t) => `
              <option value="${t.team_id}" ${t.team_id === state.selectedTeam ? "selected" : ""}>
                ${t.team_name}
              </option>
            `).join("")}
          </select>
        </div>
      </div>
    </section>

    <!-- Career KPI Cards -->
    <section class="kpis">
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${Number(p.career.points).toLocaleString()}</div>
          <h3>Total points</h3>
          <span>Across ${p.career.seasons_count} seasons</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.wins}</div>
          <h3>Grand Prix wins</h3>
          <span>Official victories</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7"/><path d="M14 14.66V17c0 .55.45 1 1 1h2"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
        </div>
        <div class="stat-card-body">
          <div class="value">${p.career.podiums}</div>
          <h3>Podiums</h3>
          <span>Top 3 finishes</span>
        </div>
      </div>
    </section>

    <!-- Driver Lineup & Contribution Grid -->
    <div class="dashboard-grid dashboard-grid-top" style="margin-top:20px">
      <div class="card dashboard-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Season ${activeContribYear}</span>
            <h3>Driver contribution</h3>
          </div>
          <div class="segmented">
            ${[2026, 2025, 2024, 2023].map((y) => `
              <button class="${activeContribYear === y ? "active" : ""}" data-contrib-year="${y}">${y}</button>
            `).join("")}
          </div>
        </div>
        <div style="margin-bottom:12px">
          <span class="muted" style="font-size:0.8rem">Team total in ${activeContribYear}: <strong>${teamSeasonPts} pts</strong></span>
        </div>
        ${contribDrivers.length ? `
          <div class="team-drivers-list">
            ${contribDrivers.map((d) => `
              <div class="driver-contrib-row">
                <div class="contrib-header">
                  <div style="display:flex; align-items:center; gap:8px">
                    <span class="team-stripe" style="background:${color}"></span>
                    <strong><a href="#drivers?id=${d.driver_id}" class="profile-link" data-driver-id="${d.driver_id}">${d.driver_name}</a></strong>
                    <span class="muted">${d.driver_code ? `(${d.driver_code})` : ""}</span>
                  </div>
                  <div style="text-align:right">
                    <strong>${d.points} pts</strong>
                    <span class="muted" style="font-size:0.75rem; margin-left:6px">${d.contribution_pct}%</span>
                  </div>
                </div>
                <div class="contrib-bar-wrap">
                  <div class="contrib-bar" style="width:${Math.min(100, Math.max(5, d.contribution_pct))}%; background:${color}"></div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="empty">No driver results for ${activeContribYear}.</div>`}
      </div>

      <div class="card dashboard-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Constructors archive</span>
            <h3>Season records</h3>
          </div>
          <span class="muted">${p.seasons.length} Seasons</span>
        </div>
        <div style="overflow:auto">
          <table class="standings-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Points</th>
                <th>Wins</th>
                <th>Podiums</th>
                <th>Finish</th>
              </tr>
            </thead>
            <tbody>
              ${p.seasons.map((s) => `
                <tr class="${Number(s.championship_position) === 1 ? "podium-row" : ""}">
                  <td><strong style="color:var(--red-bright)">${s.season_year}</strong></td>
                  <td class="points-cell">${s.points}</td>
                  <td style="font-variant-numeric:tabular-nums">${s.wins}</td>
                  <td style="font-variant-numeric:tabular-nums">${s.podiums}</td>
                  <td><span class="standings-position">${s.championship_position ? `P${s.championship_position}` : "—"}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Team Notes Management -->
    <section class="card" style="margin-top:20px; padding:20px;">
      <div class="panel-heading" style="margin-bottom:12px">
        <div>
          <span class="eyebrow">Database records</span>
          <h3>Technical &amp; Team notes (Oracle)</h3>
        </div>
      </div>
      <div style="display:flex; gap:12px; align-items:center;">
        <input id="teamNotesInput" class="dnote" value="${(p.notes || "").replaceAll('"', '&quot;')}" placeholder="Add engineering or organizational notes..." style="flex:1" />
        <button class="btn primary" id="saveTeamNotesBtn">Save notes</button>
      </div>
      <p class="muted" style="margin-top:8px; margin-bottom:0; font-size:0.75rem;">Only notes are editable. Historical constructor standings are locked by database triggers.</p>
    </section>
  `);

  const backBtn = document.getElementById("backToTeamsGrid");
  if (backBtn) {
    backBtn.onclick = () => {
      state.selectedTeam = null;
      render();
    };
  }

  document.getElementById("teamPicker").onchange = (e) => {
    state.selectedTeam = Number(e.target.value);
    render();
  };

  viewEl.querySelectorAll("[data-contrib-year]").forEach((btn) => {
    btn.onclick = () => {
      window._teamContribYear = Number(btn.dataset.contribYear);
      renderTeamProfile(state.selectedTeam);
    };
  });

  const saveBtn = document.getElementById("saveTeamNotesBtn");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const notes = document.getElementById("teamNotesInput").value;
      try {
        await api.send(`/api/teams/${state.selectedTeam}`, "PUT", { notes });
        toast("Team notes saved to Oracle.");
      } catch (err) {
        toast(err.message);
      }
    };
  }
}
async function renderHeadToHead() {
  const season = state.h2hSeason || state.season;
  const driversList = await api.get(`/api/drivers?season=${season}`);

  if (driversList.length < 2) {
    el(`
      <div class="h2h-toolbar-card">
        <div class="h2h-selectors">
          <label>
            <span class="sr-only">Season</span>
            <select id="h2hSeasonSelect">
              ${[2026, 2025, 2024, 2023].map((y) => `<option value="${y}" ${y === season ? "selected" : ""}>${y === 2026 ? "2026 (Manual)" : `Season ${y}`}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      <div class="empty full" style="padding:40px; text-align:center;">
        <h3>Head-to-head comparison pending for ${season}</h3>
        <p class="muted">Head-to-head comparisons require verified race and qualifying results from at least two drivers.</p>
        ${season === 2026 ? '<button class="btn primary" data-view="season-2026" style="margin-top:12px">2026 Management Workspace →</button>' : ''}
      </div>
    `);
    const sEl = document.getElementById("h2hSeasonSelect");
    if (sEl) {
      sEl.onchange = (e) => {
        state.h2hSeason = Number(e.target.value);
        renderHeadToHead();
      };
    }
    return;
  }

  const norris = driversList.find((d) => d.driver_code === "NOR" || d.driver_id === 182);
  const verstappen = driversList.find((d) => d.driver_code === "VER" || d.driver_id === 192);

  if (!state.h2hDriverA || !driversList.some((d) => d.driver_id === state.h2hDriverA)) {
    state.h2hDriverA = norris ? norris.driver_id : driversList[0].driver_id;
  }
  if (!state.h2hDriverB || !driversList.some((d) => d.driver_id === state.h2hDriverB)) {
    state.h2hDriverB = verstappen ? verstappen.driver_id : (driversList[1]?.driver_id || driversList[0].driver_id);
  }
  if (state.h2hDriverA === state.h2hDriverB) {
    const alt = driversList.find((d) => d.driver_id !== state.h2hDriverA);
    if (alt) state.h2hDriverB = alt.driver_id;
  }

  let h2hData = null;
  let errorMsg = null;
  try {
    h2hData = await api.get(`/api/head-to-head?season=${season}&driver_a=${state.h2hDriverA}&driver_b=${state.h2hDriverB}`);
  } catch (err) {
    errorMsg = err.message;
  }

  const da = h2hData?.driver_a;
  const db = h2hData?.driver_b;
  const colorA = da?.primary_color || "var(--red)";
  const colorB = db?.primary_color || "var(--gold)";

  el(`
    <div class="h2h-toolbar-card">
      <div class="h2h-selectors">
        <label>
          <span class="sr-only">Season</span>
          <select id="h2hSeasonSelect">
            ${[2026, 2025, 2024, 2023].map((y) => `<option value="${y}" ${y === season ? "selected" : ""}>${y === 2026 ? "2026 (Manual)" : `Season ${y}`}</option>`).join("")}
          </select>
        </label>
        <label>
          <span class="sr-only">Driver A</span>
          <select id="h2hDriverASelect">
            ${driversList.map((d) => `<option value="${d.driver_id}" ${d.driver_id === state.h2hDriverA ? "selected" : ""}>${d.first_name} ${d.last_name} (${d.driver_code})</option>`).join("")}
          </select>
        </label>
        <button class="btn ghost" id="h2hSwapBtn" title="Swap drivers">⇄ Swap</button>
        <label>
          <span class="sr-only">Driver B</span>
          <select id="h2hDriverBSelect">
            ${driversList.map((d) => `<option value="${d.driver_id}" ${d.driver_id === state.h2hDriverB ? "selected" : ""}>${d.first_name} ${d.last_name} (${d.driver_code})</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="muted" style="font-size:0.8rem">
        Comparing Formula 1 verified season performance
      </div>
    </div>

    ${errorMsg ? `
      <div class="banner">${errorMsg}</div>
    ` : `
      <!-- Duel Header Banner -->
      <section class="h2h-duel-banner">
        <!-- Driver A Card -->
        <div class="h2h-driver-box side-a" style="border-left-color:${colorA}">
          <div class="profile-avatar-large" style="border-color:${colorA}; box-shadow:0 0 16px ${colorA}44;">
            ${da.name.split(" ").map((p) => p[0]).join("")}
          </div>
          <div>
            <h3 style="margin:0 0 4px; font-family:var(--font-heading); font-size:1.45rem; color:#fff">
              <a href="#drivers?id=${da.driver_id}" class="profile-link" data-driver-id="${da.driver_id}">${da.name}</a>
              <span style="color:var(--muted); font-size:1rem; margin-left:4px">${da.code}</span>
            </h3>
            <div class="profile-tags">
              <span class="profile-team-badge">
                <span class="team-stripe" style="background:${colorA}"></span>
                ${da.team_name || "Team"}
              </span>
              ${da.nationality ? `<span class="profile-pill">${da.nationality}</span>` : ""}
            </div>
          </div>
        </div>

        <!-- VS Badge -->
        <div class="h2h-vs-badge">VS</div>

        <!-- Driver B Card -->
        <div class="h2h-driver-box side-b" style="border-right-color:${colorB}">
          <div class="profile-avatar-large" style="border-color:${colorB}; box-shadow:0 0 16px ${colorB}44;">
            ${db.name.split(" ").map((p) => p[0]).join("")}
          </div>
          <div>
            <h3 style="margin:0 0 4px; font-family:var(--font-heading); font-size:1.45rem; color:#fff">
              <a href="#drivers?id=${db.driver_id}" class="profile-link" data-driver-id="${db.driver_id}">${db.name}</a>
              <span style="color:var(--muted); font-size:1rem; margin-left:4px">${db.code}</span>
            </h3>
            <div class="profile-tags">
              <span class="profile-team-badge">
                <span class="team-stripe" style="background:${colorB}"></span>
                ${db.team_name || "Team"}
              </span>
              ${db.nationality ? `<span class="profile-pill">${db.nationality}</span>` : ""}
            </div>
          </div>
        </div>
      </section>

      <!-- Side-by-Side Comparison Dual Bars -->
      <section class="card dashboard-panel h2h-metric-card">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Season ${season}</span>
            <h3>Head-to-head metrics</h3>
          </div>
          <span class="muted">${h2hData.metrics.length} Direct comparisons</span>
        </div>
        <div class="h2h-metrics-list">
          ${h2hData.metrics.map((m) => {
            const vA = m.driver_a ?? 0;
            const vB = m.driver_b ?? 0;
            let pctA = 50;
            let pctB = 50;
            if (m.key === "avg_finish") {
              const scoreA = Math.max(0.1, 21 - vA);
              const scoreB = Math.max(0.1, 21 - vB);
              const maxS = Math.max(scoreA, scoreB, 1);
              pctA = Math.min(100, Math.round((scoreA / maxS) * 100));
              pctB = Math.min(100, Math.round((scoreB / maxS) * 100));
            } else {
              const maxVal = Math.max(vA, vB, 1);
              pctA = Math.min(100, Math.round((vA / maxVal) * 100));
              pctB = Math.min(100, Math.round((vB / maxVal) * 100));
            }

            return `
              <div class="h2h-metric-row">
                <div class="h2h-metric-header">
                  <span class="h2h-val-left ${m.advantage === "a" ? "advantage" : ""}" style="${m.advantage === "a" ? `color:${colorA}` : ""}">
                    ${m.key === "points" ? Number(vA).toLocaleString() : vA}
                  </span>
                  <span class="h2h-metric-title">${m.label}</span>
                  <span class="h2h-val-right ${m.advantage === "b" ? "advantage" : ""}" style="${m.advantage === "b" ? `color:${colorB}` : ""}">
                    ${m.key === "points" ? Number(vB).toLocaleString() : vB}
                  </span>
                </div>
                <div class="h2h-dual-bars">
                  <div class="h2h-track-left">
                    <div class="h2h-bar-a" style="width:${pctA}%; background:${colorA};"></div>
                  </div>
                  <div class="h2h-track-right">
                    <div class="h2h-bar-b" style="width:${pctB}%; background:${colorB};"></div>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `}
  `);

  document.getElementById("h2hSeasonSelect").onchange = (e) => {
    state.h2hSeason = Number(e.target.value);
    renderHeadToHead();
  };

  document.getElementById("h2hDriverASelect").onchange = (e) => {
    const val = Number(e.target.value);
    if (val === state.h2hDriverB) {
      const alt = driversList.find((d) => d.driver_id !== val);
      if (alt) state.h2hDriverB = alt.driver_id;
    }
    state.h2hDriverA = val;
    renderHeadToHead();
  };

  document.getElementById("h2hDriverBSelect").onchange = (e) => {
    const val = Number(e.target.value);
    if (val === state.h2hDriverA) {
      const alt = driversList.find((d) => d.driver_id !== val);
      if (alt) state.h2hDriverA = alt.driver_id;
    }
    state.h2hDriverB = val;
    renderHeadToHead();
  };

  const swapBtn = document.getElementById("h2hSwapBtn");
  if (swapBtn) {
    swapBtn.onclick = () => {
      const temp = state.h2hDriverA;
      state.h2hDriverA = state.h2hDriverB;
      state.h2hDriverB = temp;
      renderHeadToHead();
    };
  }
}

async function renderPits() {
  const races = await api.get(`/api/seasons/${state.season}/races`);
  if (!races.length) {
    el(`
      <div class="standings-intro">
        <div>
          <span class="eyebrow">Season ${state.season} Pit Strategy</span>
          <h2>Pit Stops &amp; Tyre Changes</h2>
          <p class="muted">Official pit lane transit times, tyre strategy stops and fastest servicing records per Grand Prix.</p>
        </div>
        <div class="filter-chips">
          ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === state.season ? 'active' : ''}" data-pit-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
        </div>
      </div>
      <div class="empty full" style="padding:40px; text-align:center;">
        <h3>No pit stops recorded yet for ${state.season}</h3>
        <p class="muted">Pit stop records will appear once races and session data are added in the 2026 Season Management workspace.</p>
        ${state.season === 2026 ? '<button class="btn primary" data-view="season-2026" style="margin-top:10px">Open 2026 Management →</button>' : ''}
      </div>
    `);
    viewEl.querySelectorAll("[data-pit-season]").forEach((btn) => {
      btn.onclick = () => {
        state.season = Number(btn.dataset.pitSeason);
        state.selectedRace = null;
        syncSeasonTabs();
        renderPits();
      };
    });
    return;
  }
  const id = state.selectedRace || races[0].race_id;
  state.selectedRace = Number(id);

  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${state.season} Pit Strategy</span>
        <h2>Pit Stops &amp; Tyre Changes</h2>
        <p class="muted">Official pit lane transit times, tyre strategy stops and fastest servicing records per Grand Prix.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === state.season ? 'active' : ''}" data-pit-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:20px">
      ${await raceSelect(races, id)}
    </div>
    <div id="pitsContent">
      <div class="pits-kpis">
        <div class="skeleton-card" style="height:90px"></div>
        <div class="skeleton-card" style="height:90px"></div>
        <div class="skeleton-card" style="height:90px"></div>
      </div>
      <div class="skeleton-card" style="height:320px"></div>
    </div>
  `);

  viewEl.querySelectorAll("[data-pit-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.pitSeason);
      state.selectedRace = null;
      syncSeasonTabs();
      renderPits();
    };
  });

  const racePicker = document.getElementById("racePick");
  if (racePicker) {
    racePicker.onchange = (e) => {
      state.selectedRace = Number(e.target.value);
      renderPits();
    };
  }

  try {
    const rows = await api.get(`/api/races/${id}/pit-stops`);
    const c = document.getElementById("pitsContent");
    if (!c) return;

    if (!rows.length) {
      c.innerHTML = `<div class="empty full">No pit stop data recorded for this race (source session data may omit some events).</div>`;
      return;
    }

    const validStops = rows.filter((r) => Number(r.duration_ms || 0) > 0);
    const totalStops = rows.length;
    const fastest = [...validStops].sort((a, b) => Number(a.duration_ms) - Number(b.duration_ms))[0];
    const fastestSec = fastest ? `${(Number(fastest.duration_ms) / 1000).toFixed(3)}s` : (rows[0]?.duration_text || "—");
    const avgMs = validStops.length
      ? Math.round(validStops.reduce((sum, r) => sum + Number(r.duration_ms), 0) / validStops.length)
      : null;
    const avgSec = avgMs ? `${(avgMs / 1000).toFixed(3)}s` : "—";

    // Top 8 fastest stops for chart
    const topStops = [...validStops].sort((a, b) => Number(a.duration_ms) - Number(b.duration_ms)).slice(0, 8);
    const maxDur = Math.max(35000, ...topStops.map((r) => Number(r.duration_ms)));

    const kpiHtml = `
      <div class="pits-kpis">
        <div class="card stat-card">
          <div class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <div class="stat-card-body">
            <div class="value">${totalStops}</div>
            <h3>Total pit stops</h3>
            <span>Across all cars</span>
          </div>
        </div>

        <div class="card stat-card">
          <div class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="stat-card-body">
            <div class="value" style="color:var(--gold)">${fastestSec}</div>
            <h3>Fastest pit lane time</h3>
            <span>${fastest ? `${fastest.first_name} ${fastest.last_name} · Lap ${fastest.lap_number}` : "Single fastest"}</span>
          </div>
        </div>

        <div class="card stat-card">
          <div class="stat-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
          </div>
          <div class="stat-card-body">
            <div class="value">${avgSec}</div>
            <h3>Average pit lane time</h3>
            <span>Pit in to pit out</span>
          </div>
        </div>
      </div>
    `;

    const chartHtml = topStops.length ? `
      <div class="card dashboard-panel" style="margin-bottom:20px; padding:18px">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">Race records</span>
            <h3>Fastest pit stops</h3>
          </div>
          <span class="muted">Ranked by pit lane transit time</span>
        </div>
        <div class="pits-chart">
          ${topStops.map((r, i) => {
            const ms = Number(r.duration_ms);
            const sec = (ms / 1000).toFixed(3);
            const pct = Math.max(15, Math.round((1 - ((ms - Number(topStops[0].duration_ms)) / maxDur)) * 100));
            const color = r.primary_color || (i === 0 ? "var(--gold)" : "var(--red)");

            return `
              <div class="pits-chart-row">
                <div>
                  <span class="team-stripe" style="background:${color}"></span>
                  <strong>${r.driver_code || r.last_name}</strong>
                  <small class="muted" style="margin-left:4px">Lap ${r.lap_number}</small>
                </div>
                <div class="quali-gap-bar-wrap">
                  <div class="quali-gap-bar" style="width:${pct}%; background:${color}; opacity:${i === 0 ? '1' : '0.8'}"></div>
                </div>
                <div style="text-align:right; font-weight:700; font-variant-numeric:tabular-nums; color:${i === 0 ? 'var(--gold)' : 'var(--muted-strong)'}">
                  ${sec}s
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : "";

    const tableHtml = `
      <div class="card standings-card" style="overflow:auto">
        <table class="standings-table">
          <thead>
            <tr>
              <th>Stop #</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Lap</th>
              <th>Pit Lane Time</th>
              <th>Time of Day</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const isFastest = fastest && r.pit_stop_id === fastest.pit_stop_id;
              const color = r.primary_color || "var(--red)";
              const durText = r.duration_text || (r.duration_ms ? `${(r.duration_ms / 1000).toFixed(3)}s` : "—");

              return `
                <tr class="${isFastest ? "podium-row" : ""}">
                  <td><span class="standings-position">${isFastest ? "⚡ " + r.stop_number : r.stop_number}</span></td>
                  <td>
                    <div class="standing-name">
                      <span class="team-stripe" style="background:${color}"></span>
                      <strong><a href="#drivers?id=${r.driver_id}" class="profile-link" data-driver-id="${r.driver_id}">${r.first_name} ${r.last_name}</a></strong>
                      <small>${r.driver_code ? `(${r.driver_code})` : ""}</small>
                    </div>
                  </td>
                  <td>${r.team_name || "—"}</td>
                  <td style="font-variant-numeric:tabular-nums">${r.lap_number}</td>
                  <td class="points-cell" style="color:${isFastest ? 'var(--gold)' : '#fff'}">
                    <strong>${durText}</strong>
                  </td>
                  <td style="font-variant-numeric:tabular-nums; color:var(--muted)">${r.stop_time || "—"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    c.innerHTML = kpiHtml + chartHtml + tableHtml;
  } catch (err) {
    const c = document.getElementById("pitsContent");
    if (c) c.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

async function renderPenalties() {
  const y = state.season;
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Season ${y} Stewards</span>
        <h2>Penalties &amp; Infringements</h2>
        <p class="muted">Recorded steward decisions, time penalties and grid drops. These records are management illustrations and do not alter official championship standings.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === y ? 'active' : ''}" data-pen-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
      </div>
    </div>

    <div class="illustrative-badge">
      ⚠️ Illustrative Management Data · Excluded from Official Championship Standings
    </div>

    <div class="card form-grid" style="margin-bottom:20px; padding:20px">
      <h3 class="full" style="margin:0 0 8px 0; font-size:1.1rem">Log New Penalty</h3>
      <label>
        <span class="sr-only">Race</span>
        <select id="penRace"><option value="">Loading races…</option></select>
      </label>
      <label>
        <span class="sr-only">Driver</span>
        <select id="penDriver"><option value="">Loading drivers…</option></select>
      </label>
      <input id="penType" placeholder="Penalty type (e.g. 5-second time penalty)" />
      <input id="penDesc" placeholder="Infringement description (e.g. Track limits Turn 4)" />
      <button class="btn primary" id="penAdd">Add penalty</button>
    </div>

    <div class="toolbar standings-toolbar">
      <label class="search-control">
        <span class="sr-only">Search penalties</span>
        <input id="penaltySearch" placeholder="Search by driver, type, or description..." />
      </label>
      <span class="muted" id="penaltyCount">Loading…</span>
    </div>

    <div id="penaltiesTableWrap">
      <div class="skeleton-card" style="height:250px"></div>
    </div>
  `);

  viewEl.querySelectorAll("[data-pen-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.penSeason);
      syncSeasonTabs();
      renderPenalties();
    };
  });

  try {
    const [rows, races, drivers] = await Promise.all([
      api.get(`/api/penalties?season=${y}`),
      api.get(`/api/seasons/${y}/races`),
      api.get(`/api/drivers?season=${y}`),
    ]);

    const raceSelectEl = document.getElementById("penRace");
    const driverSelectEl = document.getElementById("penDriver");

    if (raceSelectEl) {
      raceSelectEl.innerHTML = races.map((r) => `<option value="${r.race_id}">R${r.round_number} ${r.race_name}</option>`).join("");
    }
    if (driverSelectEl) {
      driverSelectEl.innerHTML = drivers.map((d) => `<option value="${d.driver_id}">${d.first_name} ${d.last_name} (${d.driver_code || ""})</option>`).join("");
    }

    function renderPenTable() {
      const q = (document.getElementById("penaltySearch")?.value || "").trim().toLowerCase();
      const filtered = rows.filter((r) => {
        const text = `${r.race_name || ""} ${r.first_name || ""} ${r.last_name || ""} ${r.penalty_type || ""} ${r.description || ""}`.toLowerCase();
        return !q || text.includes(q);
      });

      const countEl = document.getElementById("penaltyCount");
      if (countEl) countEl.textContent = `${filtered.length} of ${rows.length} records`;

      const wrap = document.getElementById("penaltiesTableWrap");
      if (!wrap) return;

      if (!filtered.length) {
        wrap.innerHTML = `<div class="empty full">No matching penalties found.</div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="card standings-card" style="overflow:auto">
          <table class="standings-table">
            <thead>
              <tr>
                <th>Race</th>
                <th>Driver</th>
                <th>Penalty</th>
                <th>Description</th>
                <th style="width:100px; text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r) => `
                <tr>
                  <td><strong>${r.race_name || "Grand Prix"}</strong></td>
                  <td>${r.first_name || ""} ${r.last_name || ""}</td>
                  <td><span class="badge" style="background:rgba(225,6,0,0.15);color:var(--red-bright);border:1px solid rgba(225,6,0,0.3)">${r.penalty_type || "Penalty"}</span></td>
                  <td style="color:var(--muted-strong)">${r.description || "—"}</td>
                  <td style="text-align:right">
                    <button class="btn ghost btn-sm" data-del-pen="${r.penalty_id}" style="color:var(--danger)">Delete</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll("[data-del-pen]").forEach((btn) => {
        btn.onclick = async () => {
          const penId = btn.dataset.delPen;
          if (!confirm("Are you sure you want to delete this penalty record?")) return;
          try {
            await api.send(`/api/penalties/${penId}`, "DELETE");
            toast("Penalty record deleted from Oracle.", "ok");
            renderPenalties();
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });
    }

    renderPenTable();

    const searchInput = document.getElementById("penaltySearch");
    if (searchInput) searchInput.oninput = renderPenTable;

    const addBtn = document.getElementById("penAdd");
    if (addBtn) {
      addBtn.onclick = async () => {
        const race_id = Number(document.getElementById("penRace").value);
        const driver_id = Number(document.getElementById("penDriver").value);
        const penalty_type = (document.getElementById("penType").value || "").trim();
        const description = (document.getElementById("penDesc").value || "").trim();

        if (!race_id || !driver_id || !penalty_type || !description) {
          toast("Please fill in race, driver, penalty type, and description.", "error");
          return;
        }

        try {
          await api.send("/api/penalties", "POST", { race_id, driver_id, penalty_type, description });
          toast("Penalty stored in Oracle successfully.", "ok");
          renderPenalties();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    }
  } catch (err) {
    const wrap = document.getElementById("penaltiesTableWrap");
    if (wrap) wrap.innerHTML = `<div class="banner">${err.message}</div>`;
  }
}

async function renderSponsors() {
  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Commercial Management</span>
        <h2>Sponsors &amp; Commercial Partners</h2>
        <p class="muted">Manage corporate partners and team deal allocations. These illustrative records are excluded from official standings.</p>
      </div>
      <div class="filter-chips">
        ${[2026, 2025, 2024, 2023].map((yr) => `<button class="filter-chip ${yr === state.season ? 'active' : ''}" data-sp-season="${yr}">${yr === 2026 ? '2026 (Manual)' : `Season ${yr}`}</button>`).join("")}
      </div>
    </div>

    <div class="illustrative-badge">
      ⚠️ Illustrative Management Data · Excluded from Official Championship Standings
    </div>

    <div class="grid-2" style="margin-bottom:20px">
      <!-- Create Sponsor Card -->
      <div class="card form-grid" style="padding:20px">
        <h3 class="full" style="margin:0 0 6px 0; font-size:1.1rem">Create Commercial Sponsor</h3>
        <input id="spName" class="full" placeholder="Sponsor Company Name *" />
        <input id="spInd" placeholder="Industry Sector (e.g. Technology, Automotive)" />
        <input id="spWeb" placeholder="Website URL" />
        <button class="btn primary" id="spAdd">Create Sponsor</button>
      </div>

      <!-- Assign to Team Card -->
      <div class="card form-grid" style="padding:20px">
        <h3 class="full" style="margin:0 0 6px 0; font-size:1.1rem">Assign Partner to Team (${state.season})</h3>
        <select id="spTeam"><option value="">Loading teams…</option></select>
        <select id="spSel"><option value="">Loading sponsors…</option></select>
        <input id="spNote" class="full" placeholder="Contract / Deal Note (e.g. Primary title partner) *" />
        <button class="btn primary" id="spAssign">Assign Deal</button>
      </div>
    </div>

    <div class="dashboard-grid dashboard-grid-top">
      <!-- Sponsors Directory -->
      <div class="card dashboard-panel">
        <div class="panel-heading" style="margin-bottom:12px">
          <div>
            <span class="eyebrow">Directory</span>
            <h3>Registered Sponsors</h3>
          </div>
          <span class="muted" id="spCount">…</span>
        </div>
        <div id="sponsorsListWrap">
          <div class="skeleton-card" style="height:200px"></div>
        </div>
      </div>

      <!-- Team Deals -->
      <div class="card dashboard-panel">
        <div class="panel-heading" style="margin-bottom:12px">
          <div>
            <span class="eyebrow">Season ${state.season} Allocations</span>
            <h3>Active Team Partnerships</h3>
          </div>
          <span class="muted" id="dealsCount">…</span>
        </div>
        <div id="dealsListWrap">
          <div class="skeleton-card" style="height:200px"></div>
        </div>
      </div>
    </div>
  `);

  viewEl.querySelectorAll("[data-sp-season]").forEach((btn) => {
    btn.onclick = () => {
      state.season = Number(btn.dataset.spSeason);
      syncSeasonTabs();
      renderSponsors();
    };
  });

  try {
    const [sponsors, teams, links] = await Promise.all([
      api.get("/api/sponsors"),
      api.get("/api/teams"),
      api.get(`/api/team-sponsors?season=${state.season}`),
    ]);

    const teamSelect = document.getElementById("spTeam");
    const spSelect = document.getElementById("spSel");
    if (teamSelect) teamSelect.innerHTML = teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`).join("");
    if (spSelect) spSelect.innerHTML = sponsors.map((s) => `<option value="${s.sponsor_id}">${s.sponsor_name}</option>`).join("");

    const spCountEl = document.getElementById("spCount");
    if (spCountEl) spCountEl.textContent = `${sponsors.length} sponsors`;

    const dealsCountEl = document.getElementById("dealsCount");
    if (dealsCountEl) dealsCountEl.textContent = `${links.length} assignments`;

    // Render Sponsors list
    const spWrap = document.getElementById("sponsorsListWrap");
    if (spWrap) {
      if (!sponsors.length) {
        spWrap.innerHTML = `<div class="empty">No sponsors registered yet.</div>`;
      } else {
        spWrap.innerHTML = `
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>Sponsor</th>
                  <th>Industry</th>
                  <th style="width:70px; text-align:right"></th>
                </tr>
              </thead>
              <tbody>
                ${sponsors.map((s) => `
                  <tr>
                    <td><strong>${s.sponsor_name}</strong></td>
                    <td class="muted">${s.industry || "—"}</td>
                    <td style="text-align:right">
                      <button class="btn ghost btn-sm" data-del-sponsor="${s.sponsor_id}" style="color:var(--danger)">Delete</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;

        spWrap.querySelectorAll("[data-del-sponsor]").forEach((btn) => {
          btn.onclick = async () => {
            const sid = btn.dataset.delSponsor;
            if (!confirm("Are you sure you want to delete this sponsor?")) return;
            try {
              await api.send(`/api/sponsors/${sid}`, "DELETE");
              toast("Sponsor deleted from Oracle.", "ok");
              renderSponsors();
            } catch (err) {
              toast(err.message, "error");
            }
          };
        });
      }
    }

    // Render Deals list
    const dealsWrap = document.getElementById("dealsListWrap");
    if (dealsWrap) {
      if (!links.length) {
        dealsWrap.innerHTML = `<div class="empty">No active sponsorships for season ${state.season}.</div>`;
      } else {
        dealsWrap.innerHTML = `
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Sponsor</th>
                  <th>Deal Note</th>
                  <th style="width:70px; text-align:right"></th>
                </tr>
              </thead>
              <tbody>
                ${links.map((l) => `
                  <tr>
                    <td><strong>${l.team_name}</strong></td>
                    <td>${l.sponsor_name}</td>
                    <td class="muted">${l.deal_note || "Partner"}</td>
                    <td style="text-align:right">
                      <button class="btn ghost btn-sm" data-un-deal="${l.team_id}:${l.sponsor_id}:${l.season_year}" style="color:var(--danger)">Remove</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;

        dealsWrap.querySelectorAll("[data-un-deal]").forEach((btn) => {
          btn.onclick = async () => {
            const [t, s, yr] = btn.dataset.unDeal.split(":");
            if (!confirm("Are you sure you want to remove this sponsorship assignment?")) return;
            try {
              await api.send(`/api/team-sponsors/${t}/${s}/${yr}`, "DELETE");
              toast("Sponsorship assignment removed.", "ok");
              renderSponsors();
            } catch (err) {
              toast(err.message, "error");
            }
          };
        });
      }
    }

    // Add Sponsor Handler
    const addBtn = document.getElementById("spAdd");
    if (addBtn) {
      addBtn.onclick = async () => {
        const name = (document.getElementById("spName")?.value || "").trim();
        const industry = (document.getElementById("spInd")?.value || "").trim();
        const website_url = (document.getElementById("spWeb")?.value || "").trim();

        if (!name) {
          toast("Sponsor name is required.", "error");
          return;
        }

        try {
          await api.send("/api/sponsors", "POST", { sponsor_name: name, industry, website_url });
          toast("Sponsor saved to Oracle.", "ok");
          renderSponsors();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    }

    // Assign Sponsor Handler
    const assignBtn = document.getElementById("spAssign");
    if (assignBtn) {
      assignBtn.onclick = async () => {
        const team_id = Number(document.getElementById("spTeam")?.value);
        const sponsor_id = Number(document.getElementById("spSel")?.value);
        const deal_note = (document.getElementById("spNote")?.value || "").trim();

        if (!team_id || !sponsor_id || !deal_note) {
          toast("Please select a team, sponsor, and enter a deal note.", "error");
          return;
        }

        try {
          await api.send("/api/team-sponsors", "POST", { team_id, sponsor_id, season_year: state.season, deal_note });
          toast("Sponsorship assignment saved.", "ok");
          renderSponsors();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    }
  } catch (err) {
    el(`<div class="banner">${err.message}</div>`);
  }
}

async function renderDataManagement() {
  const activeTab = window._dmTab || "drivers";

  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Database Administration</span>
        <h2>Data Management Console</h2>
        <p class="muted">Manage driver scouting notes, team engineering comments, penalties and illustrative commercial partnerships.</p>
      </div>
      <div class="segmented" role="tablist">
        <button class="${activeTab === "drivers" ? "active" : ""}" data-dm-tab="drivers">Driver Notes</button>
        <button class="${activeTab === "teams" ? "active" : ""}" data-dm-tab="teams">Team Notes</button>
        <button class="${activeTab === "penalties" ? "active" : ""}" data-dm-tab="penalties">Penalties</button>
        <button class="${activeTab === "sponsors" ? "active" : ""}" data-dm-tab="sponsors">Sponsors</button>
      </div>
    </div>

    <div class="illustrative-badge" style="margin-bottom:14px">
      🔒 Database Trigger Integrity Active · Verified Race Results &amp; Points are Locked
    </div>

    <div class="banner" style="margin-bottom:20px; border-left:4px solid var(--ok);">
      <strong>Protected Records Notice:</strong> Historical race results, qualifying classifications and championship standings are protected by trigger <code>trg_race_result_protect</code> and cannot be modified. Only technical notes, scouting comments and illustrative administrative records can be edited.
    </div>

    <div id="dmTabContent">
      <div class="skeleton-card" style="height:350px"></div>
    </div>
  `);

  viewEl.querySelectorAll("[data-dm-tab]").forEach((btn) => {
    btn.onclick = () => {
      window._dmTab = btn.dataset.dmTab;
      renderDataManagement();
    };
  });

  const tabContainer = document.getElementById("dmTabContent");
  if (!tabContainer) return;

  if (activeTab === "drivers") {
    try {
      const drivers = await api.get(`/api/drivers?season=${state.season}`);
      tabContainer.innerHTML = `
        <div class="card dashboard-panel" style="padding:20px">
          <div class="panel-heading" style="margin-bottom:14px">
            <div>
              <span class="eyebrow">Season ${state.season}</span>
              <h3>Driver Scouting &amp; Technical Notes</h3>
            </div>
            <span class="muted">${drivers.length} drivers</span>
          </div>
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th style="width:200px">Driver</th>
                  <th style="width:120px">Status</th>
                  <th>Oracle Notes</th>
                  <th style="width:90px; text-align:right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${drivers.map((d) => `
                  <tr>
                    <td>
                      <strong><a href="#drivers?id=${d.driver_id}" class="profile-link" data-driver-id="${d.driver_id}">${d.first_name} ${d.last_name}</a></strong>
                      <small class="muted" style="display:block">${d.driver_code ? `(${d.driver_code})` : ""} #${d.permanent_number || ""}</small>
                    </td>
                    <td><span class="badge" style="background:rgba(255,255,255,0.05);color:var(--ok)">🔒 Points Locked</span></td>
                    <td>
                      <input id="dNote_${d.driver_id}" value="${(d.notes || "").replaceAll('"', '&quot;')}" placeholder="Add scouting observations..." style="width:100%; font-size:0.82rem; padding:6px 10px;" />
                    </td>
                    <td style="text-align:right">
                      <button class="btn primary btn-sm" data-save-dnote="${d.driver_id}">Save</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      tabContainer.querySelectorAll("[data-save-dnote]").forEach((btn) => {
        btn.onclick = async () => {
          const did = btn.dataset.saveDnote;
          const val = document.getElementById(`dNote_${did}`)?.value || "";
          try {
            await api.send(`/api/drivers/${did}`, "PUT", { notes: val });
            toast("Driver note saved to Oracle.", "ok");
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });
    } catch (err) {
      tabContainer.innerHTML = `<div class="banner">${err.message}</div>`;
    }
  } else if (activeTab === "teams") {
    try {
      const teams = await api.get("/api/teams");
      tabContainer.innerHTML = `
        <div class="card dashboard-panel" style="padding:20px">
          <div class="panel-heading" style="margin-bottom:14px">
            <div>
              <span class="eyebrow">Constructors</span>
              <h3>Team Engineering &amp; Factory Notes</h3>
            </div>
            <span class="muted">${teams.length} teams</span>
          </div>
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th style="width:220px">Constructor</th>
                  <th style="width:120px">Status</th>
                  <th>Oracle Notes</th>
                  <th style="width:90px; text-align:right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${teams.map((t) => `
                  <tr>
                    <td>
                      <span class="team-stripe" style="background:${t.primary_color || 'var(--red)'}"></span>
                      <strong><a href="#teams?id=${t.team_id}" class="profile-link" data-team-id="${t.team_id}">${t.team_name}</a></strong>
                    </td>
                    <td><span class="badge" style="background:rgba(255,255,255,0.05);color:var(--ok)">🔒 Standings Locked</span></td>
                    <td>
                      <input id="tNote_${t.team_id}" value="${(t.notes || "").replaceAll('"', '&quot;')}" placeholder="Add engineering remarks..." style="width:100%; font-size:0.82rem; padding:6px 10px;" />
                    </td>
                    <td style="text-align:right">
                      <button class="btn primary btn-sm" data-save-tnote="${t.team_id}">Save</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      tabContainer.querySelectorAll("[data-save-tnote]").forEach((btn) => {
        btn.onclick = async () => {
          const tid = btn.dataset.saveTnote;
          const val = document.getElementById(`tNote_${tid}`)?.value || "";
          try {
            await api.send(`/api/teams/${tid}`, "PUT", { notes: val });
            toast("Team note saved to Oracle.", "ok");
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });
    } catch (err) {
      tabContainer.innerHTML = `<div class="banner">${err.message}</div>`;
    }
  } else if (activeTab === "penalties") {
    tabContainer.innerHTML = `<div id="subPenalties"></div>`;
    renderPenalties();
  } else if (activeTab === "sponsors") {
    tabContainer.innerHTML = `<div id="subSponsors"></div>`;
    renderSponsors();
  }
}

function highlightSql(rawSql) {
  if (!rawSql) return "";
  let s = rawSql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/'([^']*)'/g, '<span class="sql-str">\'$1\'</span>');
  s = s.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="sql-num">$1</span>');
  s = s.replace(/\b(COUNT|SUM|AVG|MIN|MAX|ROUND|RANK|NVL)\b(?=\s*\()/gi, '<span class="sql-fn">$1</span>');
  const kws = [
    "FETCH FIRST", "ROWS ONLY", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
    "CROSS JOIN", "GROUP BY", "ORDER BY", "PARTITION BY", "NULLS LAST", "NULLS FIRST",
    "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "HAVING",
    "OVER", "AS", "DISTINCT", "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END",
    "WITH", "ASC", "DESC"
  ];
  kws.forEach((kw) => {
    const reg = new RegExp(`\\b(${kw.replace(/ /g, "\\s+")})\\b`, "gi");
    s = s.replace(reg, '<span class="sql-kw">$1</span>');
  });
  return s;
}

async function renderAnalytics() {
  const queries = await api.get("/api/analytics/queries");

  el(`
    <div class="analytics-section">
      <div class="analytics-heading">
        <span class="eyebrow">Relational DBMS Intelligence</span>
        <h2>SQL Analytics Gallery &amp; Safe Console</h2>
        <p>Interactive SQL execution across Oracle 26ai Free, live demonstration queries with concept tags, ad-hoc safe sandbox, and database trigger protection audit.</p>
      </div>

      <!-- Safe Query Console -->
      <div class="console-card" id="consoleSection">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Localhost Sandbox · 127.0.0.1</span>
            <h3>Safe Query Console</h3>
          </div>
          <span class="muted" style="font-size:0.75rem">Press Ctrl+Enter to run</span>
        </div>
        <p class="muted" style="font-size:0.83rem; margin:0 0 12px 0;">
          Direct SELECT query executor connected via dedicated viewer connection pool. Enforces single-statement whitelist, keyword filters, 10s timeout, and 200-row cap.
        </p>
        <textarea id="consoleSql" class="console-editor" spellcheck="false" placeholder="Enter SELECT or WITH query here... (e.g. SELECT * FROM circuit WHERE rownum <= 5)">${queries[0]?.sql?.trim() || ""}</textarea>
        
        <div class="console-toolbar">
          <div class="console-toolbar-left">
            <button class="btn primary" id="consoleRun">▶ Run SQL</button>
            <select id="consoleExamples" style="font-size:0.82rem; padding:7px 10px;">
              <option value="">Load an example query…</option>
              ${queries.map((q) => `<option value="${q.id}">${q.title}</option>`).join("")}
            </select>
            <button class="btn ghost" id="consoleClear">Clear</button>
          </div>
          <div class="console-meta" id="consoleMeta">Ready</div>
        </div>

        <div class="banner console-error" id="consoleError" style="display:none"></div>
        <div id="consoleResultsWrap"></div>
      </div>

      <!-- Protected Results Trigger Demo Card -->
      <div class="trigger-card">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Integrity Protection Audit</span>
            <h3>Protected Results Trigger</h3>
          </div>
          <button class="btn secondary" id="triggerDemoBtn">⚡ Test Protected Delete</button>
        </div>
        <div class="trigger-desc">
          Verified historical race results are protected by the database trigger <code>trg_race_result_protect</code>.
          Attempting to DELETE or mutate verified records aborts with <code>ORA-20001</code> and rolls back the transaction, preserving data integrity.
        </div>
        <div id="triggerOutputWrap"></div>
      </div>

      <!-- Query Gallery -->
      <div class="gallery-heading">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">Curated DBMS Demonstrations</span>
            <h3>Analytical Query Gallery</h3>
          </div>
          <span class="muted" style="font-size:0.8rem">${queries.length} curated queries</span>
        </div>
      </div>

      <div class="gallery-grid">
        ${queries.map((q) => `
          <div class="gallery-card" id="card-${q.id}">
            <div class="gallery-card-header">
              <h3>${q.title}</h3>
              <div class="query-tags">
                ${(q.tags || []).map((t) => `<span class="tag-pill">${t}</span>`).join("")}
              </div>
            </div>
            <p class="gallery-explanation">${q.explanation}</p>
            
            <div class="sql-box">
              <div class="sql-box-bar">
                <span>Oracle SQL</span>
                <button class="btn ghost" style="padding:2px 8px; font-size:0.7rem;" data-copy="${q.id}">Copy SQL</button>
              </div>
              <pre><code class="sql">${highlightSql(q.sql.trim())}</code></pre>
            </div>

            <div class="gallery-card-footer">
              <div class="gallery-card-actions">
                <button class="btn primary" style="padding:6px 14px; font-size:0.8rem;" data-run="${q.id}">▶ Run query</button>
                <button class="btn ghost" style="padding:6px 12px; font-size:0.8rem;" data-to-console="${q.id}">Load in console</button>
              </div>
              <span class="query-timing-badge" id="timing-${q.id}"></span>
            </div>

            <div class="gallery-results-wrap" id="results-${q.id}"></div>
          </div>
        `).join("")}
      </div>
    </div>
  `);

  // Setup Console actions
  const consoleSql = document.getElementById("consoleSql");
  const consoleRun = document.getElementById("consoleRun");
  const consoleExamples = document.getElementById("consoleExamples");
  const consoleClear = document.getElementById("consoleClear");
  const consoleError = document.getElementById("consoleError");
  const consoleMeta = document.getElementById("consoleMeta");
  const consoleResultsWrap = document.getElementById("consoleResultsWrap");

  async function executeConsoleQuery() {
    const rawSql = consoleSql.value.trim();
    if (!rawSql) {
      toast("Please enter a SQL query.");
      return;
    }
    consoleError.style.display = "none";
    consoleError.textContent = "";
    consoleMeta.className = "console-meta";
    consoleMeta.innerHTML = `<span class="muted">Executing query…</span>`;
    consoleRun.disabled = true;

    try {
      const data = await api.send("/api/analytics/console", "POST", { sql: rawSql });
      const cappedBadge = data.capped ? `<span class="badge-capped">Capped at 200 rows</span>` : "";
      consoleMeta.className = "console-meta ok";
      consoleMeta.innerHTML = `<span>✓ ${data.row_count} rows in ${data.execution_time_ms} ms</span> ${cappedBadge}`;
      
      if (!data.rows || !data.rows.length) {
        consoleResultsWrap.innerHTML = `<div class="empty">Query executed successfully. 0 rows returned.</div>`;
      } else {
        const headers = data.columns || Object.keys(data.rows[0]);
        consoleResultsWrap.innerHTML = `
          <div style="height:10px"></div>
          ${table(headers, data.rows.map((r) => headers.map((h) => r[h])), "No rows returned.")}
        `;
      }
    } catch (err) {
      consoleMeta.className = "console-meta";
      consoleMeta.innerHTML = `<span style="color:var(--red-bright)">Execution failed</span>`;
      consoleError.style.display = "block";
      consoleError.textContent = err.message || "Query execution failed.";
      consoleResultsWrap.innerHTML = "";
    } finally {
      consoleRun.disabled = false;
    }
  }

  consoleRun.onclick = executeConsoleQuery;
  consoleSql.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executeConsoleQuery();
    }
  });

  consoleExamples.onchange = (e) => {
    const chosen = queries.find((q) => q.id === e.target.value);
    if (chosen) {
      consoleSql.value = chosen.sql.trim();
      consoleSql.focus();
    }
  };

  consoleClear.onclick = () => {
    consoleSql.value = "";
    consoleError.style.display = "none";
    consoleResultsWrap.innerHTML = "";
    consoleMeta.innerHTML = "Ready";
    consoleMeta.className = "console-meta";
  };

  // Setup Trigger Demo
  const triggerDemoBtn = document.getElementById("triggerDemoBtn");
  const triggerOutputWrap = document.getElementById("triggerOutputWrap");

  triggerDemoBtn.onclick = async () => {
    triggerDemoBtn.disabled = true;
    triggerDemoBtn.textContent = "Testing trigger…";
    try {
      const res = await api.send("/api/analytics/trigger-demo", "POST");
      triggerOutputWrap.innerHTML = `
        <div class="trigger-output">
          <div><strong style="color:var(--muted)">Attempted SQL:</strong> <span class="line-sql">${res.attempted_sql}</span></div>
          <div class="line-err"><strong style="color:#ffb0ad">Oracle Exception:</strong> ${res.oracle_error}</div>
          <div class="line-status">
            <span>🛡️ ${res.message}</span>
            <span class="badge-count">Before: ${Number(res.row_count_before).toLocaleString()} == After: ${Number(res.row_count_after).toLocaleString()} rows</span>
            <span style="color:var(--ok); font-size:0.75rem;">(Verified identical)</span>
          </div>
        </div>
      `;
      toast("Trigger test completed: rolled back safely.");
    } catch (err) {
      triggerOutputWrap.innerHTML = `<div class="banner">Trigger test failed: ${err.message}</div>`;
    } finally {
      triggerDemoBtn.disabled = false;
      triggerDemoBtn.textContent = "⚡ Test Protected Delete";
    }
  };

  // Setup Gallery Card Run, Copy, and Load into Console buttons
  queries.forEach((q) => {
    // Copy SQL button
    const copyBtn = viewEl.querySelector(`[data-copy="${q.id}"]`);
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(q.sql.trim());
          toast(`SQL for "${q.title}" copied to clipboard.`);
          copyBtn.textContent = "Copied!";
          setTimeout(() => { copyBtn.textContent = "Copy SQL"; }, 2000);
        } catch {
          toast("Clipboard access failed.");
        }
      };
    }

    // Load in Console button
    const toConsoleBtn = viewEl.querySelector(`[data-to-console="${q.id}"]`);
    if (toConsoleBtn) {
      toConsoleBtn.onclick = () => {
        consoleSql.value = q.sql.trim();
        consoleExamples.value = q.id;
        document.getElementById("consoleSection").scrollIntoView({ behavior: "smooth" });
        consoleSql.focus();
        toast(`Loaded "${q.title}" into console editor.`);
      };
    }

    // Run query button
    const runBtn = viewEl.querySelector(`[data-run="${q.id}"]`);
    const timingBadge = document.getElementById(`timing-${q.id}`);
    const resultsWrap = document.getElementById(`results-${q.id}`);

    if (runBtn) {
      runBtn.onclick = async () => {
        runBtn.disabled = true;
        runBtn.textContent = "Running…";
        resultsWrap.innerHTML = `<div class="loading" style="padding:16px">Executing query…</div>`;
        try {
          const res = await api.send(`/api/analytics/run/${q.id}`, "POST");
          timingBadge.textContent = `✓ ${res.row_count} rows in ${res.execution_time_ms} ms`;
          const headers = res.columns || (res.rows[0] ? Object.keys(res.rows[0]) : []);
          resultsWrap.innerHTML = `
            <div style="height:8px"></div>
            ${table(headers, res.rows.map((r) => headers.map((h) => r[h])), "Query returned no rows.")}
          `;
        } catch (err) {
          resultsWrap.innerHTML = `<div class="banner">Query failed: ${err.message}</div>`;
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = "▶ Run query";
        }
      };
    }
  });

  // Automatically execute the first query as preview
  const firstRunBtn = viewEl.querySelector(`[data-run="${queries[0]?.id}"]`);
  if (firstRunBtn) {
    firstRunBtn.click();
  }
}

function calculateF1Points(sessionType, finishPos, classificationStatus) {
  const isFinished = !classificationStatus || classificationStatus === "Finished" || String(classificationStatus).startsWith("+");
  if (!isFinished || !finishPos || finishPos < 1) return 0;
  const raceScale = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const sprintScale = [8, 7, 6, 5, 4, 3, 2, 1];
  const scale = sessionType === "SPRINT" ? sprintScale : raceScale;
  return scale[finishPos - 1] ?? 0;
}

async function renderSeason2026() {
  window._season2026Tab = window._season2026Tab || "races";
  window._season2026EditingRace = window._season2026EditingRace || null;
  window._season2026EditingResult = window._season2026EditingResult || null;
  window._season2026EditingQuali = window._season2026EditingQuali || null;
  window._season2026ResultSession = window._season2026ResultSession || "RACE";
  window._season2026QualiSession = window._season2026QualiSession || "QUALIFYING";

  let statusData = null;
  try {
    statusData = await api.get("/api/seasons/2026/management-status");
  } catch (err) {
    el(`
      <div class="banner">Unable to load 2026 Season Management: ${err.message}</div>
      <p class="muted">Ensure database migration database/11_season_2026.sql has been executed in Oracle.</p>
    `);
    return;
  }

  let circuits = [], drivers = [], teams = [], countries = [];
  try {
    [circuits, drivers, teams, countries] = await Promise.all([
      api.get("/api/circuits"),
      api.get("/api/drivers"),
      api.get("/api/teams"),
      api.get("/api/countries"),
    ]);
  } catch (err) {
    console.warn("Failed loading entity lookups:", err);
  }

  // If no selected race yet, default to first 2026 race if present
  if (!window._season2026SelectedRace && statusData.races && statusData.races.length > 0) {
    window._season2026SelectedRace = statusData.races[0].race_id;
  }

  const activeTab = window._season2026Tab;

  el(`
    <div class="standings-intro">
      <div>
        <span class="eyebrow">Active Manual Championship Workspace</span>
        <h2>2026 Season Management <span class="badge badge-unverified" style="vertical-align:middle; margin-left:8px;">MANUAL ENTRY MODE</span></h2>
        <p class="muted">Schedule Grand Prix rounds, record official or draft session results, manage qualifying shootouts, and register new drivers and teams. All manual session entries dynamically compute official standings only when verified.</p>
      </div>
    </div>

    <!-- Management KPI Summary Cards -->
    <div class="season-mgmt-kpis">
      <div class="mgmt-kpi">
        <span class="mgmt-kpi-lbl">Races Scheduled</span>
        <div class="mgmt-kpi-val">${statusData.total_races}</div>
        <span class="mgmt-kpi-sub">Round limit: 1 – 30</span>
      </div>
      <div class="mgmt-kpi">
        <span class="mgmt-kpi-lbl">Verified Results</span>
        <div class="mgmt-kpi-val" style="color:var(--ok)">${statusData.verified_results}</div>
        <span class="mgmt-kpi-sub">Counted in official standings</span>
      </div>
      <div class="mgmt-kpi">
        <span class="mgmt-kpi-lbl">Draft / Unverified Results</span>
        <div class="mgmt-kpi-val" style="color:var(--amber, #f59e0b)">${statusData.unverified_results}</div>
        <span class="mgmt-kpi-sub">Excluded from standings</span>
      </div>
      <div class="mgmt-kpi">
        <span class="mgmt-kpi-lbl">Qualifying Sessions</span>
        <div class="mgmt-kpi-val">${statusData.total_qualifying}</div>
        <span class="mgmt-kpi-sub">${statusData.verified_qualifying} verified grid positions</span>
      </div>
      <div class="mgmt-kpi">
        <span class="mgmt-kpi-lbl">Standings Engine</span>
        <div class="mgmt-kpi-val" style="font-size:1.1rem; color:var(--red-bright)">Dynamic Views</div>
        <span class="mgmt-kpi-sub">Oracle v_driver_standings</span>
      </div>
    </div>

    <!-- Sub Navigation Tabs -->
    <div class="mgmt-subnav">
      <button class="${activeTab === 'races' ? 'active' : ''}" data-mgmt-tab="races">🏁 Race Schedule (${statusData.total_races})</button>
      <button class="${activeTab === 'results' ? 'active' : ''}" data-mgmt-tab="results">🏆 Race &amp; Sprint Results (${statusData.total_results})</button>
      <button class="${activeTab === 'qualifying' ? 'active' : ''}" data-mgmt-tab="qualifying">⏱ Qualifying Sessions (${statusData.total_qualifying})</button>
      <button class="${activeTab === 'entities' ? 'active' : ''}" data-mgmt-tab="entities">🏎 Entities &amp; Rosters</button>
    </div>

    <div id="season2026SubContent"></div>
  `);

  viewEl.querySelectorAll("[data-mgmt-tab]").forEach((btn) => {
    btn.onclick = () => {
      window._season2026Tab = btn.dataset.mgmtTab;
      renderSeason2026();
    };
  });

  const subContent = document.getElementById("season2026SubContent");
  if (!subContent) return;

  // TAB 1: RACES
  if (activeTab === "races") {
    const editRace = window._season2026EditingRace;
    const nextRound = statusData.races && statusData.races.length > 0
      ? Math.max(...statusData.races.map((r) => r.round_number || 0)) + 1
      : 1;

    subContent.innerHTML = `
      <div class="mgmt-form-card">
        <div class="mgmt-form-header">
          <h4>${editRace ? `Edit Race: Round ${editRace.round_number} (${editRace.race_name})` : "Schedule New 2026 Championship Round"}</h4>
          ${editRace ? `<button class="btn secondary btn-sm" id="cancelEditRaceBtn">Cancel Editing</button>` : ""}
        </div>
        <form id="raceScheduleForm">
          <div class="form-grid-3">
            <div class="form-group">
              <label for="f_round_number">Round Number (1 – 30)</label>
              <input type="number" id="f_round_number" min="1" max="30" value="${editRace ? editRace.round_number : nextRound}" required />
            </div>
            <div class="form-group">
              <label for="f_race_name">Grand Prix Name</label>
              <input type="text" id="f_race_name" placeholder="e.g. Australian Grand Prix" value="${editRace ? (editRace.race_name || '') : ''}" required />
            </div>
            <div class="form-group">
              <label for="f_circuit_id">Circuit</label>
              <select id="f_circuit_id" required>
                <option value="">Select Circuit...</option>
                ${circuits.map((c) => `
                  <option value="${c.circuit_id}" ${editRace && editRace.circuit_id === c.circuit_id ? "selected" : ""}>
                    ${c.circuit_name} (${c.locality || ''}, ${c.country_name || ''})
                  </option>
                `).join("")}
              </select>
            </div>
          </div>
          <div class="form-grid-3" style="margin-top:12px">
            <div class="form-group">
              <label for="f_race_date">Race Date (YYYY-MM-DD)</label>
              <input type="date" id="f_race_date" value="${editRace && editRace.race_date ? editRace.race_date.split('T')[0] : ''}" />
            </div>
            <div class="form-group">
              <label for="f_race_time_utc">Start Time UTC (HH:MM:SS)</label>
              <input type="text" id="f_race_time_utc" placeholder="e.g. 14:00:00" value="${editRace ? (editRace.race_time_utc || '') : ''}" />
            </div>
            <div class="form-group">
              <label for="f_has_sprint">Race Weekend Format</label>
              <select id="f_has_sprint">
                <option value="N" ${!editRace || editRace.has_sprint !== 'Y' ? "selected" : ""}>Standard Grand Prix (No Sprint)</option>
                <option value="Y" ${editRace && editRace.has_sprint === 'Y' ? "selected" : ""}>Sprint Weekend (Grand Prix + Sprint)</option>
              </select>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn primary">
              ${editRace ? "💾 Update Race" : "➕ Schedule Race"}
            </button>
          </div>
        </form>
      </div>

      <div class="card dashboard-panel" style="padding:20px">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">2026 Calendar</span>
            <h3>Scheduled Championship Races</h3>
          </div>
          <span class="muted">${statusData.total_races} races</span>
        </div>
        ${!statusData.races || !statusData.races.length ? `
          <div class="empty">No 2026 races scheduled yet. Use the form above to add Round 1.</div>
        ` : `
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th style="width:60px">Rnd</th>
                  <th>Grand Prix</th>
                  <th>Circuit &amp; Location</th>
                  <th>Date &amp; Time</th>
                  <th>Format</th>
                  <th>Results</th>
                  <th>Qualifying</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${statusData.races.map((r) => `
                  <tr>
                    <td><strong>R${r.round_number}</strong></td>
                    <td><strong>${r.race_name}</strong></td>
                    <td>
                      <div>${r.circuit_name}</div>
                      <small class="muted">${r.locality || ''}</small>
                    </td>
                    <td>
                      <div>${formatF1Date(r.race_date) || 'TBD'}</div>
                      <small class="muted">${r.race_time_utc || ''}</small>
                    </td>
                    <td>
                      ${r.has_sprint === 'Y' ? '<span class="badge" style="background:rgba(225,6,0,0.2);color:var(--red-bright)">Sprint</span>' : '<span class="muted">Standard</span>'}
                    </td>
                    <td>
                      <div>${r.total_results || 0} results</div>
                      <small class="muted"><span style="color:var(--ok)">${r.verified_results || 0} ver.</span> / <span style="color:var(--amber, #f59e0b)">${r.unverified_results || 0} draft</span></small>
                    </td>
                    <td>
                      <div>${r.total_quali || 0} sessions</div>
                      <small class="muted"><span style="color:var(--ok)">${r.verified_quali || 0} ver.</span></small>
                    </td>
                    <td>
                      <div class="action-btns">
                        ${(r.unverified_results > 0 || (r.total_quali - r.verified_quali) > 0) ? `
                          <button class="btn success btn-sm" data-verify-all="${r.race_id}" title="Verify all results and qualifyings for this race">✔ Verify All</button>
                        ` : `
                          <button class="btn secondary btn-sm" data-unverify-all="${r.race_id}" title="Revert all results for this race to draft">Set Draft</button>
                        `}
                        <button class="btn primary btn-sm" data-goto-results="${r.race_id}">Enter Results</button>
                        <button class="btn secondary btn-sm" data-edit-race="${r.race_id}">Edit</button>
                        <button class="btn danger btn-sm" data-del-race="${r.race_id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    if (editRace) {
      document.getElementById("cancelEditRaceBtn").onclick = () => {
        window._season2026EditingRace = null;
        renderSeason2026();
      };
    }

    document.getElementById("raceScheduleForm").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        season_year: 2026,
        round_number: parseInt(document.getElementById("f_round_number").value, 10),
        race_name: document.getElementById("f_race_name").value.trim(),
        circuit_id: parseInt(document.getElementById("f_circuit_id").value, 10),
        race_date: document.getElementById("f_race_date").value || null,
        race_time_utc: document.getElementById("f_race_time_utc").value.trim() || null,
        has_sprint: document.getElementById("f_has_sprint").value,
      };
      try {
        if (editRace) {
          await api.put(`/api/races/${editRace.race_id}`, payload);
          toast(`Updated Round ${payload.round_number} (${payload.race_name})`);
          window._season2026EditingRace = null;
        } else {
          await api.post("/api/races", payload);
          toast(`Scheduled Round ${payload.round_number}: ${payload.race_name}`);
        }
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    subContent.querySelectorAll("[data-verify-all]").forEach((btn) => {
      btn.onclick = async () => {
        const rid = btn.dataset.verifyAll;
        try {
          const res = await api.post(`/api/races/${rid}/verify`);
          toast(`Verified ${res.verified_results} results & ${res.verified_qualifying} qualifying slots. Official standings updated!`);
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    subContent.querySelectorAll("[data-unverify-all]").forEach((btn) => {
      btn.onclick = async () => {
        const rid = btn.dataset.unverifyAll;
        try {
          const res = await api.post(`/api/races/${rid}/unverify`);
          toast(`Reverted ${res.unverified_results} results to draft. Excluded from official standings.`);
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    subContent.querySelectorAll("[data-goto-results]").forEach((btn) => {
      btn.onclick = () => {
        window._season2026SelectedRace = Number(btn.dataset.gotoResults);
        window._season2026Tab = "results";
        renderSeason2026();
      };
    });

    subContent.querySelectorAll("[data-edit-race]").forEach((btn) => {
      btn.onclick = () => {
        const rid = Number(btn.dataset.editRace);
        window._season2026EditingRace = statusData.races.find((r) => r.race_id === rid);
        renderSeason2026();
      };
    });

    subContent.querySelectorAll("[data-del-race]").forEach((btn) => {
      btn.onclick = async () => {
        const rid = Number(btn.dataset.delRace);
        const target = statusData.races.find((r) => r.race_id === rid);
        const name = target ? `Round ${target.round_number} (${target.race_name})` : "this race";
        if (!window.confirm(`Are you sure you want to delete ${name} and all associated manual results/qualifyings?\n\nThis cannot be undone.`)) {
          return;
        }
        try {
          await api.delete(`/api/races/${rid}`);
          toast(`Deleted ${name}`);
          if (window._season2026SelectedRace === rid) {
            window._season2026SelectedRace = null;
          }
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
  }

  // TAB 2: RACE & SPRINT RESULTS
  else if (activeTab === "results") {
    if (!statusData.races || !statusData.races.length) {
      subContent.innerHTML = `
        <div class="banner">No 2026 races have been scheduled yet.</div>
        <p class="muted">Please schedule at least one race in the <a href="#" id="gotoRacesLink">Race Schedule</a> tab before entering results.</p>
      `;
      document.getElementById("gotoRacesLink").onclick = (e) => {
        e.preventDefault();
        window._season2026Tab = "races";
        renderSeason2026();
      };
      return;
    }

    const curRaceId = window._season2026SelectedRace || statusData.races[0].race_id;
    window._season2026SelectedRace = curRaceId;
    const currentRace = statusData.races.find((r) => r.race_id === curRaceId) || statusData.races[0];
    const sessionType = (window._season2026ResultSession === "SPRINT" && currentRace.has_sprint === "Y") ? "SPRINT" : "RACE";
    window._season2026ResultSession = sessionType;

    let results = [];
    try {
      results = await api.get(`/api/races/${curRaceId}/results?session=${sessionType}`);
    } catch (err) {
      console.warn("Failed loading race results:", err);
    }

    const editRes = window._season2026EditingResult;

    subContent.innerHTML = `
      <div class="session-toggle-bar">
        <div style="display:flex; align-items:center; gap:8px;">
          <label style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--muted)">Race:</label>
          <select id="resRaceSelect" style="padding:6px 10px; font-weight:600">
            ${statusData.races.map((r) => `
              <option value="${r.race_id}" ${r.race_id === curRaceId ? "selected" : ""}>
                R${r.round_number}: ${r.race_name} (${r.circuit_name}) ${r.has_sprint === 'Y' ? '[Sprint Weekend]' : ''}
              </option>
            `).join("")}
          </select>
        </div>
        <div class="season-tabs" style="display:inline-flex;">
          <button class="${sessionType === 'RACE' ? 'active' : ''}" id="btnSessionRace">Grand Prix (RACE)</button>
          <button class="${sessionType === 'SPRINT' ? 'active' : ''}" id="btnSessionSprint" ${currentRace.has_sprint !== 'Y' ? 'disabled title="Sprint not enabled for this race weekend"' : ''}>
            Sprint (SPRINT) ${currentRace.has_sprint !== 'Y' ? '(N/A)' : ''}
          </button>
        </div>
      </div>

      <div class="mgmt-form-card">
        <div class="mgmt-form-header">
          <h4>${editRes ? `Edit Result: ${editRes.first_name} ${editRes.last_name} (${sessionType})` : `Record Driver Result · ${currentRace.race_name} (${sessionType})`}</h4>
          ${editRes ? `<button class="btn secondary btn-sm" id="cancelEditResBtn">Cancel Editing</button>` : ""}
        </div>
        <form id="resultForm">
          <div class="form-grid-4">
            <div class="form-group">
              <label for="rf_driver">Driver</label>
              <select id="rf_driver" ${editRes ? 'disabled' : 'required'}>
                <option value="">Select Driver...</option>
                ${drivers.map((d) => `
                  <option value="${d.driver_id}" ${editRes && editRes.driver_id === d.driver_id ? "selected" : ""}>
                    ${d.first_name} ${d.last_name} ${d.driver_code ? `(${d.driver_code})` : ''} #${d.permanent_number || ''}
                  </option>
                `).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="rf_team">Constructor</label>
              <select id="rf_team" required>
                <option value="">Select Constructor...</option>
                ${teams.map((t) => `
                  <option value="${t.team_id}" ${editRes && editRes.team_id === t.team_id ? "selected" : ""}>
                    ${t.team_name}
                  </option>
                `).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="rf_finish_pos">Finish Position (1 – 30)</label>
              <input type="number" id="rf_finish_pos" min="1" max="30" placeholder="e.g. 1 (Blank if DNF)" value="${editRes && editRes.finish_position ? editRes.finish_position : ''}" />
            </div>
            <div class="form-group">
              <label for="rf_grid_pos">Grid Position (1 – 30)</label>
              <input type="number" id="rf_grid_pos" min="0" max="30" placeholder="e.g. 1" value="${editRes && editRes.grid_position !== null && editRes.grid_position !== undefined ? editRes.grid_position : ''}" />
            </div>
          </div>

          <div class="form-grid-4" style="margin-top:12px">
            <div class="form-group">
              <label for="rf_status">Classification Status</label>
              <select id="rf_status">
                <option value="Finished" ${!editRes || editRes.classification_status === 'Finished' ? "selected" : ""}>Finished</option>
                <option value="+1 Lap" ${editRes && editRes.classification_status === '+1 Lap' ? "selected" : ""}>+1 Lap</option>
                <option value="+2 Laps" ${editRes && editRes.classification_status === '+2 Laps' ? "selected" : ""}>+2 Laps</option>
                <option value="Accident" ${editRes && editRes.classification_status === 'Accident' ? "selected" : ""}>Accident (DNF)</option>
                <option value="Collision" ${editRes && editRes.classification_status === 'Collision' ? "selected" : ""}>Collision (DNF)</option>
                <option value="Engine" ${editRes && editRes.classification_status === 'Engine' ? "selected" : ""}>Engine Failure (DNF)</option>
                <option value="Gearbox" ${editRes && editRes.classification_status === 'Gearbox' ? "selected" : ""}>Gearbox Failure (DNF)</option>
                <option value="Brakes" ${editRes && editRes.classification_status === 'Brakes' ? "selected" : ""}>Brakes (DNF)</option>
                <option value="Suspension" ${editRes && editRes.classification_status === 'Suspension' ? "selected" : ""}>Suspension (DNF)</option>
                <option value="Disqualified" ${editRes && editRes.classification_status === 'Disqualified' ? "selected" : ""}>Disqualified (DSQ)</option>
                <option value="Did not start" ${editRes && editRes.classification_status === 'Did not start' ? "selected" : ""}>Did Not Start (DNS)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="rf_points">Championship Points (Auto / Override)</label>
              <input type="number" id="rf_points" step="0.5" min="0" value="${editRes && editRes.points !== undefined ? editRes.points : '0'}" required />
            </div>
            <div class="form-group">
              <label for="rf_laps">Laps Completed</label>
              <input type="number" id="rf_laps" min="0" placeholder="e.g. 58" value="${editRes && editRes.laps_completed ? editRes.laps_completed : ''}" />
            </div>
            <div class="form-group">
              <label for="rf_time">Time / Gap</label>
              <input type="text" id="rf_time" placeholder="e.g. 1:32:15.892 or +4.321s" value="${editRes ? (editRes.time_text || '') : ''}" />
            </div>
          </div>

          <div class="form-grid-3" style="margin-top:12px; align-items:center">
            <div class="form-group">
              <label for="rf_flap">Fastest Lap Lap #</label>
              <input type="number" id="rf_flap" min="1" placeholder="e.g. 52" value="${editRes && editRes.fastest_lap ? editRes.fastest_lap : ''}" />
            </div>
            <div class="form-group">
              <label for="rf_flap_time">Fastest Lap Time</label>
              <input type="text" id="rf_flap_time" placeholder="e.g. 1:20.123" value="${editRes ? (editRes.fastest_lap_time || '') : ''}" />
            </div>
            <div class="form-group" style="margin-top:16px">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none">
                <input type="checkbox" id="rf_verified" ${editRes && editRes.is_verified === 'Y' ? "checked" : ""} />
                <span><strong>Verified Result</strong> (Immediately updates official standings)</span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn primary">
              ${editRes ? "💾 Update Result" : "➕ Save Driver Result"}
            </button>
          </div>
        </form>
      </div>

      <div class="card dashboard-panel" style="padding:20px">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">${currentRace.race_name}</span>
            <h3>${sessionType === 'RACE' ? 'Grand Prix Race Classification' : 'Sprint Race Classification'}</h3>
          </div>
          <span class="muted">${results.length} classified entries</span>
        </div>
        ${!results || !results.length ? `
          <div class="empty">No ${sessionType} results entered yet for ${currentRace.race_name}.</div>
        ` : `
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th style="width:50px">Pos</th>
                  <th>Driver</th>
                  <th>Constructor</th>
                  <th style="width:60px">Grid</th>
                  <th>Time / Gap</th>
                  <th style="width:70px">Laps</th>
                  <th style="width:70px">Pts</th>
                  <th>Status</th>
                  <th>State</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${results.map((r) => `
                  <tr>
                    <td><strong>${r.finish_position ? r.finish_position : (r.position_text || 'DNF')}</strong></td>
                    <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="initial-badge">${((r.first_name || '')[0] || '') + ((r.last_name || '')[0] || '')}</span>
                        <div>
                          <strong>${r.first_name} ${r.last_name}</strong>
                          ${r.driver_code ? `<small class="muted" style="margin-left:4px">(${r.driver_code})</small>` : ''}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="team-stripe" style="background:${r.primary_color || 'var(--red)'}"></span>
                      ${r.team_name}
                    </td>
                    <td>${r.grid_position ?? '—'}</td>
                    <td>${r.time_text || '—'}</td>
                    <td>${r.laps_completed ?? '—'}</td>
                    <td><strong>${r.points}</strong></td>
                    <td>${r.classification_status || 'Finished'}</td>
                    <td>
                      <span class="badge ${r.is_verified === 'Y' ? 'badge-verified' : 'badge-unverified'}">
                        ${r.is_verified === 'Y' ? 'VERIFIED' : 'DRAFT'}
                      </span>
                    </td>
                    <td>
                      <div class="action-btns">
                        <button class="btn ${r.is_verified === 'Y' ? 'secondary' : 'success'} btn-sm" data-toggle-res="${r.result_id}" data-cur-ver="${r.is_verified}">
                          ${r.is_verified === 'Y' ? 'Revert to Draft' : '✔ Verify'}
                        </button>
                        <button class="btn secondary btn-sm" data-edit-res="${r.result_id}">Edit</button>
                        <button class="btn danger btn-sm" data-del-res="${r.result_id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    document.getElementById("resRaceSelect").onchange = (e) => {
      window._season2026SelectedRace = Number(e.target.value);
      window._season2026EditingResult = null;
      renderSeason2026();
    };

    document.getElementById("btnSessionRace").onclick = () => {
      window._season2026ResultSession = "RACE";
      window._season2026EditingResult = null;
      renderSeason2026();
    };

    document.getElementById("btnSessionSprint").onclick = () => {
      if (currentRace.has_sprint === "Y") {
        window._season2026ResultSession = "SPRINT";
        window._season2026EditingResult = null;
        renderSeason2026();
      }
    };

    // Auto-calculate points on finish pos or status change
    const finishPosInput = document.getElementById("rf_finish_pos");
    const statusSelect = document.getElementById("rf_status");
    const pointsInput = document.getElementById("rf_points");

    const updatePoints = () => {
      const pos = parseInt(finishPosInput.value, 10);
      const st = statusSelect.value;
      const pts = calculateF1Points(sessionType, pos, st);
      pointsInput.value = pts;
    };

    if (!editRes) {
      finishPosInput.addEventListener("input", updatePoints);
      statusSelect.addEventListener("change", updatePoints);
    }

    if (editRes) {
      document.getElementById("cancelEditResBtn").onclick = () => {
        window._season2026EditingResult = null;
        renderSeason2026();
      };
    }

    document.getElementById("resultForm").onsubmit = async (e) => {
      e.preventDefault();
      const finishPosVal = document.getElementById("rf_finish_pos").value;
      const gridPosVal = document.getElementById("rf_grid_pos").value;
      const lapsVal = document.getElementById("rf_laps").value;
      const flapVal = document.getElementById("rf_flap").value;

      const payload = {
        driver_id: editRes ? editRes.driver_id : parseInt(document.getElementById("rf_driver").value, 10),
        team_id: parseInt(document.getElementById("rf_team").value, 10),
        session_type: sessionType,
        finish_position: finishPosVal !== "" ? parseInt(finishPosVal, 10) : null,
        grid_position: gridPosVal !== "" ? parseInt(gridPosVal, 10) : null,
        position_text: finishPosVal !== "" ? String(finishPosVal) : "DNF",
        classification_status: document.getElementById("rf_status").value,
        points: parseFloat(document.getElementById("rf_points").value) || 0,
        laps_completed: lapsVal !== "" ? parseInt(lapsVal, 10) : null,
        time_text: document.getElementById("rf_time").value.trim() || null,
        fastest_lap: flapVal !== "" ? parseInt(flapVal, 10) : null,
        fastest_lap_time: document.getElementById("rf_flap_time").value.trim() || null,
        is_verified: document.getElementById("rf_verified").checked ? "Y" : "N",
      };

      try {
        if (editRes) {
          await api.put(`/api/results/${editRes.result_id}`, payload);
          toast(`Updated result for ${editRes.first_name} ${editRes.last_name}`);
          window._season2026EditingResult = null;
        } else {
          await api.post(`/api/races/${curRaceId}/results`, payload);
          toast(`Recorded result (${payload.is_verified === 'Y' ? 'Verified' : 'Draft'})`);
        }
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    subContent.querySelectorAll("[data-toggle-res]").forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.toggleRes);
        const cur = btn.dataset.curVer;
        const next = cur === "Y" ? "N" : "Y";
        try {
          await api.put(`/api/results/${id}`, { is_verified: next });
          toast(next === "Y" ? "Result marked verified · Standings recalculated!" : "Result reverted to draft.");
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    subContent.querySelectorAll("[data-edit-res]").forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.editRes);
        window._season2026EditingResult = results.find((r) => r.result_id === id);
        renderSeason2026();
      };
    });

    subContent.querySelectorAll("[data-del-res]").forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.delRes);
        const target = results.find((r) => r.result_id === id);
        const dname = target ? `${target.first_name} ${target.last_name}` : "this result";
        if (!window.confirm(`Are you sure you want to delete the result for ${dname}?\n\nThis cannot be undone.`)) {
          return;
        }
        try {
          await api.delete(`/api/results/${id}`);
          toast(`Deleted result for ${dname}`);
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
  }

  // TAB 3: QUALIFYING
  else if (activeTab === "qualifying") {
    if (!statusData.races || !statusData.races.length) {
      subContent.innerHTML = `
        <div class="banner">No 2026 races have been scheduled yet.</div>
        <p class="muted">Please schedule at least one race in the <a href="#" id="gotoRacesLink">Race Schedule</a> tab before entering qualifying shootouts.</p>
      `;
      document.getElementById("gotoRacesLink").onclick = (e) => {
        e.preventDefault();
        window._season2026Tab = "races";
        renderSeason2026();
      };
      return;
    }

    const curRaceId = window._season2026SelectedRace || statusData.races[0].race_id;
    window._season2026SelectedRace = curRaceId;
    const currentRace = statusData.races.find((r) => r.race_id === curRaceId) || statusData.races[0];
    const sessionType = (window._season2026QualiSession === "SPRINT_SHOOTOUT" && currentRace.has_sprint === "Y") ? "SPRINT_SHOOTOUT" : "QUALIFYING";
    window._season2026QualiSession = sessionType;

    let qualiRows = [];
    try {
      qualiRows = await api.get(`/api/races/${curRaceId}/qualifying?session=${sessionType}`);
    } catch (err) {
      console.warn("Failed loading qualifying rows:", err);
    }

    const editQuali = window._season2026EditingQuali;

    subContent.innerHTML = `
      <div class="session-toggle-bar">
        <div style="display:flex; align-items:center; gap:8px;">
          <label style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--muted)">Race:</label>
          <select id="qualiRaceSelect" style="padding:6px 10px; font-weight:600">
            ${statusData.races.map((r) => `
              <option value="${r.race_id}" ${r.race_id === curRaceId ? "selected" : ""}>
                R${r.round_number}: ${r.race_name} (${r.circuit_name}) ${r.has_sprint === 'Y' ? '[Sprint Weekend]' : ''}
              </option>
            `).join("")}
          </select>
        </div>
        <div class="season-tabs" style="display:inline-flex;">
          <button class="${sessionType === 'QUALIFYING' ? 'active' : ''}" id="btnQualiMain">Grand Prix Qualifying</button>
          <button class="${sessionType === 'SPRINT_SHOOTOUT' ? 'active' : ''}" id="btnQualiSprint" ${currentRace.has_sprint !== 'Y' ? 'disabled title="Sprint shootout not enabled for this race weekend"' : ''}>
            Sprint Shootout ${currentRace.has_sprint !== 'Y' ? '(N/A)' : ''}
          </button>
        </div>
      </div>

      <div class="mgmt-form-card">
        <div class="mgmt-form-header">
          <h4>${editQuali ? `Edit Qualifying: ${editQuali.first_name} ${editQuali.last_name} (${sessionType})` : `Record Qualifying Shootout · ${currentRace.race_name} (${sessionType})`}</h4>
          ${editQuali ? `<button class="btn secondary btn-sm" id="cancelEditQualiBtn">Cancel Editing</button>` : ""}
        </div>
        <form id="qualiForm">
          <div class="form-grid-3">
            <div class="form-group">
              <label for="qf_driver">Driver</label>
              <select id="qf_driver" ${editQuali ? 'disabled' : 'required'}>
                <option value="">Select Driver...</option>
                ${drivers.map((d) => `
                  <option value="${d.driver_id}" ${editQuali && editQuali.driver_id === d.driver_id ? "selected" : ""}>
                    ${d.first_name} ${d.last_name} ${d.driver_code ? `(${d.driver_code})` : ''} #${d.permanent_number || ''}
                  </option>
                `).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="qf_team">Constructor</label>
              <select id="qf_team" required>
                <option value="">Select Constructor...</option>
                ${teams.map((t) => `
                  <option value="${t.team_id}" ${editQuali && editQuali.team_id === t.team_id ? "selected" : ""}>
                    ${t.team_name}
                  </option>
                `).join("")}
              </select>
            </div>
            <div class="form-group">
              <label for="qf_pos">Grid Position (1 – 30)</label>
              <input type="number" id="qf_pos" min="1" max="30" placeholder="e.g. 1" value="${editQuali && editQuali.position ? editQuali.position : ''}" required />
            </div>
          </div>

          <div class="form-grid-4" style="margin-top:12px">
            <div class="form-group">
              <label for="qf_q1">Q1 Time (M:SS.mmm)</label>
              <input type="text" id="qf_q1" placeholder="e.g. 1:18.234" value="${editQuali ? (editQuali.q1_time || '') : ''}" />
            </div>
            <div class="form-group">
              <label for="qf_q2">Q2 Time (M:SS.mmm)</label>
              <input type="text" id="qf_q2" placeholder="e.g. 1:17.890" value="${editQuali ? (editQuali.q2_time || '') : ''}" />
            </div>
            <div class="form-group">
              <label for="qf_q3">Q3 Time (M:SS.mmm)</label>
              <input type="text" id="qf_q3" placeholder="e.g. 1:17.215" value="${editQuali ? (editQuali.q3_time || '') : ''}" />
            </div>
            <div class="form-group">
              <label for="qf_laps">Laps</label>
              <input type="number" id="qf_laps" min="0" placeholder="e.g. 18" value="${editQuali && editQuali.laps_completed ? editQuali.laps_completed : ''}" />
            </div>
          </div>

          <div style="margin-top:14px">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none">
              <input type="checkbox" id="qf_verified" ${editQuali && editQuali.is_verified === 'Y' ? "checked" : ""} />
              <span><strong>Mark as Verified</strong></span>
            </label>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn primary">
              ${editQuali ? "💾 Update Qualifying" : "⏱ Record Qualifying Result"}
            </button>
          </div>
        </form>
      </div>

      <div class="card dashboard-panel" style="padding:20px">
        <div class="panel-heading" style="margin-bottom:14px">
          <div>
            <span class="eyebrow">${currentRace.race_name}</span>
            <h3>${sessionType === 'QUALIFYING' ? 'Qualifying Starting Grid Classification' : 'Sprint Shootout Classification'}</h3>
          </div>
          <span class="muted">${qualiRows.length} entries</span>
        </div>
        ${!qualiRows || !qualiRows.length ? `
          <div class="empty">No ${sessionType} results entered yet for ${currentRace.race_name}.</div>
        ` : `
          <div style="overflow:auto">
            <table class="standings-table">
              <thead>
                <tr>
                  <th style="width:50px">Pos</th>
                  <th>Driver</th>
                  <th>Constructor</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Laps</th>
                  <th>State</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${qualiRows.map((q) => `
                  <tr>
                    <td><strong>${q.position}</strong></td>
                    <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="initial-badge">${((q.first_name || '')[0] || '') + ((q.last_name || '')[0] || '')}</span>
                        <strong>${q.first_name} ${q.last_name}</strong>
                      </div>
                    </td>
                    <td>
                      <span class="team-stripe" style="background:${q.primary_color || 'var(--red)'}"></span>
                      ${q.team_name}
                    </td>
                    <td>${q.q1_time || '—'}</td>
                    <td>${q.q2_time || '—'}</td>
                    <td>${q.q3_time || '—'}</td>
                    <td>${q.laps_completed ?? '—'}</td>
                    <td>
                      <span class="badge ${q.is_verified === 'Y' ? 'badge-verified' : 'badge-unverified'}">
                        ${q.is_verified === 'Y' ? 'VERIFIED' : 'DRAFT'}
                      </span>
                    </td>
                    <td>
                      <div class="action-btns">
                        <button class="btn ${q.is_verified === 'Y' ? 'secondary' : 'success'} btn-sm" data-toggle-quali="${q.quali_id}" data-cur-ver="${q.is_verified}">
                          ${q.is_verified === 'Y' ? 'Revert to Draft' : '✔ Verify'}
                        </button>
                        <button class="btn secondary btn-sm" data-edit-quali="${q.quali_id}">Edit</button>
                        <button class="btn danger btn-sm" data-del-quali="${q.quali_id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    document.getElementById("qualiRaceSelect").onchange = (e) => {
      window._season2026SelectedRace = Number(e.target.value);
      window._season2026EditingQuali = null;
      renderSeason2026();
    };

    document.getElementById("btnQualiMain").onclick = () => {
      window._season2026QualiSession = "QUALIFYING";
      window._season2026EditingQuali = null;
      renderSeason2026();
    };

    document.getElementById("btnQualiSprint").onclick = () => {
      if (currentRace.has_sprint === "Y") {
        window._season2026QualiSession = "SPRINT_SHOOTOUT";
        window._season2026EditingQuali = null;
        renderSeason2026();
      }
    };

    if (editQuali) {
      document.getElementById("cancelEditQualiBtn").onclick = () => {
        window._season2026EditingQuali = null;
        renderSeason2026();
      };
    }

    document.getElementById("qualiForm").onsubmit = async (e) => {
      e.preventDefault();
      const lapsVal = document.getElementById("qf_laps").value;
      const payload = {
        driver_id: editQuali ? editQuali.driver_id : parseInt(document.getElementById("qf_driver").value, 10),
        team_id: parseInt(document.getElementById("qf_team").value, 10),
        session_type: sessionType,
        position: parseInt(document.getElementById("qf_pos").value, 10),
        q1_time: document.getElementById("qf_q1").value.trim() || null,
        q2_time: document.getElementById("qf_q2").value.trim() || null,
        q3_time: document.getElementById("qf_q3").value.trim() || null,
        laps_completed: lapsVal !== "" ? parseInt(lapsVal, 10) : null,
        is_verified: document.getElementById("qf_verified").checked ? "Y" : "N",
      };

      try {
        if (editQuali) {
          await api.put(`/api/qualifying/${editQuali.quali_id}`, payload);
          toast(`Updated qualifying for ${editQuali.first_name} ${editQuali.last_name}`);
          window._season2026EditingQuali = null;
        } else {
          await api.post(`/api/races/${curRaceId}/qualifying`, payload);
          toast(`Recorded qualifying position ${payload.position}`);
        }
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    subContent.querySelectorAll("[data-toggle-quali]").forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.toggleQuali);
        const cur = btn.dataset.curVer;
        const next = cur === "Y" ? "N" : "Y";
        try {
          await api.put(`/api/qualifying/${id}`, { is_verified: next });
          toast(next === "Y" ? "Qualifying slot marked verified!" : "Qualifying slot reverted to draft.");
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    subContent.querySelectorAll("[data-edit-quali]").forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.editQuali);
        window._season2026EditingQuali = qualiRows.find((q) => q.quali_id === id);
        renderSeason2026();
      };
    });

    subContent.querySelectorAll("[data-del-quali]").forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.delQuali);
        const target = qualiRows.find((q) => q.quali_id === id);
        const dname = target ? `${target.first_name} ${target.last_name}` : "this qualifying slot";
        if (!window.confirm(`Are you sure you want to delete the qualifying result for ${dname}?\n\nThis cannot be undone.`)) {
          return;
        }
        try {
          await api.delete(`/api/qualifying/${id}`);
          toast(`Deleted qualifying result for ${dname}`);
          await renderSeason2026();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
  }

  // TAB 4: ENTITIES & ROSTERS
  else if (activeTab === "entities") {
    subContent.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:20px;">

        <!-- Register Driver -->
        <div class="mgmt-form-card">
          <div class="mgmt-form-header">
            <h4>🏎 Register New Driver</h4>
            <span class="muted">${drivers.length} drivers</span>
          </div>
          <form id="createDriverForm">
            <div class="form-grid-2" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label for="nd_fname">First Name</label>
                <input type="text" id="nd_fname" placeholder="e.g. Franco" required />
              </div>
              <div class="form-group">
                <label for="nd_lname">Last Name</label>
                <input type="text" id="nd_lname" placeholder="e.g. Colapinto" required />
              </div>
            </div>
            <div class="form-grid-3" style="margin-top:10px;">
              <div class="form-group">
                <label for="nd_code">Code (3-letter)</label>
                <input type="text" id="nd_code" maxlength="3" placeholder="COL" />
              </div>
              <div class="form-group">
                <label for="nd_num">Number (1-99)</label>
                <input type="number" id="nd_num" min="1" max="99" placeholder="43" />
              </div>
              <div class="form-group">
                <label for="nd_nat">Nationality</label>
                <input type="text" id="nd_nat" placeholder="Argentine" />
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn primary">Register Driver</button>
            </div>
          </form>
        </div>

        <!-- Register Constructor -->
        <div class="mgmt-form-card">
          <div class="mgmt-form-header">
            <h4>🏭 Register New Constructor</h4>
            <span class="muted">${teams.length} constructors</span>
          </div>
          <form id="createTeamForm">
            <div class="form-group">
              <label for="nt_name">Constructor / Team Name</label>
              <input type="text" id="nt_name" placeholder="e.g. Audi Revolut F1 Team" required />
            </div>
            <div class="form-grid-2" style="display:grid; grid-template-columns:2fr 1fr; gap:10px; margin-top:10px;">
              <div class="form-group">
                <label for="nt_nat">Nationality</label>
                <input type="text" id="nt_nat" placeholder="German" />
              </div>
              <div class="form-group">
                <label for="nt_color">Primary Color</label>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="color" id="nt_color_picker" value="#e10600" style="padding:2px; width:36px; height:36px; border-radius:4px; cursor:pointer;" />
                  <input type="text" id="nt_color" value="#e10600" style="font-family:monospace; font-size:0.8rem;" />
                </div>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn primary">Register Constructor</button>
            </div>
          </form>
        </div>

        <!-- Register Circuit -->
        <div class="mgmt-form-card">
          <div class="mgmt-form-header">
            <h4>🗺 Register New Circuit</h4>
            <span class="muted">${circuits.length} circuits</span>
          </div>
          <form id="createCircuitForm">
            <div class="form-group">
              <label for="nc_name">Circuit Name</label>
              <input type="text" id="nc_name" placeholder="e.g. Madrid Street Circuit" required />
            </div>
            <div class="form-grid-2" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
              <div class="form-group">
                <label for="nc_loc">Locality / City</label>
                <input type="text" id="nc_loc" placeholder="Madrid" />
              </div>
              <div class="form-group">
                <label for="nc_country">Country</label>
                <select id="nc_country">
                  <option value="">Select Country...</option>
                  ${countries.map((c) => `<option value="${c.country_id}">${c.country_name}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn primary">Register Circuit</button>
            </div>
          </form>
        </div>

        <!-- Contract Driver to Team (2026) -->
        <div class="mgmt-form-card">
          <div class="mgmt-form-header">
            <h4>✍ Contract Driver to Constructor (2026)</h4>
            <span class="muted">2026 Season Grid</span>
          </div>
          <form id="contractForm">
            <div class="form-grid-2" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label for="ct_driver">Driver</label>
                <select id="ct_driver" required>
                  <option value="">Select Driver...</option>
                  ${drivers.map((d) => `
                    <option value="${d.driver_id}">
                      ${d.first_name} ${d.last_name} ${d.driver_code ? `(${d.driver_code})` : ''}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div class="form-group">
                <label for="ct_team">Constructor</label>
                <select id="ct_team" required>
                  <option value="">Select Constructor...</option>
                  ${teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="form-grid-2" style="display:grid; grid-template-columns:1fr 2fr; gap:10px; margin-top:10px;">
              <div class="form-group">
                <label for="ct_num">Car #</label>
                <input type="number" id="ct_num" min="1" max="99" placeholder="43" />
              </div>
              <div class="form-group">
                <label for="ct_note">Role Note</label>
                <input type="text" id="ct_note" placeholder="Primary Driver / Reserve" />
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn primary">Assign 2026 Seat</button>
            </div>
          </form>
        </div>

      </div>
    `;

    document.getElementById("nt_color_picker").oninput = (e) => {
      document.getElementById("nt_color").value = e.target.value;
    };
    document.getElementById("nt_color").oninput = (e) => {
      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
        document.getElementById("nt_color_picker").value = e.target.value;
      }
    };

    document.getElementById("createDriverForm").onsubmit = async (e) => {
      e.preventDefault();
      const pnum = document.getElementById("nd_num").value;
      const payload = {
        first_name: document.getElementById("nd_fname").value.trim(),
        last_name: document.getElementById("nd_lname").value.trim(),
        driver_code: document.getElementById("nd_code").value.trim() || null,
        permanent_number: pnum !== "" ? parseInt(pnum, 10) : null,
        nationality: document.getElementById("nd_nat").value.trim() || null,
      };
      try {
        const res = await api.post("/api/drivers", payload);
        toast(`Registered driver: ${res.first_name} ${res.last_name}`);
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    document.getElementById("createTeamForm").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        team_name: document.getElementById("nt_name").value.trim(),
        nationality: document.getElementById("nt_nat").value.trim() || null,
        primary_color: document.getElementById("nt_color").value.trim() || "#e10600",
      };
      try {
        const res = await api.post("/api/teams", payload);
        toast(`Registered constructor: ${res.team_name}`);
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    document.getElementById("createCircuitForm").onsubmit = async (e) => {
      e.preventDefault();
      const cid = document.getElementById("nc_country").value;
      const payload = {
        circuit_name: document.getElementById("nc_name").value.trim(),
        locality: document.getElementById("nc_loc").value.trim() || null,
        country_id: cid !== "" ? parseInt(cid, 10) : null,
      };
      try {
        const res = await api.post("/api/circuits", payload);
        toast(`Registered circuit: ${res.circuit_name}`);
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    document.getElementById("contractForm").onsubmit = async (e) => {
      e.preventDefault();
      const cnum = document.getElementById("ct_num").value;
      const payload = {
        driver_id: parseInt(document.getElementById("ct_driver").value, 10),
        team_id: parseInt(document.getElementById("ct_team").value, 10),
        car_number: cnum !== "" ? parseInt(cnum, 10) : null,
        role_note: document.getElementById("ct_note").value.trim() || null,
      };
      try {
        await api.post("/api/seasons/2026/driver-contracts", payload);
        toast("Contracted driver to constructor for 2026 season.");
        await renderSeason2026();
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }
}



document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b === btn));
  state.view = btn.dataset.view;
  if (state.view === "calendar") state.selectedRace = null;
  render();
});

seasonEl.addEventListener("change", () => {
  state.season = Number(seasonEl.value);
  state.selectedRace = null;
  syncSeasonTabs();
  render();
});

function syncSeasonTabs() {
  document.querySelectorAll("[data-season]").forEach((tab) => {
    const active = Number(tab.dataset.season) === Number(state.season);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

document.querySelectorAll("[data-season]").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.season = Number(tab.dataset.season);
    seasonEl.value = state.season;
    state.selectedRace = null;
    syncSeasonTabs();
    render();
  });
});

function setupGlobalSearch() {
  const searchInput = document.getElementById("globalSearch");
  const resultsDropdown = document.getElementById("searchResults");
  if (!searchInput || !resultsDropdown) return;

  let debounceTimer = null;
  let activeIndex = -1;

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      resultsDropdown.innerHTML = "";
      resultsDropdown.classList.add("hidden");
      activeIndex = -1;
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const results = await api.get(`/api/search?q=${encodeURIComponent(query)}`);
        activeIndex = -1;
        renderSearchResults(results, resultsDropdown, searchInput);
      } catch (err) {
        resultsDropdown.innerHTML = `<div class="search-empty">${err.message}</div>`;
        resultsDropdown.classList.remove("hidden");
      }
    }, 250);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (resultsDropdown.classList.contains("hidden")) return;
    const items = resultsDropdown.querySelectorAll(".search-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveSearchItem(items, activeIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveSearchItem(items, activeIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].click();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      resultsDropdown.classList.add("hidden");
      searchInput.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
      resultsDropdown.classList.add("hidden");
    }
  });
}

function renderSearchResults(results, container, searchInput) {
  if (!results || !results.length) {
    container.innerHTML = `<div class="search-empty">No matching records found</div>`;
    container.classList.remove("hidden");
    return;
  }

  const groups = {
    driver: { title: "Drivers", items: [] },
    team: { title: "Teams", items: [] },
    race: { title: "Races", items: [] },
    circuit: { title: "Circuits", items: [] },
  };

  results.forEach((item) => {
    if (groups[item.type]) groups[item.type].items.push(item);
  });

  let html = "";
  for (const [type, group] of Object.entries(groups)) {
    if (!group.items.length) continue;
    html += `<div class="search-group">
      <div class="search-group-title">${group.title}</div>
      ${group.items.map((item) => `
        <div class="search-item" data-type="${item.type}" data-id="${item.id}" data-season="${item.season_year || ''}" data-label="${(item.label || '').replaceAll('"', '&quot;')}">
          <span>${item.label}</span>
          <span class="search-type-tag">${item.type}</span>
        </div>
      `).join("")}
    </div>`;
  }

  container.innerHTML = html;
  container.classList.remove("hidden");

  container.querySelectorAll(".search-item").forEach((el) => {
    el.addEventListener("click", () => {
      const type = el.dataset.type;
      const id = el.dataset.id;
      const season = el.dataset.season;
      const label = el.dataset.label;

      container.classList.add("hidden");
      if (searchInput) searchInput.value = "";

      if (type === "race") {
        if (season) {
          state.season = Number(season);
          seasonEl.value = state.season;
          syncSeasonTabs();
        }
        state.selectedRace = Number(id);
        navigateTo("calendar");
      } else if (type === "driver") {
        state.selectedDriver = Number(id);
        navigateTo("drivers");
      } else if (type === "team") {
        state.selectedTeam = Number(id);
        navigateTo("teams");
      } else if (type === "circuit") {
        state.selectedRace = null;
        navigateTo("calendar");
      }
    });
  });
}

function updateActiveSearchItem(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle("focused", i === index);
    if (i === index) item.scrollIntoView({ block: "nearest" });
  });
}

function navigateTo(viewName) {
  state.view = viewName;
  document.querySelectorAll("#nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === viewName);
  });
  render();
}

document.addEventListener("click", (e) => {
  const dLink = e.target.closest("[data-driver-id]");
  if (dLink && dLink.dataset.driverId) {
    e.preventDefault();
    state.selectedDriver = Number(dLink.dataset.driverId);
    navigateTo("drivers");
    return;
  }
  const tLink = e.target.closest("[data-team-id]");
  if (tLink && tLink.dataset.teamId) {
    e.preventDefault();
    state.selectedTeam = Number(tLink.dataset.teamId);
    navigateTo("teams");
    return;
  }
  const vLink = e.target.closest("[data-view]");
  if (vLink && !e.target.closest("#nav")) {
    e.preventDefault();
    navigateTo(vLink.dataset.view);
    return;
  }
});

function handleHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const [route, queryStr] = hash.split("?");
  const params = new URLSearchParams(queryStr || "");
  if (route === "drivers") {
    if (params.get("id")) state.selectedDriver = Number(params.get("id"));
    navigateTo("drivers");
  } else if (route === "teams") {
    if (params.get("id")) state.selectedTeam = Number(params.get("id"));
    navigateTo("teams");
  } else if (route === "head-to-head" || route === "h2h") {
    if (params.get("driver_a")) state.h2hDriverA = Number(params.get("driver_a"));
    if (params.get("driver_b")) state.h2hDriverB = Number(params.get("driver_b"));
    if (params.get("season")) state.h2hSeason = Number(params.get("season"));
    navigateTo("head-to-head");
  } else if (route.startsWith("races/")) {
    const raceId = route.split("/")[1];
    if (raceId) state.selectedRace = Number(raceId);
    navigateTo("calendar");
  } else if (["dashboard", "seasons", "calendar", "standings", "qualifying", "pits", "penalties", "sponsors", "analytics", "data-management", "season-2026"].includes(route)) {
    navigateTo(route);
  }
}
window.addEventListener("hashchange", handleHash);

(async function init() {
  await loadHealth();
  try {
    await loadSeasons();
  } catch (err) {
    seasonEl.innerHTML = `<option>${err.message}</option>`;
  }
  syncSeasonTabs();
  setupGlobalSearch();
  if (window.location.hash) {
    handleHash();
  } else {
    render();
  }
})();

