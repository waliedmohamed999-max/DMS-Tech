-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'PHONE', 'REFERRAL', 'LINKEDIN', 'INSTAGRAM', 'GOOGLE_ADS', 'META_ADS', 'TIKTOK', 'GOVERNMENT_OPPORTUNITY', 'PARTNER', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('OPEN', 'QUALIFIED', 'CONVERTED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'ATTEMPTED', 'CONTACTED', 'ENGAGED', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CrmEntity" AS ENUM ('LEAD', 'CLIENT', 'CONTACT', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE', 'TASK', 'FOLLOW_UP', 'STATUS_CHANGE', 'SYSTEM');

-- CreateTable
CREATE TABLE "Sequence" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'COMPANY',
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "country" TEXT DEFAULT 'SA',
    "city" TEXT,
    "address" TEXT,
    "industry" TEXT,
    "taxNumber" TEXT,
    "commercialRegistration" TEXT,
    "source" "LeadSource",
    "ownerId" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "whatsapp" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "preferredLanguage" "Locale" NOT NULL DEFAULT 'ar',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "whatsapp" TEXT,
    "whatsappNormalized" TEXT,
    "country" TEXT,
    "city" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "interestedService" TEXT,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "ownerId" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "status" "LeadStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "nextFollowUpAt" TIMESTAMP(3),
    "message" TEXT,
    "notes" TEXT,
    "locale" "Locale",
    "captureMeta" JSONB,
    "duplicateOfId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedById" TEXT,
    "convertedClientId" TEXT,
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'neutral',
    "isWonStage" BOOLEAN NOT NULL DEFAULT false,
    "isLostStage" BOOLEAN NOT NULL DEFAULT false,
    "defaultProbability" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "sourceLeadId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "serviceCategory" TEXT,
    "estimatedValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerId" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "lostReason" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "CrmEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "CrmEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientId" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL DEFAULT 'neutral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEntityTag" (
    "tagId" TEXT NOT NULL,
    "entityType" "CrmEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEntityTag_pkey" PRIMARY KEY ("tagId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Client_organizationId_ownerId_idx" ON "Client"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Client_organizationId_emailNormalized_idx" ON "Client"("organizationId", "emailNormalized");

-- CreateIndex
CREATE INDEX "Client_organizationId_phoneNormalized_idx" ON "Client"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_number_key" ON "Client"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Contact_organizationId_clientId_idx" ON "Contact"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Contact_organizationId_emailNormalized_idx" ON "Contact"("organizationId", "emailNormalized");

-- CreateIndex
CREATE INDEX "Contact_organizationId_phoneNormalized_idx" ON "Contact"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_createdAt_idx" ON "Lead"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_ownerId_idx" ON "Lead"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_nextFollowUpAt_idx" ON "Lead"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_emailNormalized_idx" ON "Lead"("organizationId", "emailNormalized");

-- CreateIndex
CREATE INDEX "Lead_organizationId_phoneNormalized_idx" ON "Lead"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_organizationId_whatsappNormalized_idx" ON "Lead"("organizationId", "whatsappNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_number_key" ON "Lead"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_organizationId_key_key" ON "Pipeline"("organizationId", "key");

-- CreateIndex
CREATE INDEX "PipelineStage_pipelineId_position_idx" ON "PipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_pipelineId_key_key" ON "PipelineStage"("pipelineId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sourceLeadId_key" ON "Opportunity"("sourceLeadId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_status_stageId_idx" ON "Opportunity"("organizationId", "status", "stageId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_ownerId_idx" ON "Opportunity"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_clientId_idx" ON "Opportunity"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_nextFollowUpAt_idx" ON "Opportunity"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_organizationId_number_key" ON "Opportunity"("organizationId", "number");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_entityType_entityId_occurredAt_idx" ON "CrmActivity"("organizationId", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_clientId_occurredAt_idx" ON "CrmActivity"("organizationId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmNote_organizationId_entityType_entityId_idx" ON "CrmNote"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTag_organizationId_name_key" ON "CrmTag"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CrmEntityTag_entityType_entityId_idx" ON "CrmEntityTag"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedView_userId_module_idx" ON "SavedView"("userId", "module");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmEntityTag" ADD CONSTRAINT "CrmEntityTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CrmTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity constraints that Prisma cannot express
-- ---------------------------------------------------------------------------
-- at most one live primary contact per client
CREATE UNIQUE INDEX "Contact_one_primary_per_client" ON "Contact" ("clientId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "clientId" IS NOT NULL;

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_probability_range" CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_value_nonneg" CHECK ("estimatedValue" >= 0);
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_lost_has_reason" CHECK ("status" <> 'LOST' OR ("lostReason" IS NOT NULL AND length(trim("lostReason")) > 0));
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_budget_nonneg" CHECK (("budgetMin" IS NULL OR "budgetMin" >= 0) AND ("budgetMax" IS NULL OR "budgetMax" >= 0));
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_budget_order" CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax");
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_probability_range" CHECK ("defaultProbability" BETWEEN 0 AND 100);
