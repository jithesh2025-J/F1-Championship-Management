-- Read-only dashboard views for the premium frontend.
-- These views use the same verified, non-illustrative points rules as 02_views.sql.

CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM season WHERE NVL(notes, ' ') NOT LIKE '%Manual%' AND NVL(notes, ' ') NOT LIKE '%demo%') AS completed_seasons,
  (SELECT COUNT(*) FROM race WHERE source_system <> 'ILLUSTRATIVE') AS total_races,
  (SELECT COUNT(DISTINCT driver_id)
     FROM race_result
    WHERE is_verified = 'Y' AND source_system <> 'ILLUSTRATIVE') AS unique_drivers,
  (SELECT COUNT(*) FROM team WHERE source_system <> 'ILLUSTRATIVE') AS constructors,
  (SELECT COUNT(*) FROM pit_stop WHERE source_system <> 'ILLUSTRATIVE') AS total_pit_stops
FROM dual;

CREATE OR REPLACE VIEW v_driver_points_progression AS
SELECT
  r.season_year,
  r.round_number,
  r.race_name,
  rr.driver_id,
  d.first_name || ' ' || d.last_name AS driver_name,
  t.team_name,
  t.primary_color,
  SUM(rr.points) AS round_points,
  SUM(SUM(rr.points)) OVER (
    PARTITION BY r.season_year, rr.driver_id
    ORDER BY r.round_number
  ) AS cumulative_points
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, r.round_number, r.race_name, rr.driver_id,
         d.first_name, d.last_name, t.team_name, t.primary_color;

CREATE OR REPLACE VIEW v_team_points_progression AS
SELECT
  r.season_year,
  r.round_number,
  r.race_name,
  rr.team_id,
  t.team_name,
  t.primary_color,
  SUM(rr.points) AS round_points,
  SUM(SUM(rr.points)) OVER (
    PARTITION BY r.season_year, rr.team_id
    ORDER BY r.round_number
  ) AS cumulative_points
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, r.round_number, r.race_name, rr.team_id,
         t.team_name, t.primary_color;
