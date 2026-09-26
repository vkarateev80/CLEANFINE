-- М6 API-пробелы: roomId в идемпотентности операций + завершение помещения.
-- 1. roomId в ticket_operation_completions (пустая строка = без помещения;
--    NULL в Postgres уникальным индексом не считается, поэтому default '').
-- 2. Смена уникальности (ticketId, operationId) → (ticketId, operationId, roomId).
-- 3. Таблица ticket_room_completions — серверная отметка «помещение завершено».
-- 4. roomsTotal на tickets — ожидаемое число помещений (как operationsTotal).

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "roomsTotal" INTEGER;

-- AlterTable
ALTER TABLE "ticket_operation_completions" ADD COLUMN "roomId" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "ticket_operation_completions_ticketId_operationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ticket_operation_completions_ticketId_operationId_roomId_key" ON "ticket_operation_completions"("ticketId", "operationId", "roomId");

-- CreateTable
CREATE TABLE "ticket_room_completions" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_room_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_room_completions_ticketId_roomId_key" ON "ticket_room_completions"("ticketId", "roomId");

-- CreateIndex
CREATE INDEX "ticket_room_completions_ticketId_idx" ON "ticket_room_completions"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_room_completions" ADD CONSTRAINT "ticket_room_completions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
