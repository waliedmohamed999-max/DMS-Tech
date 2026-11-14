-- Campaign reports count "qualified" by when a lead first qualified, not by its current status
-- (a qualified lead that is later lost must still count).
-- Additive and nullable: existing rows keep NULL (no backfill) and are counted by the old current-status rule.
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "qualifiedAt" TIMESTAMP(3);
