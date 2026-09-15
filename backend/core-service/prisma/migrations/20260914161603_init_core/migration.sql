-- CreateEnum
CREATE TYPE "ObjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "objects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "totalArea" DOUBLE PRECISION NOT NULL,
    "floorsCount" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientContact" TEXT NOT NULL,
    "status" "ObjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "planImageUrl" TEXT,
    "planScale" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "floorType" TEXT NOT NULL,
    "coordsX" INTEGER,
    "coordsY" INTEGER,
    "coordsWidth" INTEGER,
    "coordsHeight" INTEGER,
    "zone" TEXT,
    "techCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_points" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "estimatedTimeMin" INTEGER,

    CONSTRAINT "route_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tech_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_operations" (
    "id" TEXT NOT NULL,
    "techCardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "description" TEXT,
    "equipment" JSONB,
    "estimatedTimeMin" INTEGER NOT NULL,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "requiresQr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tech_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_operation_materials" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "consumptionPerOperation" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "tech_operation_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objects_status_idx" ON "objects"("status");

-- CreateIndex
CREATE INDEX "objects_name_idx" ON "objects"("name");

-- CreateIndex
CREATE INDEX "floors_objectId_idx" ON "floors"("objectId");

-- CreateIndex
CREATE UNIQUE INDEX "floors_objectId_number_key" ON "floors"("objectId", "number");

-- CreateIndex
CREATE INDEX "rooms_floorId_idx" ON "rooms"("floorId");

-- CreateIndex
CREATE INDEX "rooms_techCardId_idx" ON "rooms"("techCardId");

-- CreateIndex
CREATE INDEX "routes_floorId_idx" ON "routes"("floorId");

-- CreateIndex
CREATE INDEX "routes_status_idx" ON "routes"("status");

-- CreateIndex
CREATE INDEX "route_points_routeId_idx" ON "route_points"("routeId");

-- CreateIndex
CREATE INDEX "route_points_roomId_idx" ON "route_points"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "route_points_routeId_orderIndex_key" ON "route_points"("routeId", "orderIndex");

-- CreateIndex
CREATE INDEX "tech_cards_name_idx" ON "tech_cards"("name");

-- CreateIndex
CREATE INDEX "tech_operations_techCardId_idx" ON "tech_operations"("techCardId");

-- CreateIndex
CREATE UNIQUE INDEX "tech_operations_techCardId_orderIndex_key" ON "tech_operations"("techCardId", "orderIndex");

-- CreateIndex
CREATE INDEX "tech_operation_materials_operationId_idx" ON "tech_operation_materials"("operationId");

-- CreateIndex
CREATE INDEX "tech_operation_materials_materialId_idx" ON "tech_operation_materials"("materialId");

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_techCardId_fkey" FOREIGN KEY ("techCardId") REFERENCES "tech_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_operations" ADD CONSTRAINT "tech_operations_techCardId_fkey" FOREIGN KEY ("techCardId") REFERENCES "tech_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_operation_materials" ADD CONSTRAINT "tech_operation_materials_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "tech_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
