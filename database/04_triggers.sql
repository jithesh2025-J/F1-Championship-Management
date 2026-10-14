-- Protect verified Jolpica historical results from accidental CRUD edits.
-- Management tables may still be updated.

CREATE OR REPLACE TRIGGER trg_race_result_protect
BEFORE UPDATE OR DELETE ON race_result
FOR EACH ROW
BEGIN
  IF :OLD.source_system = 'JOLPICA' AND :OLD.is_verified = 'Y' THEN
    IF DELETING THEN
      RAISE_APPLICATION_ERROR(-20001,
        'Verified historical race results cannot be deleted.');
    END IF;
    IF UPDATING THEN
      IF NVL(:NEW.points, -1) <> NVL(:OLD.points, -1)
         OR NVL(:NEW.finish_position, -1) <> NVL(:OLD.finish_position, -1)
         OR NVL(:NEW.position_text, ' ') <> NVL(:OLD.position_text, ' ')
         OR NVL(:NEW.session_type, ' ') <> NVL(:OLD.session_type, ' ')
         OR NVL(:NEW.driver_id, -1) <> NVL(:OLD.driver_id, -1)
         OR NVL(:NEW.race_id, -1) <> NVL(:OLD.race_id, -1) THEN
        RAISE_APPLICATION_ERROR(-20002,
          'Verified historical classification and points cannot be changed.');
      END IF;
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_qualifying_protect
BEFORE UPDATE OR DELETE ON qualifying_result
FOR EACH ROW
BEGIN
  IF :OLD.source_system = 'JOLPICA' AND :OLD.is_verified = 'Y' THEN
    IF DELETING THEN
      RAISE_APPLICATION_ERROR(-20003,
        'Verified historical qualifying results cannot be deleted.');
    END IF;
    IF UPDATING AND NVL(:NEW.position, -1) <> NVL(:OLD.position, -1) THEN
      RAISE_APPLICATION_ERROR(-20004,
        'Verified qualifying positions cannot be changed.');
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_sponsor_audit
BEFORE UPDATE ON sponsor
FOR EACH ROW
BEGIN
  :NEW.updated_at := SYSTIMESTAMP;
  IF :NEW.sponsor_name IS NULL OR TRIM(:NEW.sponsor_name) IS NULL THEN
    RAISE_APPLICATION_ERROR(-20005, 'Sponsor name is required.');
  END IF;
END;
/
