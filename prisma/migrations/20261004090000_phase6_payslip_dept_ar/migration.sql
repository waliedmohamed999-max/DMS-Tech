-- Phase 6 follow-up: Arabic department name in the payroll entry snapshot (payslip AR). Additive, nullable.
ALTER TABLE "PayrollEntry" ADD COLUMN "departmentNameAr" TEXT;
