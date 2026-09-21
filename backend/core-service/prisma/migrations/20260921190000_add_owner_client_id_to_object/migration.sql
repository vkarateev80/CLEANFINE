-- AlterTable
ALTER TABLE "objects" ADD COLUMN     "ownerClientId" TEXT;

-- CreateIndex
CREATE INDEX "objects_ownerClientId_idx" ON "objects"("ownerClientId");

