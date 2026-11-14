-- L-04: measure how fast a new lead gets its first outbound contact.
-- Additive and nullable: existing rows keep NULL (no backfill), so nothing changes for historical leads.
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "firstContactedAt" TIMESTAMP(3);
