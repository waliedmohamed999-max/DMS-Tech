-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "gender" "EmployeeGender",
ADD COLUMN     "nationalId" TEXT;


-- one employee per national ID / iqama number in an organization (when set)
CREATE UNIQUE INDEX "Employee_org_nationalId_key" ON "Employee"("organizationId", "nationalId") WHERE "nationalId" IS NOT NULL;
