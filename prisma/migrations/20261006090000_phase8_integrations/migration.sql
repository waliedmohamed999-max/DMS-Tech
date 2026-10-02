-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('WHATSAPP', 'GOOGLE', 'GMAIL', 'GOOGLE_CALENDAR', 'GOOGLE_DRIVE', 'META', 'GOOGLE_ADS', 'ZID', 'SALLA', 'SHOPIFY', 'NOVA', 'WEBHOOK', 'CUSTOM', 'S3');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'CONNECTED', 'DEGRADED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationEnvironment" AS ENUM ('PRODUCTION', 'SANDBOX');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PROCESSED', 'REJECTED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "WaDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WaMatchState" AS ENUM ('MATCHED', 'AMBIGUOUS', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "WaTemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'META', 'GOOGLE', 'LINKEDIN', 'TIKTOK', 'EMAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'PHONE');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT', 'BLOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SpendSource" AS ENUM ('MANUAL', 'PROVIDER_SYNCED');

-- CreateEnum
CREATE TYPE "TouchType" AS ENUM ('FIRST', 'TOUCH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationCategory" ADD VALUE 'INTEGRATIONS';
ALTER TYPE "NotificationCategory" ADD VALUE 'MARKETING';

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "storageDriver" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "campaignApprovalThreshold" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "environment" "IntegrationEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRefs" JSONB NOT NULL DEFAULT '{}',
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastHealthResult" TEXT,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "credentialsExpireAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSecret" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "direction" "IntegrationDirection" NOT NULL,
    "action" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" "ExecutionStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "sanitizedError" TEXT,
    "metadata" JSONB,
    "outboxId" TEXT,

    CONSTRAINT "IntegrationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "WebhookStatus" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "error" TEXT,
    "metadata" JSONB,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOutbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "connectionId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "waId" TEXT NOT NULL,
    "profileName" TEXT,
    "matchState" "WaMatchState" NOT NULL DEFAULT 'UNMATCHED',
    "candidates" JSONB,
    "leadId" TEXT,
    "contactId" TEXT,
    "clientId" TEXT,
    "ticketId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WaDirection" NOT NULL,
    "providerMessageId" TEXT,
    "messageType" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "status" "WaMessageStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "campaignRecipientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "providerTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "status" "WaTemplateStatus" NOT NULL DEFAULT 'UNKNOWN',
    "components" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "leadId" TEXT,
    "contactId" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "objective" TEXT,
    "budget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "startDate" DATE,
    "endDate" DATE,
    "ownerId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "externalCampaignId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "templateId" TEXT,
    "templateParams" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requireOptIn" BOOLEAN NOT NULL DEFAULT true,
    "sendRatePerMinute" INTEGER NOT NULL DEFAULT 30,
    "approvalId" TEXT,
    "approvedVersion" INTEGER,
    "approvedSnapshot" JSONB,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAudience" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "estimatedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "leadId" TEXT,
    "contactId" TEXT,
    "clientId" TEXT,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "providerMessageId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "messageVersion" INTEGER NOT NULL,
    "outboxId" TEXT,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSpend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "source" "SpendSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionTouch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "touchType" "TouchType" NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "campaignId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionTouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_status_idx" ON "IntegrationConnection"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_name_key" ON "IntegrationConnection"("organizationId", "provider", "name");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSecret_connectionId_name_key" ON "IntegrationSecret"("connectionId", "name");

-- CreateIndex
CREATE INDEX "IntegrationExecution_organizationId_startedAt_idx" ON "IntegrationExecution"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationExecution_organizationId_status_idx" ON "IntegrationExecution"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WebhookEvent_organizationId_status_receivedAt_idx" ON "WebhookEvent"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_organizationId_provider_externalEventId_key" ON "WebhookEvent"("organizationId", "provider", "externalEventId");

-- CreateIndex
CREATE INDEX "IntegrationOutbox_status_nextAttemptAt_idx" ON "IntegrationOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IntegrationOutbox_organizationId_status_idx" ON "IntegrationOutbox"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOutbox_organizationId_idempotencyKey_key" ON "IntegrationOutbox"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_lastMessageAt_idx" ON "WhatsAppConversation"("organizationId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_waId_key" ON "WhatsAppConversation"("organizationId", "waId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_providerMessageId_key" ON "WhatsAppMessage"("organizationId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_organizationId_name_language_key" ON "WhatsAppTemplate"("organizationId", "name", "language");

-- CreateIndex
CREATE INDEX "ContactConsent_organizationId_channel_address_recordedAt_idx" ON "ContactConsent"("organizationId", "channel", "address", "recordedAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_organizationId_status_idx" ON "MarketingCampaign"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_organizationId_utmCampaign_idx" ON "MarketingCampaign"("organizationId", "utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_organizationId_number_key" ON "MarketingCampaign"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAudience_campaignId_key" ON "CampaignAudience"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_providerMessageId_idx" ON "CampaignRecipient"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_phone_key" ON "CampaignRecipient"("campaignId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMessage_campaignId_recipientId_messageVersion_key" ON "CampaignMessage"("campaignId", "recipientId", "messageVersion");

-- CreateIndex
CREATE INDEX "CampaignSpend_campaignId_idx" ON "CampaignSpend"("campaignId");

-- CreateIndex
CREATE INDEX "AttributionTouch_organizationId_campaignId_idx" ON "AttributionTouch"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "AttributionTouch_leadId_occurredAt_idx" ON "AttributionTouch"("leadId", "occurredAt");

-- AddForeignKey
ALTER TABLE "IntegrationSecret" ADD CONSTRAINT "IntegrationSecret_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationExecution" ADD CONSTRAINT "IntegrationExecution_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSpend" ADD CONSTRAINT "CampaignSpend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionTouch" ADD CONSTRAINT "AttributionTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Phase 8 database guarantees
-- ---------------------------------------------------------------------------

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_campaign_threshold" CHECK ("campaignApprovalThreshold" >= 0);
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_valid" CHECK (("status" <> 'DISABLED') OR "disabledAt" IS NOT NULL);
ALTER TABLE "IntegrationOutbox" ADD CONSTRAINT "IntegrationOutbox_valid" CHECK (
  "attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20
  AND ("status" <> 'DEAD_LETTER' OR "deadAt" IS NOT NULL)
  AND ("status" <> 'SUCCEEDED' OR "completedAt" IS NOT NULL)
);
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_valid" CHECK (
  ("budget" IS NULL OR "budget" >= 0)
  AND ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate")
  AND "sendRatePerMinute" BETWEEN 1 AND 1000
  AND "recipientCount" >= 0 AND "version" >= 1
  AND ("status" NOT IN ('RUNNING', 'PAUSED', 'COMPLETED') OR "startedAt" IS NOT NULL)
  AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  AND ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL)
);
ALTER TABLE "CampaignSpend" ADD CONSTRAINT "CampaignSpend_valid" CHECK ("amount" >= 0);

-- one first touch per lead (original acquisition source is never overwritten)
CREATE UNIQUE INDEX "AttributionTouch_one_first" ON "AttributionTouch" ("leadId") WHERE "touchType" = 'FIRST';

-- append-only histories
CREATE TRIGGER attribution_append_only BEFORE UPDATE OR DELETE ON "AttributionTouch" FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION append_only_guard('ATTRIBUTION_IMMUTABLE');
CREATE TRIGGER consent_append_only BEFORE UPDATE OR DELETE ON "ContactConsent" FOR EACH ROW EXECUTE FUNCTION append_only_guard('CONSENT_IMMUTABLE');

-- a started campaign keeps its message / template / audience rules
CREATE OR REPLACE FUNCTION campaign_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') AND (
    NEW."templateId" IS DISTINCT FROM OLD."templateId" OR NEW."templateParams"::text IS DISTINCT FROM OLD."templateParams"::text
    OR NEW."version" IS DISTINCT FROM OLD."version" OR NEW."requireOptIn" IS DISTINCT FROM OLD."requireOptIn"
    OR NEW."channel" IS DISTINCT FROM OLD."channel" OR NEW."recipientCount" IS DISTINCT FROM OLD."recipientCount"
  ) THEN
    RAISE EXCEPTION 'CAMPAIGN_IMMUTABLE: a started campaign cannot change its message, template or audience';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER campaign_freeze BEFORE UPDATE ON "MarketingCampaign" FOR EACH ROW EXECUTE FUNCTION campaign_freeze();

-- the recipient snapshot is immutable once taken: no new / removed recipients, identity fields fixed
CREATE OR REPLACE FUNCTION campaign_recipient_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT "status" INTO st FROM "MarketingCampaign" WHERE "id" = COALESCE(NEW."campaignId", OLD."campaignId");
  IF TG_OP = 'INSERT' THEN
    IF st IN ('PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') THEN RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: recipients are snapshotted when the campaign starts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF st IS NOT NULL THEN RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: snapshot rows cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."phone" IS DISTINCT FROM OLD."phone" OR NEW."leadId" IS DISTINCT FROM OLD."leadId" OR NEW."contactId" IS DISTINCT FROM OLD."contactId" OR NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId" THEN
    RAISE EXCEPTION 'RECIPIENTS_IMMUTABLE: recipient identity cannot change';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER campaign_recipient_guard BEFORE INSERT OR UPDATE OR DELETE ON "CampaignRecipient" FOR EACH ROW EXECUTE FUNCTION campaign_recipient_guard();

-- backfill: every existing lead gets its original acquisition source as the FIRST touch (from Phase 2 capture metadata)
INSERT INTO "AttributionTouch" ("id", "organizationId", "leadId", "touchType", "source", "medium", "utmCampaign", "utmContent", "utmTerm", "referrer", "landingPage", "occurredAt")
SELECT 'bf' || l."id", l."organizationId", l."id", 'FIRST',
  COALESCE(NULLIF(l."captureMeta"->'utm'->>'utm_source', ''), lower(l."source"::text)),
  NULLIF(l."captureMeta"->'utm'->>'utm_medium', ''),
  NULLIF(l."captureMeta"->'utm'->>'utm_campaign', ''),
  NULLIF(l."captureMeta"->'utm'->>'utm_content', ''),
  NULLIF(l."captureMeta"->'utm'->>'utm_term', ''),
  NULLIF(l."captureMeta"->>'referrer', ''),
  NULLIF(l."captureMeta"->>'page', ''),
  l."createdAt"
FROM "Lead" l;
