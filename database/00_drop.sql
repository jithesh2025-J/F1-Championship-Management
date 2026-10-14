-- DESTRUCTIVE. Drops application objects in the current schema.
-- Run only as F1_CHAMP, never as SYS.
-- Execution order if resetting: 00_drop.sql then 01..04 then import.

BEGIN
  FOR t IN (
    SELECT trigger_name AS n FROM user_triggers
  ) LOOP
    EXECUTE IMMEDIATE 'DROP TRIGGER ' || t.n;
  END LOOP;
END;
/

BEGIN
  FOR p IN (
    SELECT object_name AS n, object_type AS t
    FROM user_objects
    WHERE object_type IN ('PROCEDURE', 'FUNCTION', 'PACKAGE')
  ) LOOP
    EXECUTE IMMEDIATE 'DROP ' || p.t || ' ' || p.n;
  END LOOP;
END;
/

BEGIN
  FOR v IN (SELECT view_name AS n FROM user_views) LOOP
    EXECUTE IMMEDIATE 'DROP VIEW ' || v.n;
  END LOOP;
END;
/

BEGIN
  FOR t IN (SELECT table_name AS n FROM user_tables) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.n || ' CASCADE CONSTRAINTS PURGE';
  END LOOP;
END;
/
