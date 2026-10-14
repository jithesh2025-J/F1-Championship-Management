-- Read-only standings support for the Stage 3 UI.
-- Form uses verified Grand Prix results only and never changes championship totals.

CREATE OR REPLACE VIEW v_driver_standings_form AS
SELECT
  r.season_year,
  rr.driver_id,
  d.first_name,
  d.last_name,
  rr.team_id,
  t.team_name,
  t.primary_color,
  r.round_number,
  r.race_name,
  rr.finish_position,
  rr.points,
  ROW_NUMBER() OVER (
    PARTITION BY r.season_year, rr.driver_id
    ORDER BY r.round_number DESC
  ) AS form_round
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.session_type = 'RACE'
  AND rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE';

CREATE OR REPLACE VIEW v_team_standings_form AS
SELECT
  r.season_year,
  rr.team_id,
  t.team_name,
  t.primary_color,
  r.round_number,
  r.race_name,
  SUM(rr.points) AS points,
  ROW_NUMBER() OVER (
    PARTITION BY r.season_year, rr.team_id
    ORDER BY r.round_number DESC
  ) AS form_round
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN team t ON t.team_id = rr.team_id
WHERE rr.session_type = 'RACE'
  AND rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, rr.team_id, t.team_name, t.primary_color,
         r.round_number, r.race_name;
