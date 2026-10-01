-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'HOURLY', 'MONTHLY', 'ANNUAL', 'PER_USER', 'PER_UNIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaxBehavior" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SendMethod" AS ENUM ('EMAIL_MANUAL', 'WHATSAPP_MANUAL', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'AWAITING_SIGNATURE', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommercialDocKind" AS ENUM ('QUOTATION_PDF', 'CONTRACT_PDF');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "contractExpiryWarningDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "quoteCustomPricingRequiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoteExecutiveApprovalThreshold" DECIMAL(14,2),
ADD COLUMN     "quoteExpiryWarningDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "quoteValidityDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "key" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "shortDescriptionAr" TEXT,
    "shortDescriptionEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "category" TEXT,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'CUSTOM',
    "basePrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "taxBehavior" "TaxBehavior" NOT NULL DEFAULT 'STANDARD',
    "estimatedDeliveryDays" INTEGER,
    "departmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "quotationDescriptionAr" TEXT,
    "quotationDescriptionEn" TEXT,
    "defaultTermsAr" TEXT,
    "defaultTermsEn" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "taxBehavior" "TaxBehavior" NOT NULL DEFAULT 'STANDARD',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServicePackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "ownerId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "acceptedVersionId" TEXT,
    "duplicatedFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "language" "Locale" NOT NULL DEFAULT 'ar',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "issueDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "termsAndConditions" TEXT,
    "notes" TEXT,
    "clientMessage" TEXT,
    "contentHash" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalReasons" JSONB,
    "approvalId" TEXT,
    "approvalComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sendMethod" "SendMethod",
    "sentNote" TEXT,
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedRecordedById" TEXT,
    "acceptanceNote" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectionRecordedById" TEXT,
    "expiredAt" TIMESTAMP(3),
    "expiringNotifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "revisedFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "serviceId" TEXT,
    "packageId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "catalogUnitPrice" DECIMAL(14,2),
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxBehavior" "TaxBehavior" NOT NULL DEFAULT 'STANDARD',
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "CommercialDocKind" NOT NULL,
    "quotationVersionId" TEXT,
    "contractId" TEXT,
    "language" "Locale" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "quotationId" TEXT,
    "quotationVersionId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "language" "Locale" NOT NULL DEFAULT 'ar',
    "startDate" DATE,
    "endDate" DATE,
    "renewalDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "scopeOfWork" TEXT,
    "terms" TEXT,
    "ownerId" TEXT,
    "signedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "expiredAt" TIMESTAMP(3),
    "expiringNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMilestone" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2),
    "percentage" DECIMAL(5,2),
    "dueDate" DATE,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_organizationId_active_idx" ON "Service"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Service_organizationId_code_key" ON "Service"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Service_organizationId_key_key" ON "Service"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePackage_organizationId_code_key" ON "ServicePackage"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePackageItem_packageId_serviceId_key" ON "ServicePackageItem"("packageId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_currentVersionId_key" ON "Quotation"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_acceptedVersionId_key" ON "Quotation"("acceptedVersionId");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_status_idx" ON "Quotation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_clientId_idx" ON "Quotation"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_opportunityId_idx" ON "Quotation"("organizationId", "opportunityId");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_ownerId_idx" ON "Quotation"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_organizationId_number_key" ON "Quotation"("organizationId", "number");

-- CreateIndex
CREATE INDEX "QuotationVersion_organizationId_status_validUntil_idx" ON "QuotationVersion"("organizationId", "status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationVersion_quotationId_versionNumber_key" ON "QuotationVersion"("quotationId", "versionNumber");

-- CreateIndex
CREATE INDEX "QuotationItem_versionId_sortOrder_idx" ON "QuotationItem"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CommercialDocument_quotationVersionId_idx" ON "CommercialDocument"("quotationVersionId");

-- CreateIndex
CREATE INDEX "CommercialDocument_contractId_idx" ON "CommercialDocument"("contractId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_status_endDate_idx" ON "Contract"("organizationId", "status", "endDate");

-- CreateIndex
CREATE INDEX "Contract_organizationId_clientId_idx" ON "Contract"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_ownerId_idx" ON "Contract"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_number_key" ON "Contract"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ContractMilestone_contractId_sortOrder_idx" ON "ContractMilestone"("contractId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "QuotationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuotationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "QuotationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "QuotationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Phase 3 integrity rules that Prisma cannot express (docs/COMMERCIAL.md)
-- ===========================================================================

-- Money / quantity sanity
ALTER TABLE "Service" ADD CONSTRAINT "Service_basePrice_nonneg" CHECK ("basePrice" >= 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_delivery_days_nonneg" CHECK ("estimatedDeliveryDays" IS NULL OR "estimatedDeliveryDays" >= 0);
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_price_nonneg" CHECK ("defaultPrice" >= 0);
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_price_nonneg" CHECK ("unitPrice" >= 0);
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_discount_valid" CHECK (
  "discountValue" >= 0 AND ("discountType" <> 'PERCENT' OR "discountValue" <= 100)
  AND "discountAmount" >= 0 AND "discountAmount" <= "grossAmount");
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_tax_valid" CHECK ("taxRate" >= 0 AND "taxRate" <= 100 AND "taxAmount" >= 0);
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_totals_consistent" CHECK (
  "subtotal" = "grossAmount" - "discountAmount" AND "total" = "subtotal" + "taxAmount");

ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_totals_valid" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "discountTotal" <= "subtotal" AND "taxTotal" >= 0
  AND "total" = "subtotal" - "discountTotal" + "taxTotal");
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_vat_valid" CHECK ("vatRate" >= 0 AND "vatRate" <= 100);
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_dates_valid" CHECK ("validUntil" >= "issueDate");
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_version_pos" CHECK ("versionNumber" >= 1);

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_value_nonneg" CHECK ("contractValue" >= 0 AND "subtotal" >= 0 AND "taxTotal" >= 0 AND "discountTotal" >= 0);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_dates_valid" CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_termination_reason" CHECK ("status" <> 'TERMINATED' OR "terminationReason" IS NOT NULL);
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_amount_valid" CHECK (
  ("amount" IS NULL OR "amount" >= 0) AND ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100)));

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_quote_settings_valid" CHECK (
  "quoteValidityDays" BETWEEN 1 AND 365 AND "quoteExpiryWarningDays" BETWEEN 0 AND 60
  AND "contractExpiryWarningDays" BETWEEN 0 AND 365
  AND ("quoteExecutiveApprovalThreshold" IS NULL OR "quoteExecutiveApprovalThreshold" >= 0));

-- Contradiction guards (concurrency-safe: enforced by the database, not by a read-then-write)
CREATE UNIQUE INDEX "QuotationVersion_one_accepted_per_quotation" ON "QuotationVersion" ("quotationId") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "Quotation_one_accepted_per_opportunity" ON "Quotation" ("opportunityId") WHERE "status" = 'ACCEPTED' AND "opportunityId" IS NOT NULL;
CREATE UNIQUE INDEX "Contract_one_live_per_quotation_version" ON "Contract" ("quotationVersionId") WHERE "status" <> 'CANCELLED' AND "quotationVersionId" IS NOT NULL;
CREATE UNIQUE INDEX "CommercialDocument_one_sent_pdf_per_version" ON "CommercialDocument" ("quotationVersionId", "language") WHERE "kind" = 'QUOTATION_PDF' AND "quotationVersionId" IS NOT NULL;

-- Immutability: a quotation version's commercial content can change only while it is DRAFT
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
    OR NEW."clientMessage" IS DISTINCT FROM OLD."clientMessage" OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash")
  THEN
    RAISE EXCEPTION 'QUOTATION_VERSION_FROZEN: commercial content of a % quotation version cannot change', OLD."status"
      USING ERRCODE = 'check_violation';
  END IF;
  -- terminal states never move again
  IF OLD."status" IN ('ACCEPTED', 'CANCELLED', 'SUPERSEDED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'QUOTATION_VERSION_FINAL: % is a final state', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "QuotationVersion_freeze" BEFORE UPDATE ON "QuotationVersion" FOR EACH ROW EXECUTE FUNCTION quotation_version_freeze();

CREATE OR REPLACE FUNCTION quotation_item_freeze() RETURNS trigger AS $$
DECLARE st "QuotationStatus";
BEGIN
  SELECT "status" INTO st FROM "QuotationVersion" WHERE "id" = COALESCE(NEW."versionId", OLD."versionId");
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    RAISE EXCEPTION 'QUOTATION_VERSION_FROZEN: items of a % quotation version cannot change', st USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "QuotationItem_freeze" BEFORE INSERT OR UPDATE OR DELETE ON "QuotationItem" FOR EACH ROW EXECUTE FUNCTION quotation_item_freeze();

-- Contracts: commercial terms are frozen once the contract is in force or closed
CREATE OR REPLACE FUNCTION contract_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'CANCELLED') AND (
       NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."quotationId" IS DISTINCT FROM OLD."quotationId"
    OR NEW."quotationVersionId" IS DISTINCT FROM OLD."quotationVersionId" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal"
    OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal" OR NEW."contractValue" IS DISTINCT FROM OLD."contractValue"
    OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms" OR NEW."scopeOfWork" IS DISTINCT FROM OLD."scopeOfWork"
    OR NEW."terms" IS DISTINCT FROM OLD."terms" OR NEW."startDate" IS DISTINCT FROM OLD."startDate"
    OR NEW."endDate" IS DISTINCT FROM OLD."endDate")
  THEN
    RAISE EXCEPTION 'CONTRACT_FROZEN: commercial terms of a % contract cannot change', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('EXPIRED', 'TERMINATED', 'CANCELLED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'CONTRACT_FINAL: % is a final state', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Contract_freeze" BEFORE UPDATE ON "Contract" FOR EACH ROW EXECUTE FUNCTION contract_freeze();

-- Generated commercial documents are evidence: append-only
CREATE OR REPLACE FUNCTION commercial_document_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'COMMERCIAL_DOCUMENT_APPEND_ONLY' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "CommercialDocument_append_only" BEFORE UPDATE OR DELETE ON "CommercialDocument" FOR EACH ROW EXECUTE FUNCTION commercial_document_append_only();
