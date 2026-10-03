-- Phase 11 (P11-F): ZATCA e-invoicing lifecycle (docs/ZATCA.md). Additive: new tables + one enum value.
-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'ZATCA';

-- CreateTable
CREATE TABLE "ZatcaEgsUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "functionalityMap" TEXT NOT NULL DEFAULT '1000',
    "status" TEXT NOT NULL DEFAULT 'NOT_ONBOARDED',
    "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
    "lastInvoiceHash" TEXT,
    "certificatePem" TEXT,
    "certificateExpiresAt" TIMESTAMP(3),
    "csidTokenRef" TEXT,
    "csidSecretRef" TEXT,
    "privateKeyRef" TEXT,
    "lockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaEgsUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaPartyProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "registrationName" TEXT,
    "vatNumber" TEXT,
    "otherId" TEXT,
    "otherIdScheme" TEXT,
    "streetName" TEXT,
    "additionalStreetName" TEXT,
    "buildingNumber" TEXT,
    "plotIdentification" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'SA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaPartyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "egsUnitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "icv" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "invoiceHash" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "issueTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "warnings" JSONB,
    "errors" JSONB,
    "clearedXml" TEXT,
    "submittedVia" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCategory" TEXT,
    "lastErrorCode" TEXT,
    "lastSubmittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaSubmission" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "outcome" TEXT NOT NULL,
    "errorCodes" JSONB,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZatcaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZatcaEgsUnit_organizationId_status_idx" ON "ZatcaEgsUnit"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaPartyProfile_organizationId_clientId_key" ON "ZatcaPartyProfile"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaDocument_uuid_key" ON "ZatcaDocument"("uuid");

-- CreateIndex
CREATE INDEX "ZatcaDocument_invoiceId_idx" ON "ZatcaDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "ZatcaDocument_organizationId_status_idx" ON "ZatcaDocument"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaDocument_egsUnitId_icv_key" ON "ZatcaDocument"("egsUnitId", "icv");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaDocument_egsUnitId_invoiceHash_key" ON "ZatcaDocument"("egsUnitId", "invoiceHash");

-- CreateIndex
CREATE INDEX "ZatcaSubmission_documentId_idx" ON "ZatcaSubmission"("documentId");

-- AddForeignKey
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_egsUnitId_fkey" FOREIGN KEY ("egsUnitId") REFERENCES "ZatcaEgsUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmission" ADD CONSTRAINT "ZatcaSubmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ZatcaDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------------
-- Guards (the database refuses what the service layer must never do)
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_environment_chk" CHECK ("environment" IN ('SANDBOX', 'SIMULATION', 'PRODUCTION'));
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_status_chk" CHECK ("status" IN ('NOT_ONBOARDED', 'ACTIVE', 'LOCKED_AFTER_RESTORE', 'REVOKED'));
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_map_chk" CHECK ("functionalityMap" ~ '^[01]{4}$');
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_counter_chk" CHECK ("invoiceCounter" >= 0);
-- private keys never live in the database: only a reference to the secret manager (env) or a protected key file
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_key_ref_chk" CHECK ("privateKeyRef" IS NULL OR "privateKeyRef" ~ '^(env|file):[^\s]+$');
ALTER TABLE "ZatcaEgsUnit" ADD CONSTRAINT "ZatcaEgsUnit_secret_ref_chk" CHECK (("csidSecretRef" IS NULL OR "csidSecretRef" ~ '^(env|enc):[^\s]+$') AND ("csidTokenRef" IS NULL OR "csidTokenRef" ~ '^(env|enc):[^\s]+$'));

CREATE UNIQUE INDEX "ZatcaPartyProfile_one_seller" ON "ZatcaPartyProfile" ("organizationId") WHERE "clientId" IS NULL;

ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_kind_chk" CHECK ("kind" IN ('STANDARD', 'SIMPLIFIED'));
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_type_chk" CHECK ("typeCode" IN ('388', '381', '383'));
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_env_chk" CHECK ("environment" IN ('SANDBOX', 'SIMULATION', 'PRODUCTION'));
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_status_chk" CHECK ("status" IN ('GENERATED', 'SUBMITTING', 'UNKNOWN', 'RETRY_SCHEDULED', 'CLEARED', 'REPORTED', 'REJECTED', 'AUTH_FAILED'));
ALTER TABLE "ZatcaDocument" ADD CONSTRAINT "ZatcaDocument_icv_chk" CHECK ("icv" >= 1);

CREATE OR REPLACE FUNCTION zatca_document_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ZATCA_DOCUMENT_IMMUTABLE: compliance documents are never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- one live document per invoice: a new one only after the previous was REJECTED
    IF EXISTS (SELECT 1 FROM "ZatcaDocument" d WHERE d."invoiceId" = NEW."invoiceId" AND d."status" <> 'REJECTED') THEN
      RAISE EXCEPTION 'ZATCA_DOCUMENT_EXISTS: invoice % already has a live compliance document', NEW."invoiceId";
    END IF;
    RETURN NEW;
  END IF;
  -- the generated artefact (what was / will be submitted) never changes
  IF NEW."xml" IS DISTINCT FROM OLD."xml" OR NEW."invoiceHash" IS DISTINCT FROM OLD."invoiceHash" OR NEW."icv" IS DISTINCT FROM OLD."icv"
     OR NEW."uuid" IS DISTINCT FROM OLD."uuid" OR NEW."previousHash" IS DISTINCT FROM OLD."previousHash" OR NEW."egsUnitId" IS DISTINCT FROM OLD."egsUnitId"
     OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR NEW."typeCode" IS DISTINCT FROM OLD."typeCode" OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."environment" IS DISTINCT FROM OLD."environment" OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate" OR NEW."issueTime" IS DISTINCT FROM OLD."issueTime" THEN
    RAISE EXCEPTION 'ZATCA_DOCUMENT_IMMUTABLE: the generated document cannot be modified';
  END IF;
  -- final outcomes are final
  IF OLD."status" IN ('CLEARED', 'REPORTED', 'REJECTED') AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."clearedXml" IS DISTINCT FROM OLD."clearedXml") THEN
    RAISE EXCEPTION 'ZATCA_DOCUMENT_FINAL: % is a final state', OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER zatca_document_guard BEFORE INSERT OR UPDATE OR DELETE ON "ZatcaDocument" FOR EACH ROW EXECUTE FUNCTION zatca_document_guard();
CREATE TRIGGER zatca_submission_append_only BEFORE UPDATE OR DELETE ON "ZatcaSubmission" FOR EACH ROW EXECUTE FUNCTION append_only_guard('ZATCA_SUBMISSION_IMMUTABLE');
