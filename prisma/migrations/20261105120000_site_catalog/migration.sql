-- CreateEnum
CREATE TYPE "SiteCatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "SiteCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "SiteCatalogStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCatalog_organizationId_key_status_idx" ON "SiteCatalog"("organizationId", "key", "status");

-- one working copy and one live version per catalog
CREATE UNIQUE INDEX "SiteCatalog_one_draft" ON "SiteCatalog"("organizationId", "key") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "SiteCatalog_one_published" ON "SiteCatalog"("organizationId", "key") WHERE "status" = 'PUBLISHED';
