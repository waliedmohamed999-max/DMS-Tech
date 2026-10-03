
-- AlterTable
ALTER TABLE "EmployeeBankAccount" ADD COLUMN     "ibanCiphertext" TEXT,
ADD COLUMN     "ibanIv" TEXT,
ADD COLUMN     "ibanKeyVersion" INTEGER,
ADD COLUMN     "ibanLast4" TEXT,
ADD COLUMN     "ibanTag" TEXT,
ALTER COLUMN "iban" DROP NOT NULL;

-- AlterTable
ALTER TABLE "IntegrationOutbox" ADD COLUMN     "correlationId" TEXT;

-- CreateTable
CREATE TABLE "DeploymentMarker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentMarker_pkey" PRIMARY KEY ("id")
);


-- ---------------------------------------------------------------------------------------------
-- Phase 10 guards (hand-written)
-- ---------------------------------------------------------------------------------------------
-- a bank account is never left without its IBAN: plaintext (legacy) OR a complete encrypted record
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_iban_present_chk" CHECK (
  "iban" IS NOT NULL OR ("ibanCiphertext" IS NOT NULL AND "ibanIv" IS NOT NULL AND "ibanTag" IS NOT NULL AND "ibanKeyVersion" IS NOT NULL AND "ibanLast4" IS NOT NULL)
);
-- one environment marker per database, from a closed list, never changed or deleted
ALTER TABLE "DeploymentMarker" ADD CONSTRAINT "DeploymentMarker_single_chk" CHECK ("id" = 1);
ALTER TABLE "DeploymentMarker" ADD CONSTRAINT "DeploymentMarker_env_chk" CHECK ("environment" IN ('development', 'test', 'staging', 'production'));
CREATE TRIGGER deployment_marker_immutable BEFORE UPDATE OR DELETE ON "DeploymentMarker" FOR EACH ROW EXECUTE FUNCTION append_only_guard('DEPLOYMENT_MARKER_IMMUTABLE');
