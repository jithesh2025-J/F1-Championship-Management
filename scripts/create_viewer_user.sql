-- Run as SYSDBA in pluggable database FREEPDB1.
-- Creates a dedicated read-only viewer user for the safe analytics console.
--
-- Usage:
--   Interactive prompt (masks password input):
--     sqlplus / as sysdba @scripts/create_viewer_user.sql
--   Non-interactive (piped via stdin, e.g. deployment automation):
--     echo "$VIEWER_PASSWORD" | sqlplus / as sysdba @scripts/create_viewer_user.sql
--   PowerShell piped:
--     $env:F1_VIEWER_PASSWORD | sqlplus / as sysdba @scripts\create_viewer_user.sql
--
-- Password must match F1_VIEWER_PASSWORD in your local .env file.
-- Passwords must not be committed to source control.

SET DEFINE ON
SET VERIFY OFF
SET FEEDBACK OFF

ACCEPT viewer_password CHAR PROMPT 'Enter password for f1_viewer: ' HIDE

ALTER SESSION SET CONTAINER = FREEPDB1;

BEGIN
  EXECUTE IMMEDIATE 'CREATE USER f1_viewer IDENTIFIED BY "&viewer_password" DEFAULT TABLESPACE users';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -1920 THEN
      EXECUTE IMMEDIATE 'ALTER USER f1_viewer IDENTIFIED BY "&viewer_password"';
    ELSE
      RAISE;
    END IF;
END;
/

GRANT CREATE SESSION TO f1_viewer;
GRANT CREATE SYNONYM TO f1_viewer;

-- Generate SELECT grants from tables and views owned by F1_CHAMP
BEGIN
  FOR t IN (SELECT table_name FROM dba_tables WHERE owner = 'F1_CHAMP') LOOP
    EXECUTE IMMEDIATE 'GRANT SELECT ON f1_champ.' || t.table_name || ' TO f1_viewer';
  END LOOP;
  FOR v IN (SELECT view_name FROM dba_views WHERE owner = 'F1_CHAMP') LOOP
    EXECUTE IMMEDIATE 'GRANT SELECT ON f1_champ.' || v.view_name || ' TO f1_viewer';
  END LOOP;
END;
/

-- Generate private synonyms in f1_viewer schema so queries do not require the f1_champ. prefix
BEGIN
  FOR o IN (
    SELECT table_name AS obj_name FROM dba_tables WHERE owner = 'F1_CHAMP'
    UNION
    SELECT view_name AS obj_name FROM dba_views WHERE owner = 'F1_CHAMP'
  ) LOOP
    BEGIN
      EXECUTE IMMEDIATE 'CREATE OR REPLACE SYNONYM f1_viewer.' || o.obj_name || ' FOR f1_champ.' || o.obj_name;
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
/

-- Note: If running directly as F1_CHAMP rather than SYSDBA, grants can also be generated from user_tables & user_views:
-- BEGIN
--   FOR t IN (SELECT table_name FROM user_tables) LOOP
--     EXECUTE IMMEDIATE 'GRANT SELECT ON ' || t.table_name || ' TO f1_viewer';
--   END LOOP;
--   FOR v IN (SELECT view_name FROM user_views) LOOP
--     EXECUTE IMMEDIATE 'GRANT SELECT ON ' || v.view_name || ' TO f1_viewer';
--   END LOOP;
-- END;
-- /

UNDEFINE viewer_password
SET VERIFY ON
SET FEEDBACK ON

EXIT
