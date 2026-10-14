-- ==============================================================================
-- 09_demo_queries.sql: Analytical Query Gallery for F1 Championship Management
-- ==============================================================================
-- These queries demonstrate advanced relational DBMS concepts on the F1 dataset:
-- (a) Aggregation with JOINs and GROUP BY
-- (b) Single-race classification and podium filtering
-- (c) Analytic window functions (RANK()) combined with scalar subqueries
-- (d) Analytical view querying and calculated position differentials
-- (e) Group filtering with HAVING for multi-season dominance
-- ==============================================================================

-- (a) Top 5 drivers by 2025 Grand Prix wins
-- Concepts: INNER JOIN, GROUP BY, AGGREGATION, ORDER BY, FETCH FIRST
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
FETCH FIRST 5 ROWS ONLY;

-- (b) Podium of a chosen race (2024 Monaco Grand Prix)
-- Concepts: INNER JOIN, FILTERING, MULTI-COLUMN SELECTION, ORDER BY
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
ORDER BY rr.finish_position ASC;

-- (c) Championship ranking with RANK() and a subquery above the average
-- Concepts: ANALYTIC WINDOW FUNCTION (RANK), SCALAR SUBQUERY, VIEW QUERYING
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
ORDER BY ds.points DESC;

-- (d) Biggest grid-to-finish gainers from v_race_grid_finish
-- Concepts: ANALYTICAL VIEW (v_race_grid_finish), COMPUTED COLUMNS, FILTERING, SORTING
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
FETCH FIRST 10 ROWS ONLY;

-- (e) Constructors with more than 5 wins using GROUP BY and HAVING
-- Concepts: INNER JOIN, GROUP BY, HAVING CLAUSE, MULTI-SEASON AGGREGATION
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
ORDER BY total_wins DESC;
