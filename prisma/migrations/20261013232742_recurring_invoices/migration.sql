-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "recurringInvoiceId" TEXT,
ADD COLUMN     "recurringPeriodStart" DATE;

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "interval" "RecurringInterval" NOT NULL,
    "startDate" DATE NOT NULL,
    "nextRunDate" DATE NOT NULL,
    "endDate" DATE,
    "maxOccurrences" INTEGER,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "pauseReason" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "autoIssue" BOOLEAN NOT NULL DEFAULT false,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "sendTo" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringInvoice_organizationId_status_nextRunDate_idx" ON "RecurringInvoice"("organizationId", "status", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringInvoice_organizationId_number_key" ON "RecurringInvoice"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A generated invoice always names its period; one live (not cancelled / void) invoice per schedule and period,
-- so a retried or concurrent sweep can never bill the same period twice.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurring_period_check" CHECK (("recurringInvoiceId" IS NULL) = ("recurringPeriodStart" IS NULL));
CREATE UNIQUE INDEX "Invoice_recurring_one_per_period" ON "Invoice"("recurringInvoiceId", "recurringPeriodStart") WHERE "recurringInvoiceId" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'VOID');

ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_values_check" CHECK (
  "generatedCount" >= 0
  AND "dueDays" BETWEEN 0 AND 365
  AND ("maxOccurrences" IS NULL OR "maxOccurrences" >= 1)
  AND ("endDate" IS NULL OR "endDate" >= "startDate")
  AND "nextRunDate" >= "startDate"
  AND "language" IN ('ar', 'en')
  AND (NOT "autoSend" OR "autoIssue")
);
