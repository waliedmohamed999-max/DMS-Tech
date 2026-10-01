-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('CONTRACT', 'CONTRACT_MILESTONE', 'QUOTATION', 'PROJECT', 'TIME', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceSendMethod" AS ENUM ('EMAIL_MANUAL', 'WHATSAPP_MANUAL', 'IN_PERSON', 'PORTAL_MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'PAYMENT_GATEWAY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CollectionNoteKind" AS ENUM ('NOTE', 'REMINDER', 'PROMISE_TO_PAY');

-- CreateEnum
CREATE TYPE "CollectionChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'IN_PERSON', 'OTHER');

-- AlterEnum
ALTER TYPE "CommercialDocKind" ADD VALUE 'INVOICE_PDF';

-- AlterTable
ALTER TABLE "CommercialDocument" ADD COLUMN     "invoiceId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultHourlyBillingRate" DECIMAL(14,2),
ADD COLUMN     "expenseApprovalThreshold" DECIMAL(14,2) NOT NULL DEFAULT 5000,
ADD COLUMN     "invoiceDueDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "invoiceDueSoonDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "invoicePaymentInstructions" TEXT,
ADD COLUMN     "largeOutstandingThreshold" DECIMAL(14,2) NOT NULL DEFAULT 50000;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT,
    "sourceType" "InvoiceSource" NOT NULL DEFAULT 'MANUAL',
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "quotationId" TEXT,
    "quotationVersionId" TEXT,
    "contractId" TEXT,
    "projectId" TEXT,
    "contractMilestoneId" TEXT,
    "language" "Locale" NOT NULL DEFAULT 'ar',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "paymentInstructions" TEXT,
    "sellerSnapshot" JSONB,
    "buyerSnapshot" JSONB,
    "contentHash" TEXT,
    "replacesInvoiceId" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentMethod" "InvoiceSendMethod",
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "nextFollowUpAt" DATE,
    "lastReminderAt" TIMESTAMP(3),
    "dueSoonNotifiedAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "serviceId" TEXT,
    "projectId" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxBehavior" "TaxBehavior" NOT NULL DEFAULT 'STANDARD',
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTimeEntry" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceItemId" TEXT,
    "timeEntryId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCollectionNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "CollectionNoteKind" NOT NULL DEFAULT 'NOTE',
    "channel" "CollectionChannel",
    "note" TEXT NOT NULL,
    "followUpAt" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceCollectionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "paymentDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxNumber" TEXT,
    "category" TEXT,
    "paymentTerms" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "vendorId" TEXT,
    "projectId" TEXT,
    "departmentId" TEXT,
    "userId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "paymentMethod" "PaymentMethod",
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvalId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentReference" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "payReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCostRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hourlyCost" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCostRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_dueDate_idx" ON "Invoice"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_clientId_idx" ON "Invoice"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_number_key" ON "Invoice"("organizationId", "number");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_sortOrder_idx" ON "InvoiceItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceTimeEntry_invoiceId_idx" ON "InvoiceTimeEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceTimeEntry_timeEntryId_idx" ON "InvoiceTimeEntry"("timeEntryId");

-- CreateIndex
CREATE INDEX "InvoiceCollectionNote_invoiceId_createdAt_idx" ON "InvoiceCollectionNote"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_organizationId_paymentDate_idx" ON "Payment"("organizationId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_organizationId_clientId_idx" ON "Payment"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_number_key" ON "Payment"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_key_key" ON "ExpenseCategory"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_status_idx" ON "Vendor"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_organizationId_number_key" ON "Vendor"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Expense_organizationId_status_idx" ON "Expense"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Expense_projectId_idx" ON "Expense"("projectId");

-- CreateIndex
CREATE INDEX "Expense_organizationId_date_idx" ON "Expense"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_organizationId_number_key" ON "Expense"("organizationId", "number");

-- CreateIndex
CREATE INDEX "UserCostRate_organizationId_userId_effectiveFrom_idx" ON "UserCostRate"("organizationId", "userId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommercialDocument_invoiceId_idx" ON "CommercialDocument"("invoiceId");

-- AddForeignKey
ALTER TABLE "CommercialDocument" ADD CONSTRAINT "CommercialDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "QuotationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractMilestoneId_fkey" FOREIGN KEY ("contractMilestoneId") REFERENCES "ContractMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTimeEntry" ADD CONSTRAINT "InvoiceTimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTimeEntry" ADD CONSTRAINT "InvoiceTimeEntry_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTimeEntry" ADD CONSTRAINT "InvoiceTimeEntry_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCollectionNote" ADD CONSTRAINT "InvoiceCollectionNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCollectionNote" ADD CONSTRAINT "InvoiceCollectionNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCostRate" ADD CONSTRAINT "UserCostRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Phase 5 integrity rules (database-enforced; services check the same rules first)
-- ===========================================================================

-- Organization finance settings
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_finance_settings_valid" CHECK (
  "invoiceDueDays" BETWEEN 0 AND 365 AND "invoiceDueSoonDays" BETWEEN 0 AND 60
  AND "expenseApprovalThreshold" >= 0 AND "largeOutstandingThreshold" >= 0
  AND ("defaultHourlyBillingRate" IS NULL OR "defaultHourlyBillingRate" >= 0));

-- Invoice amounts, balance identity, dates and lifecycle timestamps
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_valid" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0
  AND "discountTotal" <= "subtotal"
  AND "total" = "subtotal" - "discountTotal" + "taxTotal"
  AND "paidAmount" >= 0 AND "paidAmount" <= "total"
  AND "balanceDue" = "total" - "paidAmount");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dates_valid" CHECK ("dueDate" >= "issueDate");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issued_has_number" CHECK ("status" IN ('DRAFT', 'CANCELLED') OR ("number" IS NOT NULL AND "issuedAt" IS NOT NULL AND "contentHash" IS NOT NULL));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paid_is_settled" CHECK ("status" <> 'PAID' OR ("balanceDue" = 0 AND "paidAt" IS NOT NULL AND "total" > 0));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partial_has_payment" CHECK ("status" <> 'PARTIALLY_PAID' OR ("paidAmount" > 0 AND "balanceDue" > 0));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sent_has_timestamp" CHECK ("status" <> 'SENT' OR "sentAt" IS NOT NULL);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelled_valid" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND length(trim("cancelReason")) > 0));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_void_valid" CHECK ("status" <> 'VOID' OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason")) > 0 AND "paidAmount" = 0));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_source_valid" CHECK (
  ("sourceType" <> 'CONTRACT_MILESTONE' OR ("contractMilestoneId" IS NOT NULL AND "contractId" IS NOT NULL))
  AND ("sourceType" <> 'CONTRACT' OR "contractId" IS NOT NULL)
  AND ("sourceType" <> 'QUOTATION' OR "quotationVersionId" IS NOT NULL)
  AND ("sourceType" NOT IN ('PROJECT', 'TIME') OR "projectId" IS NOT NULL));

-- Billing deduplication: one live (not cancelled / void) invoice per billing source
CREATE UNIQUE INDEX "Invoice_one_live_per_milestone" ON "Invoice" ("contractMilestoneId") WHERE "contractMilestoneId" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'VOID');
CREATE UNIQUE INDEX "Invoice_one_live_per_contract" ON "Invoice" ("contractId") WHERE "sourceType" = 'CONTRACT' AND "status" NOT IN ('CANCELLED', 'VOID');
CREATE UNIQUE INDEX "Invoice_one_live_per_quotation_version" ON "Invoice" ("quotationVersionId") WHERE "sourceType" = 'QUOTATION' AND "status" NOT IN ('CANCELLED', 'VOID');
CREATE UNIQUE INDEX "Invoice_one_live_per_project_completion" ON "Invoice" ("projectId") WHERE "sourceType" = 'PROJECT' AND "status" NOT IN ('CANCELLED', 'VOID');
CREATE UNIQUE INDEX "InvoiceTimeEntry_one_live_link" ON "InvoiceTimeEntry" ("timeEntryId") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX "CommercialDocument_one_issued_pdf_per_invoice" ON "CommercialDocument" ("invoiceId", "language") WHERE "invoiceId" IS NOT NULL;

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_amounts_valid" CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND "grossAmount" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "grossAmount"
  AND "subtotal" = "grossAmount" - "discountAmount" AND "taxRate" >= 0 AND "taxRate" <= 100 AND "taxAmount" >= 0
  AND "total" = "subtotal" + "taxAmount" AND length(trim("description")) > 0);
ALTER TABLE "InvoiceTimeEntry" ADD CONSTRAINT "InvoiceTimeEntry_minutes_valid" CHECK ("minutes" > 0);

-- Freeze: after DRAFT, invoice commercial content cannot change (corrections = void + replacement)
CREATE OR REPLACE FUNCTION invoice_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
       NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
    OR NEW."number" IS DISTINCT FROM OLD."number" OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
    OR NEW."quotationId" IS DISTINCT FROM OLD."quotationId" OR NEW."quotationVersionId" IS DISTINCT FROM OLD."quotationVersionId"
    OR NEW."contractId" IS DISTINCT FROM OLD."contractId" OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."contractMilestoneId" IS DISTINCT FROM OLD."contractMilestoneId" OR NEW."language" IS DISTINCT FROM OLD."language"
    OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate"
    OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate" OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
    OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
    OR NEW."total" IS DISTINCT FROM OLD."total" OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms"
    OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."paymentInstructions" IS DISTINCT FROM OLD."paymentInstructions"
    OR NEW."sellerSnapshot"::text IS DISTINCT FROM OLD."sellerSnapshot"::text OR NEW."buyerSnapshot"::text IS DISTINCT FROM OLD."buyerSnapshot"::text
    OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash")
  THEN
    RAISE EXCEPTION 'INVOICE_FROZEN: a % invoice cannot be edited', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('CANCELLED', 'VOID') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'INVOICE_CLOSED: a % invoice cannot change status', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    RAISE EXCEPTION 'INVOICE_FROZEN: an issued invoice cannot return to draft' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Invoice_freeze" BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION invoice_freeze();

CREATE OR REPLACE FUNCTION invoice_no_delete() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'INVOICE_FROZEN: a % invoice cannot be deleted', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Invoice_no_delete" BEFORE DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION invoice_no_delete();

CREATE OR REPLACE FUNCTION invoice_item_freeze() RETURNS trigger AS $$
DECLARE st "InvoiceStatus";
BEGIN
  SELECT "status" INTO st FROM "Invoice" WHERE id = COALESCE(NEW."invoiceId", OLD."invoiceId");
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    RAISE EXCEPTION 'INVOICE_FROZEN: lines of a % invoice cannot change', st USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "InvoiceItem_freeze" BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceItem" FOR EACH ROW EXECUTE FUNCTION invoice_item_freeze();

-- Payments: positive amounts, reversal needs a reason, allocations positive and append-only
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversal_valid" CHECK ("status" <> 'REVERSED' OR ("reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0));
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);

CREATE OR REPLACE FUNCTION payment_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYMENT_IMMUTABLE: payments are reversed, never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
     OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."paymentDate" IS DISTINCT FROM OLD."paymentDate"
     OR NEW."number" IS DISTINCT FROM OLD."number" OR (OLD."status" = 'REVERSED' AND NEW."status" <> 'REVERSED') THEN
    RAISE EXCEPTION 'PAYMENT_IMMUTABLE: a recorded payment cannot be edited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_guard" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION payment_guard();

CREATE OR REPLACE FUNCTION allocation_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ALLOCATION_IMMUTABLE: payment allocations are append-only' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentAllocation_append_only" BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION allocation_append_only();

-- Expenses
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amounts_valid" CHECK ("amount" > 0 AND "taxAmount" >= 0 AND "total" = "amount" + "taxAmount" AND length(trim("description")) > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_lifecycle_valid" CHECK (
  ("status" NOT IN ('PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED') OR "submittedAt" IS NOT NULL)
  AND ("status" NOT IN ('APPROVED', 'PAID') OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL))
  AND ("status" <> 'PAID' OR ("paidAt" IS NOT NULL AND "paidById" IS NOT NULL))
  AND ("status" <> 'REJECTED' OR ("rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0))
  AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL));

CREATE OR REPLACE FUNCTION expense_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" NOT IN ('DRAFT', 'REJECTED') AND (
       NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
    OR NEW."vendorId" IS DISTINCT FROM OLD."vendorId" OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."date" IS DISTINCT FROM OLD."date" OR NEW."description" IS DISTINCT FROM OLD."description")
  THEN
    RAISE EXCEPTION 'EXPENSE_LOCKED: a % expense cannot be edited', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'PAID' AND NEW."status" <> 'PAID' THEN
    RAISE EXCEPTION 'EXPENSE_LOCKED: a paid expense cannot change status' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Expense_freeze" BEFORE UPDATE ON "Expense" FOR EACH ROW EXECUTE FUNCTION expense_freeze();

ALTER TABLE "UserCostRate" ADD CONSTRAINT "UserCostRate_valid" CHECK ("hourlyCost" >= 0 AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
