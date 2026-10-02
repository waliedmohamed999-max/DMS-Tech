
-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ORDERING', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcurementApprover" AS ENUM ('LINE_MANAGER', 'PROJECT_MANAGER', 'PROCUREMENT', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReceiptCondition" AS ENUM ('GOOD', 'DAMAGED', 'INCORRECT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'IN_USE', 'MAINTENANCE', 'LOST', 'DAMAGED', 'RETIRED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'REPAIR', 'INSPECTION', 'UPGRADE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('COMPANY', 'CLIENT', 'CONTRACT', 'PROJECT', 'FINANCE', 'HR', 'VENDOR', 'PROCUREMENT', 'ASSET', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentClassification" AS ENUM ('PUBLIC_INTERNAL', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'IN_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('CLIENT', 'QUOTATION', 'CONTRACT', 'PROJECT', 'INVOICE', 'EXPENSE', 'EMPLOYEE', 'VENDOR', 'PROCUREMENT_REQUEST', 'PURCHASE_ORDER', 'ASSET', 'TICKET');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CLIENT', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('INTERNAL', 'CLIENT_RECORDED', 'EMAIL_FUTURE', 'WHATSAPP_FUTURE', 'WEBSITE_FUTURE', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('TECHNICAL', 'BUG', 'ACCESS', 'CHANGE_REQUEST', 'BILLING', 'QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketCommentVisibility" AS ENUM ('INTERNAL', 'CLIENT_FACING');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeVisibility" AS ENUM ('ALL_EMPLOYEES', 'DEPARTMENT', 'ROLE_RESTRICTED', 'SUPPORT_ONLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationCategory" ADD VALUE 'OPERATIONS';
ALTER TYPE "NotificationCategory" ADD VALUE 'SUPPORT';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "purchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "contractReference" TEXT,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "preferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "procurementCategory" TEXT,
ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementApprovalRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(14,2),
    "departmentId" TEXT,
    "forProject" BOOLEAN,
    "category" TEXT,
    "approver" "ProcurementApprover" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "departmentId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "businessJustification" TEXT NOT NULL,
    "category" TEXT,
    "requestedDate" DATE NOT NULL,
    "neededByDate" DATE,
    "estimatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ProcurementStatus" NOT NULL DEFAULT 'DRAFT',
    "preferredVendorId" TEXT,
    "approvalId" TEXT,
    "approvalRuleName" TEXT,
    "approver" "ProcurementApprover",
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "estimatedUnitPrice" DECIMAL(14,2) NOT NULL,
    "estimatedTotal" DECIMAL(14,2) NOT NULL,
    "category" TEXT,
    "preferredVendorId" TEXT,
    "assetExpected" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "departmentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProcurementRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "procurementRequestId" TEXT,
    "departmentId" TEXT,
    "projectId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE,
    "expectedDeliveryDate" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvalId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalWaivedReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "revisionOfId" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "receivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "assetExpected" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "serviceId" TEXT,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "poItemId" TEXT NOT NULL,
    "quantityReceived" DECIMAL(12,3) NOT NULL,
    "condition" "ReceiptCondition" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "warrantyAlertDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "purchaseOrderId" TEXT,
    "purchaseOrderItemId" TEXT,
    "vendorId" TEXT,
    "purchaseDate" DATE,
    "purchaseCost" DECIMAL(14,2),
    "currency" TEXT,
    "warrantyEndDate" DATE,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "location" TEXT,
    "assignedEmployeeId" TEXT,
    "notes" TEXT,
    "warrantyNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "conditionAtAssignment" TEXT NOT NULL,
    "notes" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "conditionAtReturn" TEXT,
    "returnNotes" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL DEFAULT 'REPAIR',
    "description" TEXT NOT NULL,
    "vendorId" TEXT,
    "scheduledDate" DATE,
    "startedAt" TIMESTAMP(3),
    "completedDate" DATE,
    "cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assetStatusBefore" "AssetStatus",
    "expenseId" TEXT,
    "dueNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocumentCategory" NOT NULL,
    "entityType" "DocumentEntityType",
    "entityId" TEXT,
    "ownerId" TEXT NOT NULL,
    "classification" "DocumentClassification" NOT NULL DEFAULT 'INTERNAL',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[],
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "reviewerId" TEXT,
    "reviewRequestedAt" TIMESTAMP(3),
    "reviewNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "warnAtPercent" INTEGER NOT NULL DEFAULT 80,
    "pauseOnWaitingClient" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "serviceId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'TECHNICAL',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "source" "TicketSource" NOT NULL DEFAULT 'INTERNAL',
    "slaPolicyId" TEXT,
    "firstResponseDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedMinutes" INTEGER NOT NULL DEFAULT 0,
    "responseWarnedAt" TIMESTAMP(3),
    "responseBreachedAt" TIMESTAMP(3),
    "slaWarnedAt" TIMESTAMP(3),
    "slaBreachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "TicketCommentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusHistory" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTag" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "KnowledgeVisibility" NOT NULL DEFAULT 'ALL_EMPLOYEES',
    "departmentId" TEXT,
    "roleKeys" TEXT[],
    "tags" TEXT[],
    "authorId" TEXT NOT NULL,
    "reviewComment" TEXT,
    "reviewRequestedAt" TIMESTAMP(3),
    "reviewNotifiedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedVersionId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorContact_vendorId_idx" ON "VendorContact"("vendorId");

-- CreateIndex
CREATE INDEX "ProcurementApprovalRule_organizationId_active_sortOrder_idx" ON "ProcurementApprovalRule"("organizationId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "ProcurementRequest_organizationId_status_idx" ON "ProcurementRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProcurementRequest_requesterId_idx" ON "ProcurementRequest"("requesterId");

-- CreateIndex
CREATE INDEX "ProcurementRequest_projectId_idx" ON "ProcurementRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRequest_organizationId_number_key" ON "ProcurementRequest"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ProcurementRequestItem_requestId_idx" ON "ProcurementRequestItem"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_revisionOfId_key" ON "PurchaseOrder"("revisionOfId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_status_idx" ON "PurchaseOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_procurementRequestId_idx" ON "PurchaseOrder"("procurementRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_number_key" ON "PurchaseOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_idx" ON "PurchaseReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_poItemId_idx" ON "PurchaseReceiptItem"("poItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_organizationId_key_key" ON "AssetCategory"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Asset_organizationId_status_idx" ON "Asset"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Asset_assignedEmployeeId_idx" ON "Asset"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "Asset_purchaseOrderItemId_idx" ON "Asset"("purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_organizationId_number_key" ON "Asset"("organizationId", "number");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_idx" ON "AssetAssignment"("assetId");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_idx" ON "AssetAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "AssetMaintenance_assetId_idx" ON "AssetMaintenance"("assetId");

-- CreateIndex
CREATE INDEX "AssetMaintenance_organizationId_status_idx" ON "AssetMaintenance"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Document_organizationId_entityType_entityId_idx" ON "Document"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_organizationId_status_idx" ON "Document"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_number_key" ON "Document"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_storageKey_key" ON "DocumentVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "SlaPolicy_organizationId_priority_active_idx" ON "SlaPolicy"("organizationId", "priority", "active");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_status_idx" ON "SupportTicket"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "SupportTicket_clientId_idx" ON "SupportTicket"("clientId");

-- CreateIndex
CREATE INDEX "SupportTicket_projectId_idx" ON "SupportTicket"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_organizationId_number_key" ON "SupportTicket"("organizationId", "number");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketStatusHistory_ticketId_idx" ON "TicketStatusHistory"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTag_tag_idx" ON "TicketTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTag_ticketId_tag_key" ON "TicketTag"("ticketId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_organizationId_key_key" ON "KnowledgeCategory"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_publishedVersionId_key" ON "KnowledgeArticle"("publishedVersionId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_organizationId_status_idx" ON "KnowledgeArticle"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_organizationId_number_key" ON "KnowledgeArticle"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_version_key" ON "KnowledgeArticleVersion"("articleId", "version");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequestItem" ADD CONSTRAINT "ProcurementRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_poItemId_fkey" FOREIGN KEY ("poItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Phase 7 database guarantees (CHECKs, partial unique indexes, immutability triggers)
-- ---------------------------------------------------------------------------

-- procurement
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_valid" CHECK (
  "estimatedAmount" >= 0
  AND ("neededByDate" IS NULL OR "neededByDate" >= "requestedDate")
  AND ("status" <> 'REJECTED' OR ("rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0))
  AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  AND ("status" NOT IN ('APPROVED', 'ORDERING', 'ORDERED', 'RECEIVED') OR "approvedAt" IS NOT NULL)
  AND length(trim("businessJustification")) > 0
);
ALTER TABLE "ProcurementRequestItem" ADD CONSTRAINT "ProcurementRequestItem_valid" CHECK ("quantity" > 0 AND "estimatedUnitPrice" >= 0 AND "estimatedTotal" >= 0);
ALTER TABLE "ProcurementApprovalRule" ADD CONSTRAINT "ProcurementApprovalRule_valid" CHECK ("minAmount" >= 0 AND ("maxAmount" IS NULL OR "maxAmount" > "minAmount"));

-- purchase orders
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_valid" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0
  AND "total" = "subtotal" + "taxTotal"
  AND ("status" NOT IN ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED') OR ("issuedAt" IS NOT NULL AND "issueDate" IS NOT NULL))
  AND ("status" <> 'RECEIVED' OR "receivedAt" IS NOT NULL)
  AND ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL))
  AND ("status" <> 'CLOSED' OR "closedAt" IS NOT NULL)
  AND ("expectedDeliveryDate" IS NULL OR "issueDate" IS NULL OR "expectedDeliveryDate" >= "issueDate")
);
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_valid" CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxRate" >= 0 AND "taxRate" <= 100
  AND "subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount"
  AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity"
);
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_valid" CHECK ("quantityReceived" > 0);

-- vendors
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ops_valid" CHECK (("rating" IS NULL OR "rating" BETWEEN 1 AND 5) AND ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0));
CREATE UNIQUE INDEX "VendorContact_one_primary" ON "VendorContact" ("vendorId") WHERE "isPrimary";

-- assets
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_valid" CHECK (
  ("purchaseCost" IS NULL OR "purchaseCost" >= 0)
  AND (("status" = 'ASSIGNED') = ("assignedEmployeeId" IS NOT NULL))
);
CREATE UNIQUE INDEX "Asset_serial_unique" ON "Asset" ("organizationId", lower("serialNumber")) WHERE "serialNumber" IS NOT NULL;
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_valid" CHECK (
  ("returnedAt" IS NULL OR ("returnedAt" >= "assignedAt" AND "conditionAtReturn" IS NOT NULL AND "returnedById" IS NOT NULL))
);
-- an asset can never have two active assignments
CREATE UNIQUE INDEX "AssetAssignment_one_active" ON "AssetAssignment" ("assetId") WHERE "returnedAt" IS NULL;
ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_valid" CHECK (
  ("cost" IS NULL OR "cost" >= 0) AND ("status" <> 'COMPLETED' OR "completedDate" IS NOT NULL) AND length(trim("description")) > 0
);

-- documents
ALTER TABLE "Document" ADD CONSTRAINT "Document_valid" CHECK (
  "currentVersion" >= 0
  AND (("entityType" IS NULL) = ("entityId" IS NULL))
  -- company-wide visibility is only for unlinked company documents (never inherited by HR / finance records)
  AND ("classification" <> 'PUBLIC_INTERNAL' OR "entityType" IS NULL)
  AND ("status" <> 'ARCHIVED' OR "archivedAt" IS NOT NULL)
  AND ("status" <> 'IN_REVIEW' OR "reviewerId" IS NOT NULL)
);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_valid" CHECK ("versionNumber" >= 1 AND "size" > 0 AND "sha256" ~ '^[0-9a-f]{64}$');

-- support
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_valid" CHECK ("firstResponseMinutes" > 0 AND "resolutionMinutes" >= "firstResponseMinutes" AND "warnAtPercent" BETWEEN 1 AND 99);
CREATE UNIQUE INDEX "SlaPolicy_one_active_per_priority" ON "SlaPolicy" ("organizationId", "priority") WHERE "active";
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_valid" CHECK (
  "pausedMinutes" >= 0
  AND ("status" NOT IN ('RESOLVED', 'CLOSED') OR "resolvedAt" IS NOT NULL)
  AND ("status" <> 'CLOSED' OR "closedAt" IS NOT NULL)
  AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  AND length(trim("subject")) > 0
);

-- knowledge
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_valid" CHECK (
  ("status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "publishedVersionId" IS NOT NULL))
  AND ("status" <> 'ARCHIVED' OR "archivedAt" IS NOT NULL)
  AND ("visibility" <> 'DEPARTMENT' OR "departmentId" IS NOT NULL)
  AND ("visibility" <> 'ROLE_RESTRICTED' OR cardinality("roleKeys") > 0)
);

-- ---------------------------------------------------------------------------
-- immutability
-- ---------------------------------------------------------------------------

-- an issued PO keeps its commercial terms; corrections are cancel-and-replace
CREATE OR REPLACE FUNCTION po_freeze() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'PO_IMMUTABLE: only draft purchase orders can be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED') AND (
    NEW."vendorId" IS DISTINCT FROM OLD."vendorId" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal"
    OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal" OR NEW."total" IS DISTINCT FROM OLD."total"
    OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate" OR NEW."terms" IS DISTINCT FROM OLD."terms"
    OR NEW."number" IS DISTINCT FROM OLD."number" OR NEW."procurementRequestId" IS DISTINCT FROM OLD."procurementRequestId"
  ) THEN
    RAISE EXCEPTION 'PO_IMMUTABLE: issued purchase order commercial fields cannot change';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER po_freeze BEFORE UPDATE OR DELETE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION po_freeze();

CREATE OR REPLACE FUNCTION po_item_freeze() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT "status" INTO st FROM "PurchaseOrder" WHERE "id" = COALESCE(NEW."purchaseOrderId", OLD."purchaseOrderId");
  IF st IS NULL OR st = 'DRAFT' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP <> 'UPDATE' OR
     NEW."description" IS DISTINCT FROM OLD."description" OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice" OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."taxRate" IS DISTINCT FROM OLD."taxRate" OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount" OR NEW."total" IS DISTINCT FROM OLD."total"
     OR NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId" THEN
    RAISE EXCEPTION 'PO_IMMUTABLE: purchase order lines are frozen once the order leaves draft';
  END IF;
  IF NEW."receivedQuantity" < OLD."receivedQuantity" THEN
    RAISE EXCEPTION 'RECEIPT_IMMUTABLE: received quantity cannot decrease';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER po_item_freeze BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseOrderItem" FOR EACH ROW EXECUTE FUNCTION po_item_freeze();

-- generic append-only guard (receipts, document versions, knowledge versions, ticket comments / history)
CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '%: % rows are append-only', TG_ARGV[0], TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER receipt_append_only BEFORE UPDATE OR DELETE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION append_only_guard('RECEIPT_IMMUTABLE');
CREATE TRIGGER receipt_item_append_only BEFORE UPDATE OR DELETE ON "PurchaseReceiptItem" FOR EACH ROW EXECUTE FUNCTION append_only_guard('RECEIPT_IMMUTABLE');
CREATE TRIGGER document_version_immutable BEFORE UPDATE OR DELETE ON "DocumentVersion" FOR EACH ROW EXECUTE FUNCTION append_only_guard('DOCUMENT_VERSION_IMMUTABLE');
CREATE TRIGGER knowledge_version_immutable BEFORE UPDATE OR DELETE ON "KnowledgeArticleVersion" FOR EACH ROW EXECUTE FUNCTION append_only_guard('KNOWLEDGE_VERSION_IMMUTABLE');
CREATE TRIGGER ticket_comment_immutable BEFORE UPDATE OR DELETE ON "TicketComment" FOR EACH ROW EXECUTE FUNCTION append_only_guard('COMMENT_IMMUTABLE');
CREATE TRIGGER ticket_history_immutable BEFORE UPDATE OR DELETE ON "TicketStatusHistory" FOR EACH ROW EXECUTE FUNCTION append_only_guard('HISTORY_IMMUTABLE');

-- assignment history: closed once, never edited or deleted
CREATE OR REPLACE FUNCTION asset_assignment_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE: assignment history cannot be deleted'; END IF;
  IF OLD."returnedAt" IS NOT NULL THEN RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE: a returned assignment is history'; END IF;
  IF NEW."assetId" IS DISTINCT FROM OLD."assetId" OR NEW."employeeId" IS DISTINCT FROM OLD."employeeId"
     OR NEW."assignedAt" IS DISTINCT FROM OLD."assignedAt" OR NEW."assignedById" IS DISTINCT FROM OLD."assignedById"
     OR NEW."conditionAtAssignment" IS DISTINCT FROM OLD."conditionAtAssignment" THEN
    RAISE EXCEPTION 'ASSIGNMENT_IMMUTABLE: only the return can be recorded';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER asset_assignment_guard BEFORE UPDATE OR DELETE ON "AssetAssignment" FOR EACH ROW EXECUTE FUNCTION asset_assignment_guard();
