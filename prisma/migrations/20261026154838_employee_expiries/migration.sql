-- CreateEnum
CREATE TYPE "EmployeeExpiryKind" AS ENUM ('IQAMA', 'VISA', 'PASSPORT', 'CONTRACT');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "employeeExpiryWarningDays" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "EmployeeExpiry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "EmployeeExpiryKind" NOT NULL,
    "number" TEXT,
    "expiryDate" DATE NOT NULL,
    "warnedAt" TIMESTAMP(3),
    "finalWarnedAt" TIMESTAMP(3),
    "expiredNotifiedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeExpiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeExpiry_organizationId_expiryDate_idx" ON "EmployeeExpiry"("organizationId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeExpiry_employeeId_kind_key" ON "EmployeeExpiry"("employeeId", "kind");

-- AddForeignKey
ALTER TABLE "EmployeeExpiry" ADD CONSTRAINT "EmployeeExpiry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
