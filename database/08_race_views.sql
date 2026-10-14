-- Read-only race views for Stage 4 race pages and analytics.
-- Grand Prix classification only (session_type = 'RACE') matching existing standings rules.

CREATE OR REPLACE VIEW v_race_grid_finish AS
SELECT
  rr.race_id,
  r.season_year,
  r.round_number,
  r.race_name,
  rr.driver_id,
  d.first_name || ' ' || d.last_name AS driver_name,
  d.first_name,
  d.last_name,
  d.driver_code,
  d.permanent_number,
  rr.team_id,
  t.team_name,
  t.primary_color,
  rr.grid_position,
  rr.finish_position,
  rr.position_text,
  CASE
    WHEN rr.grid_position IS NOT NULL AND rr.finish_position IS NOT NULL
    THEN rr.grid_position - rr.finish_position
    ELSE NULL
  END AS positions_gained,
  rr.points,
  rr.classification_status AS status,
  rr.classification_status,
  rr.time_text,
  rr.laps_completed,
  rr.fastest_lap,
  rr.fastest_lap_time,
  rr.fastest_lap_rank
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.session_type = 'RACE'
  AND rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE';

CREATE OR REPLACE VIEW v_pit_stop_analysis AS
SELECT
  ps.race_id,
  r.season_year,
  r.round_number,
  r.race_name,
  ps.driver_id,
  d.first_name || ' ' || d.last_name AS driver_name,
  d.driver_code,
  rr.team_id,
  t.team_name,
  t.primary_color,
  COUNT(ps.pit_stop_id) AS stop_count,
  COUNT(ps.pit_stop_id) AS number_of_stops,
  MIN(ps.duration_ms) AS fastest_stop_ms,
  ROUND(MIN(ps.duration_ms) / 1000.0, 3) AS fastest_duration,
  MAX(ps.duration_ms) AS slowest_stop_ms,
  ROUND(MAX(ps.duration_ms) / 1000.0, 3) AS slowest_duration,
  ROUND(AVG(ps.duration_ms), 0) AS avg_stop_ms,
  ROUND(AVG(ps.duration_ms) / 1000.0, 3) AS avg_duration
FROM pit_stop ps
JOIN race r ON r.race_id = ps.race_id
JOIN driver d ON d.driver_id = ps.driver_id
LEFT JOIN race_result rr ON rr.race_id = ps.race_id
  AND rr.driver_id = ps.driver_id
  AND rr.session_type = 'RACE'
  AND rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
LEFT JOIN team t ON t.team_id = rr.team_id
WHERE ps.source_system <> 'ILLUSTRATIVE'
GROUP BY ps.race_id, r.season_year, r.round_number, r.race_name,
         ps.driver_id, d.first_name, d.last_name, d.driver_code,
         rr.team_id, t.team_name, t.primary_color;
