-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDING', 'ENDED');

-- CreateEnum
CREATE TYPE "SubscriptionChangeKind" AS ENUM ('CREATED', 'PLAN_CHANGED', 'PAUSED', 'RESUMED', 'CANCEL_SCHEDULED', 'CANCEL_REVOKED', 'RENEWED', 'ENDED', 'BILLING_STARTED', 'NOTE');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT,
    "contractId" TEXT,
    "serviceId" TEXT,
    "planKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interval" "RecurringInterval" NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "taxBehavior" "TaxBehavior" NOT NULL DEFAULT 'STANDARD',
    "startDate" DATE NOT NULL,
    "commitmentMonths" INTEGER NOT NULL DEFAULT 0,
    "termEndDate" DATE,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "renewalMonths" INTEGER NOT NULL DEFAULT 1,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" DATE,
    "pauseReason" TEXT,
    "cancelAt" DATE,
    "cancelReason" TEXT,
    "endedAt" TIMESTAMP(3),
    "renewalNoticeFor" DATE,
    "recurringInvoiceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" "SubscriptionChangeKind" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_recurringInvoiceId_key" ON "Subscription"("recurringInvoiceId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_clientId_idx" ON "Subscription"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_termEndDate_idx" ON "Subscription"("organizationId", "termEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_number_key" ON "Subscription"("organizationId", "number");

-- CreateIndex
CREATE INDEX "SubscriptionChange_subscriptionId_createdAt_idx" ON "SubscriptionChange"("subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

