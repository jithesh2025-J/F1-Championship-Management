-- Stored procedures / functions used by the application and DBMS demo.
-- SQL*Plus / run_sql.py: statements terminated by a slash on its own line.

CREATE OR REPLACE PROCEDURE prc_driver_standings (
  p_season IN NUMBER,
  p_cursor OUT SYS_REFCURSOR
) AS
BEGIN
  IF p_season IS NULL THEN
    RAISE_APPLICATION_ERROR(-20010, 'Season year is required.');
  END IF;
  OPEN p_cursor FOR
    SELECT championship_position, first_name, last_name, driver_code,
           points, race_wins, sprint_wins, podiums, gp_starts, avg_finish, driver_id
    FROM v_driver_standings
    WHERE season_year = p_season
    ORDER BY championship_position, last_name;
END;
/

CREATE OR REPLACE PROCEDURE prc_constructor_standings (
  p_season IN NUMBER,
  p_cursor OUT SYS_REFCURSOR
) AS
BEGIN
  IF p_season IS NULL THEN
    RAISE_APPLICATION_ERROR(-20011, 'Season year is required.');
  END IF;
  OPEN p_cursor FOR
    SELECT championship_position, team_name, points, race_wins, podiums, team_id
    FROM v_constructor_standings
    WHERE season_year = p_season
    ORDER BY championship_position, team_name;
END;
/

-- Transactional management write: assign a sponsor to a team for a season.
CREATE OR REPLACE PROCEDURE prc_assign_sponsor (
  p_team_id     IN NUMBER,
  p_sponsor_id  IN NUMBER,
  p_season_year IN NUMBER,
  p_deal_note   IN VARCHAR2
) AS
  v_team NUMBER;
  v_sp   NUMBER;
  v_yr   NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_team FROM team WHERE team_id = p_team_id;
  SELECT COUNT(*) INTO v_sp FROM sponsor WHERE sponsor_id = p_sponsor_id;
  SELECT COUNT(*) INTO v_yr FROM season WHERE season_year = p_season_year;
  IF v_team = 0 OR v_sp = 0 OR v_yr = 0 THEN
    RAISE_APPLICATION_ERROR(-20012, 'Team, sponsor and season must already exist.');
  END IF;

  INSERT INTO team_sponsor (team_id, sponsor_id, season_year, deal_note, is_illustrative)
  VALUES (p_team_id, p_sponsor_id, p_season_year, p_deal_note, 'Y');
  COMMIT;
EXCEPTION
  WHEN DUP_VAL_ON_INDEX THEN
    ROLLBACK;
    RAISE_APPLICATION_ERROR(-20013, 'That sponsor is already assigned to this team for the season.');
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/

CREATE OR REPLACE FUNCTION fn_driver_season_points (
  p_driver_id IN NUMBER,
  p_season    IN NUMBER
) RETURN NUMBER AS
  v_points NUMBER;
BEGIN
  SELECT NVL(SUM(rr.points), 0)
  INTO v_points
  FROM race_result rr
  JOIN race r ON r.race_id = rr.race_id
  WHERE rr.driver_id = p_driver_id
    AND r.season_year = p_season
    AND rr.is_verified = 'Y';
  RETURN v_points;
END;
/
