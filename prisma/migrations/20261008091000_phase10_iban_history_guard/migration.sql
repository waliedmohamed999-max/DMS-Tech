-- Phase 10: bank-account history stays immutable, with exactly two additional, narrow transitions:
--   1. one-time encryption: plaintext IBAN → complete ciphertext, plaintext cleared, last 4 digits must match;
--   2. key rotation: ciphertext → ciphertext of a HIGHER key version, last 4 digits unchanged.
-- Every other column must be identical; deletes, period edits and all other updates remain forbidden.
CREATE OR REPLACE FUNCTION bank_history_guard() RETURNS trigger AS $$
DECLARE
  n INT;
  crypto text[] := ARRAY['iban', 'ibanCiphertext', 'ibanIv', 'ibanTag', 'ibanKeyVersion', 'ibanLast4'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'HISTORY_IMMUTABLE: % rows are never deleted', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - crypto) = (to_jsonb(OLD) - crypto) AND (
         -- 1. encryption of a legacy plaintext row
         (OLD."iban" IS NOT NULL AND OLD."ibanCiphertext" IS NULL AND NEW."iban" IS NULL
          AND NEW."ibanCiphertext" IS NOT NULL AND NEW."ibanIv" IS NOT NULL AND NEW."ibanTag" IS NOT NULL AND NEW."ibanKeyVersion" IS NOT NULL
          AND NEW."ibanLast4" = right(OLD."iban", 4))
         -- 2. re-encryption with a newer key
      OR (OLD."iban" IS NULL AND NEW."iban" IS NULL AND OLD."ibanCiphertext" IS NOT NULL AND NEW."ibanCiphertext" IS NOT NULL
          AND NEW."ibanIv" IS NOT NULL AND NEW."ibanTag" IS NOT NULL AND NEW."ibanKeyVersion" > OLD."ibanKeyVersion"
          AND NEW."ibanLast4" = OLD."ibanLast4")
    ) THEN
      RETURN NEW;
    END IF;
    -- otherwise: only closing an open row is allowed (effectiveTo NULL -> date)
    IF OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS NULL
       OR (to_jsonb(NEW) - 'effectiveTo') <> (to_jsonb(OLD) - 'effectiveTo') THEN
      RAISE EXCEPTION 'HISTORY_IMMUTABLE: % history cannot be edited', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  SELECT count(*) INTO n FROM "EmployeeBankAccount"
   WHERE "employeeId" = NEW."employeeId" AND id <> NEW."id"
     AND daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[]') && daterange(NEW."effectiveFrom", COALESCE(NEW."effectiveTo", 'infinity'::date), '[]');
  IF n > 0 THEN
    RAISE EXCEPTION 'PERIOD_OVERLAP: % periods cannot overlap', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER "EmployeeBankAccount_history" ON "EmployeeBankAccount";
CREATE TRIGGER "EmployeeBankAccount_history" BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeBankAccount" FOR EACH ROW EXECUTE FUNCTION bank_history_guard();

ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_last4_chk" CHECK ("ibanLast4" IS NULL OR "ibanLast4" ~ '^[0-9A-Z]{4}$');
