-- Phase 11 (P11-B): secure offboarding. When the linked system account was disabled because the employee left
-- (claim column: set once, by the status change or by the HR sweep on the effective date). Additive, nullable.
ALTER TABLE "Employee" ADD COLUMN "accessRevokedAt" TIMESTAMP(3);
