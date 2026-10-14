-- Query gallery for viva / analytics page.
-- These are examples; the Flask app runs allowlisted equivalents.
-- Championship figures are always derived from race_result, never hardcoded ranks.

-- 1) Filtering, sorting, DISTINCT nationalities
SELECT DISTINCT nationality
FROM driver
WHERE nationality IS NOT NULL
ORDER BY nationality;

-- 2) INNER JOIN: GP winners
SELECT r.season_year, r.round_number, r.race_name,
       d.first_name || ' ' || d.last_name AS winner,
       t.team_name
FROM race_result rr
INNER JOIN race r ON r.race_id = rr.race_id
INNER JOIN driver d ON d.driver_id = rr.driver_id
INNER JOIN team t ON t.team_id = rr.team_id
WHERE rr.session_type = 'RACE'
  AND rr.finish_position = 1
ORDER BY r.season_year, r.round_number;

-- 3) LEFT JOIN: races with optional sprint flag and pit-stop counts
SELECT r.season_year, r.race_name, r.has_sprint,
       COUNT(ps.pit_stop_id) AS pit_stop_rows
FROM race r
LEFT JOIN pit_stop ps ON ps.race_id = r.race_id
GROUP BY r.season_year, r.race_name, r.has_sprint
ORDER BY r.season_year, r.race_name;

-- 4) Aggregate + GROUP BY + HAVING: drivers with 3+ podiums in a season
SELECT r.season_year,
       d.first_name || ' ' || d.last_name AS driver_name,
       COUNT(*) AS podiums
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
WHERE rr.session_type = 'RACE'
  AND rr.finish_position BETWEEN 1 AND 3
GROUP BY r.season_year, d.first_name, d.last_name
HAVING COUNT(*) >= 3
ORDER BY r.season_year, podiums DESC;

-- 5) Subquery: drivers who scored more than the season average
SELECT ds.season_year, ds.first_name, ds.last_name, ds.points
FROM v_driver_standings ds
WHERE ds.points > (
  SELECT AVG(points) FROM v_driver_standings x WHERE x.season_year = ds.season_year
)
ORDER BY ds.season_year, ds.points DESC;

-- 6) Correlated subquery: each driver's best GP finish in a season
SELECT d.first_name || ' ' || d.last_name AS driver_name,
       r.season_year,
       (SELECT MIN(rr.finish_position)
        FROM race_result rr
        JOIN race r2 ON r2.race_id = rr.race_id
        WHERE rr.driver_id = d.driver_id
          AND r2.season_year = r.season_year
          AND rr.session_type = 'RACE'
          AND rr.finish_position IS NOT NULL) AS best_finish
FROM driver d
JOIN driver_contract dc ON dc.driver_id = d.driver_id
JOIN season r ON r.season_year = dc.season_year
GROUP BY d.driver_id, d.first_name, d.last_name, r.season_year
ORDER BY r.season_year, best_finish NULLS LAST;

-- 7) Season-over-season points comparison
SELECT d.first_name || ' ' || d.last_name AS driver_name,
       SUM(CASE WHEN r.season_year = 2023 THEN rr.points ELSE 0 END) AS pts_2023,
       SUM(CASE WHEN r.season_year = 2024 THEN rr.points ELSE 0 END) AS pts_2024,
       SUM(CASE WHEN r.season_year = 2025 THEN rr.points ELSE 0 END) AS pts_2025
FROM race_result rr
JOIN race r ON r.race_id = rr.race_id
JOIN driver d ON d.driver_id = rr.driver_id
WHERE r.season_year IN (2023, 2024, 2025)
  AND rr.is_verified = 'Y'
GROUP BY d.first_name, d.last_name
HAVING SUM(rr.points) > 0
ORDER BY pts_2025 DESC, pts_2024 DESC;

-- 8) Constructor title holders derived from results
SELECT season_year, team_name, points
FROM v_constructor_standings
WHERE championship_position = 1
ORDER BY season_year;
