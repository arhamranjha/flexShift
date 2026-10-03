-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'PRACTISING_CERTIFICATE';

-- AlterTable
ALTER TABLE "FacilityBranch" ALTER COLUMN "country" SET DEFAULT 'NZ';

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "currency" SET DEFAULT 'NZD';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'NZ',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NZD',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Pacific/Auckland';

-- AlterTable
ALTER TABLE "ReliefProfile" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'NZ';

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NZD';

