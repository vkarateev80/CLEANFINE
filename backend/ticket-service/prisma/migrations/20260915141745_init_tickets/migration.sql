-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('planned', 'unscheduled', 'emergency');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('new', 'assigned', 'in_progress', 'paused', 'completed', 'verified', 'rejected', 'closed', 'overdue');

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "status" "TicketStatus" NOT NULL DEFAULT 'new',
    "objectId" TEXT NOT NULL,
    "roomId" TEXT,
    "assigneeId" TEXT,
    "createdBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "assignedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "overdueAt" TIMESTAMP(3),
    "reactionDeadline" TIMESTAMP(3),
    "arrivalDeadline" TIMESTAMP(3),
    "completionDeadline" TIMESTAMP(3),
    "operationsTotal" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_operation_completions" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "photoUrl" TEXT,
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_operation_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_idx" ON "tickets"("assigneeId");

-- CreateIndex
CREATE INDEX "tickets_objectId_idx" ON "tickets"("objectId");

-- CreateIndex
CREATE INDEX "tickets_type_idx" ON "tickets"("type");

-- CreateIndex
CREATE INDEX "tickets_status_createdAt_idx" ON "tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_status_arrivalDeadline_idx" ON "tickets"("status", "arrivalDeadline");

-- CreateIndex
CREATE INDEX "tickets_status_completionDeadline_idx" ON "tickets"("status", "completionDeadline");

-- CreateIndex
CREATE INDEX "ticket_assignments_ticketId_idx" ON "ticket_assignments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_assignments_assigneeId_idx" ON "ticket_assignments"("assigneeId");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_idx" ON "ticket_comments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_operation_completions_ticketId_idx" ON "ticket_operation_completions"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_operation_completions_ticketId_operationId_key" ON "ticket_operation_completions"("ticketId", "operationId");

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_operation_completions" ADD CONSTRAINT "ticket_operation_completions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
