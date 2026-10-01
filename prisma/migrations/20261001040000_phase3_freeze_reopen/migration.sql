-- Allow the content seal (contentHash) to be cleared when a version returns to DRAFT
-- (approval rejected / withdrawn / reopened). Commercial columns stay frozen in every case,
-- and the seal can still never change while the version stays outside DRAFT.
CREATE OR REPLACE FUNCTION quotation_version_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
       NEW."quotationId" IS DISTINCT FROM OLD."quotationId" OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
    OR NEW."language" IS DISTINCT FROM OLD."language" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate" OR NEW."validUntil" IS DISTINCT FROM OLD."validUntil"
    OR NEW."vatRate" IS DISTINCT FROM OLD."vatRate" OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
    OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
    OR NEW."total" IS DISTINCT FROM OLD."total" OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms"
    OR NEW."deliveryTerms" IS DISTINCT FROM OLD."deliveryTerms" OR NEW."termsAndConditions" IS DISTINCT FROM OLD."termsAndConditions"
    OR NEW."clientMessage" IS DISTINCT FROM OLD."clientMessage"
    OR (NEW."status" <> 'DRAFT' AND NEW."contentHash" IS DISTINCT FROM OLD."contentHash"))
  THEN
    RAISE EXCEPTION 'QUOTATION_VERSION_FROZEN: commercial content of a % quotation version cannot change', OLD."status"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('ACCEPTED', 'CANCELLED', 'SUPERSEDED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'QUOTATION_VERSION_FINAL: % is a final state', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
