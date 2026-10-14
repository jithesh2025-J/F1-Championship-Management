-- Profile views for Stage 5: driver profiles, head-to-head, and season rate metrics.
-- Read-only analytical views using verified Grand Prix and Sprint results matching existing standings rules.

CREATE OR REPLACE VIEW v_driver_profile_stats AS
SELECT
  r.season_year,
  d.driver_id,
  d.driver_ref,
  d.first_name,
  d.last_name,
  d.driver_code,
  d.permanent_number,
  MAX(rr.team_id) KEEP (DENSE_RANK LAST ORDER BY r.round_number) AS team_id,
  MAX(t.team_name) KEEP (DENSE_RANK LAST ORDER BY r.round_number) AS team_name,
  MAX(t.primary_color) KEEP (DENSE_RANK LAST ORDER BY r.round_number) AS primary_color,
  COUNT(CASE WHEN rr.session_type = 'RACE' THEN 1 END) AS starts,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position = 1 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS podiums,
  NVL(pol.poles, 0) AS poles,
  SUM(rr.points) AS points,
  SUM(CASE WHEN rr.session_type = 'RACE' AND (
    rr.position_text IN ('R', 'D', 'W', 'E', 'F', 'N')
    OR (rr.classification_status NOT IN ('Finished', 'Lapped') AND rr.classification_status NOT LIKE '+%')
  ) THEN 1 ELSE 0 END) AS dnfs,
  ROUND(AVG(CASE WHEN rr.session_type = 'RACE' AND rr.finish_position IS NOT NULL THEN rr.finish_position END), 2) AS avg_finish,
  ROUND(AVG(CASE WHEN rr.session_type = 'RACE' AND rr.grid_position IS NOT NULL THEN rr.grid_position END), 2) AS avg_grid,
  SUM(CASE WHEN rr.session_type = 'RACE' AND rr.grid_position IS NOT NULL AND rr.finish_position IS NOT NULL THEN rr.grid_position - rr.finish_position ELSE 0 END) AS positions_gained
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
JOIN team t ON t.team_id = rr.team_id
LEFT JOIN (
  SELECT r2.season_year, qr.driver_id, COUNT(*) AS poles
  FROM qualifying_result qr
  JOIN race r2 ON r2.race_id = qr.race_id
  WHERE qr.session_type = 'QUALIFYING'
    AND qr.position = 1
    AND qr.is_verified = 'Y'
    AND qr.source_system <> 'ILLUSTRATIVE'
  GROUP BY r2.season_year, qr.driver_id
) pol ON pol.season_year = r.season_year AND pol.driver_id = d.driver_id
WHERE rr.is_verified = 'Y'
  AND rr.source_system <> 'ILLUSTRATIVE'
GROUP BY r.season_year, d.driver_id, d.driver_ref, d.first_name, d.last_name, d.driver_code, d.permanent_number, pol.poles;

CREATE OR REPLACE VIEW v_head_to_head AS
SELECT
  da.season_year,
  da.driver_id AS driver_a_id,
  da.first_name || ' ' || da.last_name AS driver_a_name,
  da.driver_code AS driver_a_code,
  db.driver_id AS driver_b_id,
  db.first_name || ' ' || db.last_name AS driver_b_name,
  db.driver_code AS driver_b_code,
  da.points AS driver_a_points,
  db.points AS driver_b_points,
  da.wins AS driver_a_wins,
  db.wins AS driver_b_wins,
  da.podiums AS driver_a_podiums,
  db.podiums AS driver_b_podiums,
  NVL(rh.driver_a_races_ahead, 0) AS driver_a_races_ahead,
  NVL(rh.driver_b_races_ahead, 0) AS driver_b_races_ahead,
  NVL(qh.driver_a_quali_ahead, 0) AS driver_a_quali_ahead,
  NVL(qh.driver_b_quali_ahead, 0) AS driver_b_quali_ahead,
  da.avg_finish AS driver_a_avg_finish,
  db.avg_finish AS driver_b_avg_finish
FROM v_driver_profile_stats da
JOIN v_driver_profile_stats db ON db.season_year = da.season_year AND db.driver_id <> da.driver_id
LEFT JOIN (
  SELECT
    r.season_year,
    ra.driver_id AS driver_a_id,
    rb.driver_id AS driver_b_id,
    SUM(CASE WHEN ra.finish_position < rb.finish_position THEN 1 ELSE 0 END) AS driver_a_races_ahead,
    SUM(CASE WHEN rb.finish_position < ra.finish_position THEN 1 ELSE 0 END) AS driver_b_races_ahead
  FROM race_result ra
  JOIN race_result rb ON rb.race_id = ra.race_id
    AND rb.session_type = 'RACE'
    AND rb.driver_id <> ra.driver_id
    AND rb.is_verified = 'Y'
    AND rb.source_system <> 'ILLUSTRATIVE'
  JOIN race r ON r.race_id = ra.race_id
  WHERE ra.session_type = 'RACE'
    AND ra.is_verified = 'Y'
    AND ra.source_system <> 'ILLUSTRATIVE'
  GROUP BY r.season_year, ra.driver_id, rb.driver_id
) rh ON rh.season_year = da.season_year AND rh.driver_a_id = da.driver_id AND rh.driver_b_id = db.driver_id
LEFT JOIN (
  SELECT
    r.season_year,
    qa.driver_id AS driver_a_id,
    qb.driver_id AS driver_b_id,
    SUM(CASE WHEN qa.position < qb.position THEN 1 ELSE 0 END) AS driver_a_quali_ahead,
    SUM(CASE WHEN qb.position < qa.position THEN 1 ELSE 0 END) AS driver_b_quali_ahead
  FROM qualifying_result qa
  JOIN qualifying_result qb ON qb.race_id = qa.race_id
    AND qb.session_type = 'QUALIFYING'
    AND qb.driver_id <> qa.driver_id
    AND qb.is_verified = 'Y'
    AND qb.source_system <> 'ILLUSTRATIVE'
  JOIN race r ON r.race_id = qa.race_id
  WHERE qa.session_type = 'QUALIFYING'
    AND qa.is_verified = 'Y'
    AND qa.source_system <> 'ILLUSTRATIVE'
  GROUP BY r.season_year, qa.driver_id, qb.driver_id
) qh ON qh.season_year = da.season_year AND qh.driver_a_id = da.driver_id AND qh.driver_b_id = db.driver_id;

CREATE OR REPLACE VIEW v_season_rate_metrics AS
SELECT
  s.season_year,
  s.driver_id,
  s.driver_ref,
  s.first_name,
  s.last_name,
  s.driver_code,
  s.permanent_number,
  s.team_id,
  s.team_name,
  s.primary_color,
  s.starts,
  s.wins,
  s.podiums,
  s.poles,
  s.points,
  s.dnfs,
  s.avg_finish,
  s.avg_grid,
  s.positions_gained,
  ROUND(CASE WHEN s.starts > 0 THEN s.wins / s.starts ELSE 0 END, 4) AS win_rate,
  ROUND(CASE WHEN s.starts > 0 THEN (s.wins / s.starts) * 100 ELSE 0 END, 2) AS win_pct,
  ROUND(CASE WHEN s.starts > 0 THEN s.podiums / s.starts ELSE 0 END, 4) AS podium_rate,
  ROUND(CASE WHEN s.starts > 0 THEN (s.podiums / s.starts) * 100 ELSE 0 END, 2) AS podium_pct,
  ROUND(CASE WHEN s.starts > 0 THEN s.dnfs / s.starts ELSE 0 END, 4) AS dnf_rate,
  ROUND(CASE WHEN s.starts > 0 THEN (s.dnfs / s.starts) * 100 ELSE 0 END, 2) AS dnf_pct
FROM v_driver_profile_stats s;
