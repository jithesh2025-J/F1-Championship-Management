-- 11_season_2026.sql: 2026 Season manual-entry / demo initialization
-- Target: Oracle 26ai / 23ai in schema F1_CHAMP
-- Configures the 2026 season record with manual-entry demo status.

MERGE INTO season s
USING (
  SELECT 2026 AS season_year,
         '2026 FIA Formula One World Championship' AS season_name,
         TO_DATE('2026-03-01', 'YYYY-MM-DD') AS start_date,
         TO_DATE('2026-11-29', 'YYYY-MM-DD') AS end_date,
         'Manual-entry / demo season for 2026 championship data entry and verification.' AS notes
  FROM dual
) src
ON (s.season_year = src.season_year)
WHEN MATCHED THEN
  UPDATE SET s.notes = src.notes
WHEN NOT MATCHED THEN
  INSERT (season_year, season_name, start_date, end_date, notes)
  VALUES (src.season_year, src.season_name, src.start_date, src.end_date, src.notes);

COMMIT;
