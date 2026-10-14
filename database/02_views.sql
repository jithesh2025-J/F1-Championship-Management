-- Views for standings and analysis.
-- Championship points = SUM of source-awarded points from RACE and SPRINT sessions.
-- Grand Prix wins/podiums use session_type = 'RACE' only.

CREATE OR REPLACE VIEW v_driver_standings AS
SELECT
  r.season_year,
  d.driver_id,
  d.driver_ref,
  d.first_name,
  d.last_name,
  d.driver_code,
  SUM(rr.points) AS points,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS race_wins,
  SUM(CASE WHEN rr.session_type = 'SPRINT' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS sprint_wins,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podiums,
  SUM(CASE WHEN rr.session_type = 'RACE' THEN 1 ELSE 0 END) AS gp_starts,
  ROUND(AVG(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position IS NOT NULL THEN rr.finish_position END), 2) AS avg_finish,
  RANK() OVER (
    PARTITION BY r.season_year
    ORDER BY SUM(rr.points) DESC,
             SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) DESC,
             SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) DESC
  ) AS championship_position
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
WHERE rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, d.driver_id, d.driver_ref, d.first_name, d.last_name, d.driver_code;

CREATE OR REPLACE VIEW v_constructor_standings AS
SELECT
  r.season_year,
  t.team_id,
  t.constructor_ref,
  t.team_name,
  SUM(rr.points) AS points,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS race_wins,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podiums,
  RANK() OVER (
    PARTITION BY r.season_year
    ORDER BY SUM(rr.points) DESC,
             SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) DESC
  ) AS championship_position
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, t.team_id, t.constructor_ref, t.team_name;

CREATE OR REPLACE VIEW v_race_podiums AS
SELECT
  r.season_year,
  r.round_number,
  r.race_name,
  r.race_date,
  rr.finish_position,
  d.first_name || ' ' || d.last_name AS driver_name,
  t.team_name,
  rr.points,
  rr.time_text
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.session_type = 'RACE'
  AND rr.finish_position BETWEEN 1 AND 3
  AND rr.is_verified = 'Y';

CREATE OR REPLACE VIEW v_season_team_form AS
SELECT
  r.season_year,
  t.team_name,
  COUNT(DISTINCT r.race_id) AS races_scored,
  SUM(rr.points) AS points,
  ROUND(AVG(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position IS NOT NULL THEN rr.finish_position END), 2) AS avg_gp_finish
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.is_verified = 'Y'
GROUP BY r.season_year, t.team_name;

CREATE OR REPLACE VIEW v_non_finishes AS
SELECT
  r.season_year,
  r.race_name,
  d.first_name || ' ' || d.last_name AS driver_name,
  rr.session_type,
  rr.position_text,
  rr.classification_status,
  rr.points
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
WHERE rr.session_type = 'RACE'
  AND (
    rr.position_text IN ('R', 'D', 'W', 'E', 'F', 'N')
    OR UPPER(rr.classification_status) LIKE 'DISQUALIF%'
    OR UPPER(rr.classification_status) = 'RETIRED'
  );
