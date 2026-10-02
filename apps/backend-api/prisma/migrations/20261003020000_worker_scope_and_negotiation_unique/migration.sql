-- AlterTable
ALTER TABLE "ReliefProfile" ADD COLUMN     "createdByOrganizationId" TEXT;


-- One open negotiation per worker per shift (guards against concurrent duplicate proposals)
CREATE UNIQUE INDEX "ShiftNegotiation_one_active_per_worker"
  ON "ShiftNegotiation" ("shiftId", "reliefWorkerId")
  WHERE "status" IN ('PENDING', 'COUNTERED');
