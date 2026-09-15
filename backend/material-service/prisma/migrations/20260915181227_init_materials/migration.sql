-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'TRANSFER', 'WRITE_OFF');

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "defaultConsumption" DOUBLE PRECISION NOT NULL,
    "minStockThreshold" DOUBLE PRECISION NOT NULL,
    "costPerUnit" DOUBLE PRECISION NOT NULL,
    "supplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialStock" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "ticketId" TEXT,
    "userId" TEXT NOT NULL,
    "targetObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumedOperation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "movementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE INDEX "MaterialStock_objectId_idx" ON "MaterialStock"("objectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialStock_materialId_objectId_key" ON "MaterialStock"("materialId", "objectId");

-- CreateIndex
CREATE INDEX "MaterialMovement_materialId_createdAt_idx" ON "MaterialMovement"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialMovement_objectId_createdAt_idx" ON "MaterialMovement"("objectId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsumedOperation_ticketId_idx" ON "ConsumedOperation"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedOperation_operationId_materialId_key" ON "ConsumedOperation"("operationId", "materialId");

-- AddForeignKey
ALTER TABLE "MaterialStock" ADD CONSTRAINT "MaterialStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialMovement" ADD CONSTRAINT "MaterialMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
