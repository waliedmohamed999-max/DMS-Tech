-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PLANNING', 'ACTIVE', 'WAITING_CLIENT', 'BLOCKED', 'AT_RISK', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectHealth" AS ENUM ('HEALTHY', 'NEEDS_ATTENTION', 'AT_RISK');

-- CreateEnum
CREATE TYPE "ClientDependencyState" AS ENUM ('NONE', 'OPEN', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('PROJECT_MANAGER', 'TECH_LEAD', 'DEVELOPER', 'DESIGNER', 'MARKETING', 'QA', 'ACCOUNT_MANAGER', 'CONTRIBUTOR', 'OBSERVER');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY', 'DELIVERED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('CONTENT', 'BRAND_ASSETS', 'ACCESS', 'CREDENTIALS', 'DATA', 'APPROVAL', 'FEEDBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "DependencySide" AS ENUM ('CLIENT', 'INTERNAL', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "DependencyStatus" AS ENUM ('OPEN', 'WAITING', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommentEntity" AS ENUM ('TASK', 'PROJECT');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "internalProjectsAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projectFromQuotationAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projectInactivityDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "timesheetMaxDailyMinutes" INTEGER NOT NULL DEFAULT 720;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL DEFAULT 'CLIENT',
    "clientId" TEXT,
    "opportunityId" TEXT,
    "quotationId" TEXT,
    "quotationVersionId" TEXT,
    "contractId" TEXT,
    "serviceId" TEXT,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopeSummary" TEXT,
    "deliveryTerms" TEXT,
    "projectManagerId" TEXT,
    "departmentId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "statusReason" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATE,
    "targetEndDate" DATE,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionOverride" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "budgetAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "health" "ProjectHealth" NOT NULL DEFAULT 'HEALTHY',
    "healthReasons" JSONB,
    "healthCheckedAt" TIMESTAMP(3),
    "atRiskNotifiedAt" TIMESTAMP(3),
    "clientDependencyStatus" "ClientDependencyState" NOT NULL DEFAULT 'NONE',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "allocationPercent" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "addedById" TEXT,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" DATE,
    "dueDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "contractMilestoneId" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "createdById" TEXT,
    "startDate" DATE,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "estimateMinutes" INTEGER,
    "blockedReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueSoonNotifiedAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "CommentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "submissionId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'SUBMITTED',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "approvalId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDeliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATE,
    "ownerId" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "clientApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "clientApprovalStatus" "ClientApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "clientDecisionNote" TEXT,
    "clientDecisionById" TEXT,
    "readyNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "DependencyType" NOT NULL DEFAULT 'OTHER',
    "ownerSide" "DependencySide" NOT NULL DEFAULT 'CLIENT',
    "status" "DependencyStatus" NOT NULL DEFAULT 'OPEN',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "serviceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateMilestone" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "offsetDays" INTEGER NOT NULL DEFAULT 7,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectTemplateMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "estimateMinutes" INTEGER,
    "role" "ProjectRole",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "key" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Project_organizationId_health_idx" ON "Project"("organizationId", "health");

-- CreateIndex
CREATE INDEX "Project_organizationId_projectManagerId_idx" ON "Project"("organizationId", "projectManagerId");

-- CreateIndex
CREATE INDEX "Project_organizationId_clientId_idx" ON "Project"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_number_key" ON "Project"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_leftAt_idx" ON "ProjectMember"("userId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_sortOrder_idx" ON "ProjectMilestone"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectMilestone_status_dueDate_idx" ON "ProjectMilestone"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_projectId_status_sortOrder_idx" ON "Task"("projectId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_dueDate_idx" ON "Task"("organizationId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_number_key" ON "Task"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_createdAt_idx" ON "Comment"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_status_idx" ON "TimeEntry"("projectId", "status");

-- CreateIndex
CREATE INDEX "TimesheetSubmission_projectId_status_idx" ON "TimesheetSubmission"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectDeliverable_projectId_status_idx" ON "ProjectDeliverable"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectDependency_projectId_status_idx" ON "ProjectDependency"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectDependency_status_dueDate_idx" ON "ProjectDependency"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_organizationId_code_key" ON "ProjectTemplate"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplateMilestone_templateId_key_key" ON "ProjectTemplateMilestone"("templateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "QuotationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_contractMilestoneId_fkey" FOREIGN KEY ("contractMilestoneId") REFERENCES "ContractMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TimesheetSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetSubmission" ADD CONSTRAINT "TimesheetSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetSubmission" ADD CONSTRAINT "TimesheetSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateMilestone" ADD CONSTRAINT "ProjectTemplateMilestone_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateTask" ADD CONSTRAINT "ProjectTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateTask" ADD CONSTRAINT "ProjectTemplateTask_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectTemplateMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Phase 4 integrity rules (docs/PROJECTS.md)
-- ===========================================================================
ALTER TABLE "Project" ADD CONSTRAINT "Project_dates_valid" CHECK ("targetEndDate" IS NULL OR "startDate" IS NULL OR "targetEndDate" >= "startDate");
ALTER TABLE "Project" ADD CONSTRAINT "Project_progress_valid" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "Project" ADD CONSTRAINT "Project_budget_nonneg" CHECK ("budgetAmount" IS NULL OR "budgetAmount" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "Project_client_required" CHECK ("type" <> 'CLIENT' OR "clientId" IS NOT NULL);
ALTER TABLE "Project" ADD CONSTRAINT "Project_internal_no_commercial" CHECK ("type" <> 'INTERNAL' OR ("contractId" IS NULL AND "quotationId" IS NULL));
ALTER TABLE "Project" ADD CONSTRAINT "Project_completed_at" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL);
ALTER TABLE "Project" ADD CONSTRAINT "Project_blocked_reason" CHECK ("status" <> 'BLOCKED' OR "statusReason" IS NOT NULL);
-- one live project per commercial source (a cancelled project frees the source)
CREATE UNIQUE INDEX "Project_one_live_per_contract" ON "Project" ("contractId") WHERE "status" <> 'CANCELLED' AND "contractId" IS NOT NULL;
CREATE UNIQUE INDEX "Project_one_live_per_quotation_version" ON "Project" ("quotationVersionId") WHERE "status" <> 'CANCELLED' AND "quotationVersionId" IS NOT NULL;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_allocation_valid" CHECK ("allocationPercent" IS NULL OR "allocationPercent" BETWEEN 0 AND 100);
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_weight_valid" CHECK ("weight" BETWEEN 1 AND 100);
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_dates_valid" CHECK ("startDate" IS NULL OR "dueDate" >= "startDate");
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_completed_at" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL);
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_blocked_reason" CHECK ("status" <> 'BLOCKED' OR "blockedReason" IS NOT NULL);

ALTER TABLE "Task" ADD CONSTRAINT "Task_estimate_positive" CHECK ("estimateMinutes" IS NULL OR "estimateMinutes" > 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_dates_valid" CHECK ("dueDate" IS NULL OR "startDate" IS NULL OR "dueDate" >= "startDate");
ALTER TABLE "Task" ADD CONSTRAINT "Task_done_completed_at" CHECK ("status" <> 'DONE' OR "completedAt" IS NOT NULL);
ALTER TABLE "Task" ADD CONSTRAINT "Task_blocked_reason" CHECK ("status" <> 'BLOCKED' OR ("blockedReason" IS NOT NULL AND length(trim("blockedReason")) > 0));
ALTER TABLE "Task" ADD CONSTRAINT "Task_not_own_parent" CHECK ("parentTaskId" IS NULL OR "parentTaskId" <> "id");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_minutes_valid" CHECK ("minutes" BETWEEN 1 AND 1440);
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_approved_at" CHECK ("status" <> 'APPROVED' OR "approvedAt" IS NOT NULL);
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_rejection_reason" CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);
ALTER TABLE "TimesheetSubmission" ADD CONSTRAINT "TimesheetSubmission_valid" CHECK ("totalMinutes" > 0 AND "periodEnd" >= "periodStart" AND ("status" <> 'REJECTED' OR "reason" IS NOT NULL));
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_accepted_at" CHECK ("status" <> 'ACCEPTED' OR "approvedAt" IS NOT NULL);
ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_resolved_at" CHECK ("status" <> 'RESOLVED' OR "resolvedAt" IS NOT NULL);
ALTER TABLE "ProjectTemplateMilestone" ADD CONSTRAINT "ProjectTemplateMilestone_valid" CHECK ("weight" BETWEEN 1 AND 100 AND "offsetDays" >= 0);
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_project_settings_valid" CHECK ("timesheetMaxDailyMinutes" BETWEEN 60 AND 1440 AND "projectInactivityDays" BETWEEN 1 AND 365);

-- Submitted / approved time is evidence: its content cannot change (status moves are service-controlled)
CREATE OR REPLACE FUNCTION time_entry_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('SUBMITTED', 'APPROVED') AND (
       NEW."minutes" IS DISTINCT FROM OLD."minutes" OR NEW."date" IS DISTINCT FROM OLD."date"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW."taskId" IS DISTINCT FROM OLD."taskId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."billable" IS DISTINCT FROM OLD."billable"
    OR NEW."description" IS DISTINCT FROM OLD."description")
  THEN
    RAISE EXCEPTION 'TIME_ENTRY_LOCKED: a % time entry cannot be edited', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "TimeEntry_freeze" BEFORE UPDATE ON "TimeEntry" FOR EACH ROW EXECUTE FUNCTION time_entry_freeze();

CREATE OR REPLACE FUNCTION time_entry_no_delete_locked() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'TIME_ENTRY_LOCKED: a % time entry cannot be deleted', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "TimeEntry_no_delete_locked" BEFORE DELETE ON "TimeEntry" FOR EACH ROW EXECUTE FUNCTION time_entry_no_delete_locked();
