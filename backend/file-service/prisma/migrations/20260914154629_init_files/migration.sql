-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('PHOTOS', 'PLANS', 'AVATARS', 'DOCUMENTS');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('FLOOR_PLAN', 'TICKET', 'CHAT_MESSAGE', 'AVATAR', 'DOCUMENT');

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "bucket" "Bucket" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "thumbnailKey" TEXT,
    "watermarked" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "takenAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_attachments_entityType_entityId_idx" ON "file_attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "file_attachments_fileId_idx" ON "file_attachments"("fileId");

-- CreateIndex
CREATE INDEX "stored_files_createdAt_idx" ON "stored_files"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_bucket_objectKey_key" ON "stored_files"("bucket", "objectKey");

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
