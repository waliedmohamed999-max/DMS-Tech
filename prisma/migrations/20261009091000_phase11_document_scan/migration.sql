-- Phase 11 (P11-C): document malware-scan state. DocumentVersion stays immutable; scan results live here.
-- CreateTable
CREATE TABLE "DocumentVersionScan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scanner" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "signature" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentVersionScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersionScan_versionId_key" ON "DocumentVersionScan"("versionId");

-- CreateIndex
CREATE INDEX "DocumentVersionScan_status_nextAttemptAt_idx" ON "DocumentVersionScan"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DocumentVersionScan_organizationId_idx" ON "DocumentVersionScan"("organizationId");

-- AddForeignKey
ALTER TABLE "DocumentVersionScan" ADD CONSTRAINT "DocumentVersionScan_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DocumentVersionScan" ADD CONSTRAINT "DocumentVersionScan_status_chk" CHECK ("status" IN ('PENDING', 'CLEAN', 'INFECTED', 'FAILED'));

-- fail-safe: an INFECTED verdict is final (no code path may turn it into CLEAN; a false positive is resolved by
-- uploading a new version, never by editing the verdict). Rows are never deleted.
CREATE OR REPLACE FUNCTION document_scan_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DOCUMENT_SCAN_IMMUTABLE';
  END IF;
  IF OLD."status" = 'INFECTED' AND (NEW."status" <> 'INFECTED' OR NEW."signature" IS DISTINCT FROM OLD."signature") THEN
    RAISE EXCEPTION 'DOCUMENT_SCAN_INFECTED_FINAL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_scan_guard BEFORE UPDATE OR DELETE ON "DocumentVersionScan" FOR EACH ROW EXECUTE FUNCTION document_scan_guard();
