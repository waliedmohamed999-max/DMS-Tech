-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'CANDIDATE';

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "city" TEXT,
ADD COLUMN     "experienceYears" INTEGER,
ADD COLUMN     "portfolioUrl" TEXT;

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "websiteSlug" TEXT;


-- one dashboard opening per website careers page
CREATE UNIQUE INDEX "JobOpening_org_websiteSlug_key" ON "JobOpening"("organizationId", "websiteSlug") WHERE "websiteSlug" IS NOT NULL;
