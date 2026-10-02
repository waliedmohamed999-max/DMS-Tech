
-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'DEAD_LETTER', 'DISMISSED');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'VERIFIED', 'VERIFY_FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "EventStatus" ADD VALUE 'DEAD_LETTER';
ALTER TYPE "EventStatus" ADD VALUE 'DISMISSED';

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'AUTOMATION';

-- AlterTable
ALTER TABLE "DomainEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "causationId" TEXT,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dismissReason" TEXT,
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedById" TEXT,
ADD COLUMN     "handlersDone" JSONB,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "triggerEvent" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "version" INTEGER NOT NULL DEFAULT 1,
    "templateKey" TEXT,
    "runAsUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "runAsUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "correlationId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input" JSONB,
    "conditionResult" BOOLEAN,
    "actionResults" JSONB,
    "skipReason" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "dismissReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemJob" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'IDLE',
    "holder" TEXT,
    "lastStartedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastDurationMs" INTEGER,
    "lastError" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "failStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemJob_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'database',
    "status" "BackupStatus" NOT NULL,
    "fileName" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "metadata" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifyDetail" JSONB,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_triggerEvent_enabled_idx" ON "AutomationRule"("organizationId", "triggerEvent", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleVersion_ruleId_version_key" ON "AutomationRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE INDEX "AutomationExecution_organizationId_status_createdAt_idx" ON "AutomationExecution"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_status_nextAttemptAt_idx" ON "AutomationExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_ruleId_correlationId_idx" ON "AutomationExecution"("ruleId", "correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_ruleId_domainEventId_key" ON "AutomationExecution"("ruleId", "domainEventId");

-- CreateIndex
CREATE INDEX "BackupRecord_kind_startedAt_idx" ON "BackupRecord"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "DomainEvent_status_createdAt_idx" ON "DomainEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_correlationId_idx" ON "DomainEvent"("correlationId");

-- AddForeignKey
ALTER TABLE "AutomationRuleVersion" ADD CONSTRAINT "AutomationRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AutomationRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Phase 9 guards (hand-written)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_priority_chk" CHECK ("priority" BETWEEN 0 AND 1000);
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_version_chk" CHECK ("version" >= 1);
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_scope_chk" CHECK ("scope" IN ('ORGANIZATION'));
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_attempts_chk" CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "depth" >= 0);
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_attempts_chk" CHECK ("attempts" >= 0 AND "depth" >= 0);
-- dismissing needs who / when / why
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_dismissed_chk" CHECK ("status" <> 'DISMISSED' OR ("dismissedAt" IS NOT NULL AND "dismissReason" IS NOT NULL));

-- a rule version is history: never edited or deleted (executions reference it)
CREATE TRIGGER automation_rule_version_immutable BEFORE UPDATE OR DELETE ON "AutomationRuleVersion" FOR EACH ROW EXECUTE FUNCTION append_only_guard('RULE_VERSION_IMMUTABLE');
