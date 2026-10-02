-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'REMOTE', 'ON_LEAVE', 'HOLIDAY', 'MISSING');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'SELF', 'LEAVE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LeaveLedgerKind" AS ENUM ('OPENING', 'ACCRUAL', 'USAGE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CALCULATING', 'REVIEW', 'APPROVED', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('WEBSITE', 'REFERRAL', 'LINKEDIN', 'JOB_BOARD', 'AGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'TECHNICAL', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('STRONG_YES', 'YES', 'NO', 'STRONG_NO');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'COMPLETED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nameAr" TEXT,
    "displayName" TEXT NOT NULL,
    "workEmail" TEXT,
    "personalEmail" TEXT,
    "workPhone" TEXT,
    "personalPhone" TEXT,
    "jobTitle" TEXT,
    "departmentId" TEXT,
    "managerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
    "joinDate" DATE NOT NULL,
    "probationEndDate" DATE,
    "terminationDate" DATE,
    "terminationReason" TEXT,
    "workLocation" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SA',
    "city" TEXT,
    "nationality" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalary" DECIMAL(14,2) NOT NULL,
    "housingAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherFixedAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBankAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workdayStart" TEXT NOT NULL DEFAULT '09:00',
    "workdayEnd" TEXT NOT NULL DEFAULT '17:00',
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "workingDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4]::INTEGER[],
    "dailyExpectedMinutes" INTEGER NOT NULL DEFAULT 480,
    "leaveMarksAttendance" BOOLEAN NOT NULL DEFAULT true,
    "leaveRequiresHrApproval" BOOLEAN NOT NULL DEFAULT false,
    "payrollDeductUnpaidLeave" BOOLEAN NOT NULL DEFAULT false,
    "payrollProrate" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "workMinutes" INTEGER,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctedById" TEXT,
    "createdById" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "defaultBalanceDays" DECIMAL(6,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveLedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" "LeaveLedgerKind" NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "leaveRequestId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" TEXT,
    "approvalId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "startNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "kind" "PayrollComponentKind" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "deductionTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "preparedById" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "calculatedById" TEXT,
    "approvalId" TEXT,
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectionComment" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentReference" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeNameAr" TEXT,
    "jobTitle" TEXT,
    "departmentName" TEXT,
    "compensationId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "baseSalary" DECIMAL(14,2) NOT NULL,
    "housingAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherFixedAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(14,2) NOT NULL,
    "totalDeductions" DECIMAL(14,2) NOT NULL,
    "netPay" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "calculationMeta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "approvedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "location" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "requirements" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salaryExpectation" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "noticePeriodDays" INTEGER,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "hiredEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "type" "InterviewType" NOT NULL DEFAULT 'VIDEO',
    "interviewerIds" TEXT[],
    "location" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewId" TEXT,
    "reviewerId" TEXT NOT NULL,
    "criteria" TEXT,
    "rating" INTEGER NOT NULL,
    "recommendation" "Recommendation",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "housingAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "startDate" DATE NOT NULL,
    "expiresAt" DATE,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "convertedEmployeeId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "expiryNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "rating" INTEGER,
    "completedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "dueNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "weight" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "dueDate" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_status_idx" ON "Employee"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Employee_organizationId_departmentId_idx" ON "Employee"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_number_key" ON "Employee"("organizationId", "number");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_employeeId_effectiveFrom_idx" ON "EmployeeCompensation"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeBankAccount_employeeId_effectiveFrom_idx" ON "EmployeeBankAccount"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePolicy_organizationId_key" ON "AttendancePolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_organizationId_date_key" ON "CompanyHoliday"("organizationId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_date_idx" ON "AttendanceRecord"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_organizationId_key_key" ON "LeaveType"("organizationId", "key");

-- CreateIndex
CREATE INDEX "LeaveLedgerEntry_employeeId_leaveTypeId_year_idx" ON "LeaveLedgerEntry"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_idx" ON "LeaveRequest"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollComponent_organizationId_key_key" ON "PayrollComponent"("organizationId", "key");

-- CreateIndex
CREATE INDEX "PayrollPeriod_organizationId_status_idx" ON "PayrollPeriod"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_organizationId_periodStart_periodEnd_key" ON "PayrollPeriod"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollEntry_employeeId_idx" ON "PayrollEntry"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_periodId_employeeId_key" ON "PayrollEntry"("periodId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodId_employeeId_idx" ON "PayrollAdjustment"("periodId", "employeeId");

-- CreateIndex
CREATE INDEX "JobOpening_organizationId_status_idx" ON "JobOpening"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_organizationId_number_key" ON "JobOpening"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_emailNormalized_idx" ON "Candidate"("organizationId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_organizationId_number_key" ON "Candidate"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Application_hiredEmployeeId_key" ON "Application"("hiredEmployeeId");

-- CreateIndex
CREATE INDEX "Application_organizationId_jobId_stage_idx" ON "Application"("organizationId", "jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobId_key" ON "Application"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "Interview_applicationId_scheduledAt_idx" ON "Interview"("applicationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_applicationId_idx" ON "CandidateEvaluation"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_convertedEmployeeId_key" ON "Offer"("convertedEmployeeId");

-- CreateIndex
CREATE INDEX "Offer_applicationId_idx" ON "Offer"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_organizationId_number_key" ON "Offer"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PerformanceReview_organizationId_status_idx" ON "PerformanceReview"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId");

-- CreateIndex
CREATE INDEX "PerformanceGoal_employeeId_idx" ON "PerformanceGoal"("employeeId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_convertedEmployeeId_fkey" FOREIGN KEY ("convertedEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- Phase 6 integrity rules (database-enforced; services check the same rules first)
-- ===========================================================================

-- Employees
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_not_own_manager" CHECK ("managerId" IS NULL OR "managerId" <> "id");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_dates_valid" CHECK (
  ("probationEndDate" IS NULL OR "probationEndDate" >= "joinDate") AND ("terminationDate" IS NULL OR "terminationDate" >= "joinDate"));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_terminated_valid" CHECK ("status" <> 'TERMINATED' OR "terminationDate" IS NOT NULL);
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_names_valid" CHECK (length(trim("firstName")) > 0 AND length(trim("lastName")) > 0);

-- Manager cycles are refused by the database too (walks the chain on every manager change)
CREATE OR REPLACE FUNCTION employee_no_manager_cycle() RETURNS trigger AS $$
DECLARE cur TEXT; hops INT := 0;
BEGIN
  IF NEW."managerId" IS NULL OR NEW."managerId" IS NOT DISTINCT FROM OLD."managerId" THEN RETURN NEW; END IF;
  cur := NEW."managerId";
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW."id" THEN
      RAISE EXCEPTION 'MANAGER_CYCLE: % would manage itself through the chain', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    hops := hops + 1;
    IF hops > 500 THEN RAISE EXCEPTION 'MANAGER_CYCLE: chain too deep' USING ERRCODE = 'check_violation'; END IF;
    SELECT "managerId" INTO cur FROM "Employee" WHERE id = cur;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "Employee_no_manager_cycle" BEFORE INSERT OR UPDATE OF "managerId" ON "Employee" FOR EACH ROW EXECUTE FUNCTION employee_no_manager_cycle();

-- Compensation: non-negative, history-only, no overlapping periods
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_amounts_valid" CHECK (
  "baseSalary" >= 0 AND "housingAllowance" >= 0 AND "transportAllowance" >= 0 AND "otherFixedAllowance" >= 0
  AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
CREATE UNIQUE INDEX "EmployeeCompensation_one_open" ON "EmployeeCompensation" ("employeeId") WHERE "effectiveTo" IS NULL;

CREATE OR REPLACE FUNCTION effective_history_guard() RETURNS trigger AS $$
DECLARE n INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'HISTORY_IMMUTABLE: % rows are never deleted', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- only closing an open row is allowed (effectiveTo NULL -> date); everything else is history
    IF OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS NULL
       OR (to_jsonb(NEW) - 'effectiveTo') <> (to_jsonb(OLD) - 'effectiveTo') THEN
      RAISE EXCEPTION 'HISTORY_IMMUTABLE: % history cannot be edited', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  EXECUTE format('SELECT count(*) FROM %I WHERE "employeeId" = $1 AND id <> $2 AND daterange("effectiveFrom", COALESCE("effectiveTo", ''infinity''::date), ''[]'') && daterange($3, COALESCE($4, ''infinity''::date), ''[]'')', TG_TABLE_NAME)
    INTO n USING NEW."employeeId", NEW."id", NEW."effectiveFrom", NEW."effectiveTo";
  IF n > 0 THEN
    RAISE EXCEPTION 'PERIOD_OVERLAP: % periods cannot overlap', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "EmployeeCompensation_history" BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeCompensation" FOR EACH ROW EXECUTE FUNCTION effective_history_guard();

-- Bank accounts: same history rules, IBAN shape check (letters + digits, 15–34)
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_valid" CHECK ("iban" ~ '^[A-Z]{2}[0-9A-Z]{13,32}$' AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
CREATE UNIQUE INDEX "EmployeeBankAccount_one_open" ON "EmployeeBankAccount" ("employeeId") WHERE "effectiveTo" IS NULL;
CREATE TRIGGER "EmployeeBankAccount_history" BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeBankAccount" FOR EACH ROW EXECUTE FUNCTION effective_history_guard();

-- Attendance
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_times_valid" CHECK (
  ("checkIn" IS NULL OR "checkOut" IS NULL OR "checkOut" >= "checkIn")
  AND ("checkOut" IS NULL OR "checkIn" IS NOT NULL)
  AND ("workMinutes" IS NULL OR "workMinutes" BETWEEN 0 AND 1440));
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_valid" CHECK (
  "workdayStart" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "workdayEnd" ~ '^[0-2][0-9]:[0-5][0-9]$'
  AND "graceMinutes" BETWEEN 0 AND 240 AND "dailyExpectedMinutes" BETWEEN 1 AND 1440);

-- Leave
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_valid" CHECK (
  "endDate" >= "startDate" AND "days" > 0
  AND ("status" <> 'APPROVED' OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL))
  AND ("status" <> 'REJECTED' OR ("rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0))
  AND ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  AND ("status" = 'DRAFT' OR "submittedAt" IS NOT NULL OR "status" = 'CANCELLED'));
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_balance_valid" CHECK ("defaultBalanceDays" IS NULL OR "defaultBalanceDays" >= 0);
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_valid" CHECK ("days" <> 0 AND ("kind" <> 'USAGE' OR ("days" < 0 AND "leaveRequestId" IS NOT NULL)) AND ("kind" <> 'REVERSAL' OR ("days" > 0 AND "leaveRequestId" IS NOT NULL)));
CREATE UNIQUE INDEX "LeaveLedgerEntry_one_usage_per_request" ON "LeaveLedgerEntry" ("leaveRequestId", "kind") WHERE "leaveRequestId" IS NOT NULL;

CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: % is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "LeaveLedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "LeaveLedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Payroll
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_valid" CHECK (
  "periodEnd" >= "periodStart" AND "grossTotal" >= 0 AND "deductionTotal" >= 0 AND "netTotal" >= 0
  AND "netTotal" = "grossTotal" - "deductionTotal"
  AND ("status" NOT IN ('APPROVED', 'PAID', 'CLOSED') OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL))
  AND ("status" NOT IN ('PAID', 'CLOSED') OR ("paidAt" IS NOT NULL AND "paidById" IS NOT NULL)));
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_valid" CHECK (
  "baseSalary" >= 0 AND "housingAllowance" >= 0 AND "transportAllowance" >= 0 AND "otherFixedAllowance" >= 0
  AND "bonuses" >= 0 AND "otherEarnings" >= 0 AND "deductions" >= 0
  AND "grossPay" = "baseSalary" + "housingAllowance" + "transportAllowance" + "otherFixedAllowance" + "bonuses" + "otherEarnings"
  AND "totalDeductions" = "deductions" AND "netPay" = "grossPay" - "totalDeductions" AND "netPay" >= 0);
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_valid" CHECK ("amount" > 0 AND length(trim("reason")) > 0);

-- Approved / paid / closed payroll is frozen (entries, adjustments, totals); payroll is never deleted
CREATE OR REPLACE FUNCTION payroll_period_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYROLL_IMMUTABLE: payroll periods are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('APPROVED', 'PAID', 'CLOSED') AND (
       NEW."grossTotal" IS DISTINCT FROM OLD."grossTotal" OR NEW."deductionTotal" IS DISTINCT FROM OLD."deductionTotal"
    OR NEW."netTotal" IS DISTINCT FROM OLD."netTotal" OR NEW."employeeCount" IS DISTINCT FROM OLD."employeeCount"
    OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd"
    OR NEW."currency" IS DISTINCT FROM OLD."currency")
  THEN
    RAISE EXCEPTION 'PAYROLL_FROZEN: a % payroll cannot change', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('APPROVED', 'PAID', 'CLOSED') AND NEW."status" IN ('DRAFT', 'CALCULATING', 'REVIEW') THEN
    RAISE EXCEPTION 'PAYROLL_FROZEN: an approved payroll cannot be reopened' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('PAID', 'CLOSED') AND NEW."status" NOT IN ('PAID', 'CLOSED') THEN
    RAISE EXCEPTION 'PAYROLL_FROZEN: a paid payroll is final' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayrollPeriod_guard" BEFORE UPDATE OR DELETE ON "PayrollPeriod" FOR EACH ROW EXECUTE FUNCTION payroll_period_guard();

CREATE OR REPLACE FUNCTION payroll_child_guard() RETURNS trigger AS $$
DECLARE st "PayrollStatus";
BEGIN
  SELECT "status" INTO st FROM "PayrollPeriod" WHERE id = COALESCE(NEW."periodId", OLD."periodId");
  IF st IN ('APPROVED', 'PAID', 'CLOSED') THEN
    RAISE EXCEPTION 'PAYROLL_FROZEN: lines of a % payroll cannot change', st USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayrollEntry_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollEntry" FOR EACH ROW EXECUTE FUNCTION payroll_child_guard();
CREATE TRIGGER "PayrollAdjustment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollAdjustment" FOR EACH ROW EXECUTE FUNCTION payroll_child_guard();

-- Recruitment
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_valid" CHECK ("headcount" >= 1 AND ("status" NOT IN ('CLOSED', 'CANCELLED') OR "closedAt" IS NOT NULL));
CREATE UNIQUE INDEX "Candidate_one_per_email" ON "Candidate" ("organizationId", "emailNormalized") WHERE "emailNormalized" IS NOT NULL AND "archivedAt" IS NULL;
ALTER TABLE "Application" ADD CONSTRAINT "Application_valid" CHECK (
  ("salaryExpectation" IS NULL OR "salaryExpectation" >= 0) AND ("noticePeriodDays" IS NULL OR "noticePeriodDays" BETWEEN 0 AND 365)
  AND ("stage" <> 'HIRED' OR ("status" = 'HIRED' AND "hiredEmployeeId" IS NOT NULL))
  AND ("stage" <> 'REJECTED' OR ("status" = 'REJECTED' AND "rejectionReason" IS NOT NULL)));
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_valid" CHECK ("durationMinutes" BETWEEN 5 AND 600);
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_rating" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_valid" CHECK (
  "salary" >= 0 AND "housingAllowance" >= 0 AND "transportAllowance" >= 0
  AND ("status" NOT IN ('APPROVED', 'SENT', 'ACCEPTED') OR "approvedAt" IS NOT NULL)
  AND ("status" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL)
  AND ("status" <> 'REJECTED' OR "rejectedAt" IS NOT NULL)
  AND ("convertedEmployeeId" IS NULL OR "status" = 'ACCEPTED'));
-- one live offer per application (draft..accepted)
CREATE UNIQUE INDEX "Offer_one_live_per_application" ON "Offer" ("applicationId") WHERE "status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED');

-- Performance
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_valid" CHECK (
  "periodEnd" >= "periodStart" AND ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
  AND ("status" NOT IN ('COMPLETED', 'ACKNOWLEDGED') OR ("completedAt" IS NOT NULL AND "rating" IS NOT NULL)));
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_weight" CHECK ("weight" BETWEEN 0 AND 100);
