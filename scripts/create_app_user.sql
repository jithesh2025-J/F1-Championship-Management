-- Run as SYSDBA. Creates the application schema in FREEPDB1.
-- Passwords must not be committed to source control.
--
-- Usage:
--   Interactive prompt (masks password input):
--     sqlplus / as sysdba @scripts/create_app_user.sql
--   Non-interactive (piped via stdin, e.g. deployment automation):
--     echo "$APP_PASSWORD" | sqlplus / as sysdba @scripts/create_app_user.sql
--   PowerShell piped:
--     $env:ORACLE_PASSWORD | sqlplus / as sysdba @scripts\create_app_user.sql

SET DEFINE ON
SET VERIFY OFF
SET FEEDBACK OFF

ACCEPT app_password CHAR PROMPT 'Enter password for f1_champ: ' HIDE

ALTER SESSION SET CONTAINER = FREEPDB1;

BEGIN
  EXECUTE IMMEDIATE 'CREATE USER f1_champ IDENTIFIED BY "&app_password" DEFAULT TABLESPACE users QUOTA UNLIMITED ON users';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -1920 THEN
      EXECUTE IMMEDIATE 'ALTER USER f1_champ IDENTIFIED BY "&app_password"';
    ELSE
      RAISE;
    END IF;
END;
/

GRANT CREATE SESSION TO f1_champ;
GRANT CREATE TABLE TO f1_champ;
GRANT CREATE VIEW TO f1_champ;
GRANT CREATE SEQUENCE TO f1_champ;
GRANT CREATE PROCEDURE TO f1_champ;
GRANT CREATE TRIGGER TO f1_champ;
GRANT CREATE TYPE TO f1_champ;
GRANT CREATE SYNONYM TO f1_champ;

UNDEFINE app_password
SET VERIFY ON
SET FEEDBACK ON

EXIT
