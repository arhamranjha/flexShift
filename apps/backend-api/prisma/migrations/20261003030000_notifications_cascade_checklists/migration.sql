-- AlterTable
ALTER TABLE "ComplianceDocument" ADD COLUMN     "expiryNotified30" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiryNotified7" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "requiredDocTypes" "DocType"[] DEFAULT ARRAY[]::"DocType"[];

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "cascadeStage" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextCascadeAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

