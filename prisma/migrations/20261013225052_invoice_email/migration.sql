-- AlterEnum
ALTER TYPE "InvoiceSendMethod" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "invoiceAutoReminders" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InvoiceEmail" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "language" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceEmail_invoiceId_createdAt_idx" ON "InvoiceEmail"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceEmail_organizationId_kind_status_idx" ON "InvoiceEmail"("organizationId", "kind", "status");

-- AddForeignKey
ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Allowed values
ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'));
ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_kind_check" CHECK ("kind" IN ('SEND', 'REMINDER', 'AUTO_DUE_SOON', 'AUTO_OVERDUE_1', 'AUTO_OVERDUE_7', 'AUTO_OVERDUE_14'));

-- Each automatic reminder step is claimed once per invoice (a FAILED / SKIPPED attempt frees the slot for a retry);
-- concurrent sweeps race on this index, so a client never receives the same automatic reminder twice.
CREATE UNIQUE INDEX "InvoiceEmail_auto_once" ON "InvoiceEmail"("invoiceId", "kind") WHERE "kind" LIKE 'AUTO\_%' AND "status" IN ('PENDING', 'SENT');
