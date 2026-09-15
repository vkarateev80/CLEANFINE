-- CreateEnum
CREATE TYPE "ScheduleEventStatus" AS ENUM ('PLANNED', 'CHECKED_IN', 'CHECKED_OUT', 'MISSED');

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "objectId" TEXT,
    "routeId" TEXT,
    "name" TEXT NOT NULL,
    "recurrence" JSONB NOT NULL,
    "assignees" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEvent" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleEventStatus" NOT NULL DEFAULT 'PLANNED',
    "userId" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "ticketId" TEXT,
    "checkOutReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Schedule_isActive_idx" ON "Schedule"("isActive");

-- CreateIndex
CREATE INDEX "Schedule_objectId_idx" ON "Schedule"("objectId");

-- CreateIndex
CREATE INDEX "ScheduleEvent_date_idx" ON "ScheduleEvent"("date");

-- CreateIndex
CREATE INDEX "ScheduleEvent_userId_date_idx" ON "ScheduleEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "ScheduleEvent_status_plannedStart_idx" ON "ScheduleEvent"("status", "plannedStart");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEvent_scheduleId_date_userId_key" ON "ScheduleEvent"("scheduleId", "date", "userId");

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
