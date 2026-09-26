-- М6 API-пробел: у смены нет планового окончания (plannedEnd) — UI показывал
-- факт checkOutAt вместо плана. Добавляем колонку и бэкфиллим существующие
-- смены как plannedStart + 8 часов (DEFAULT_SHIFT_MINUTES); новые пишутся
-- генерацией с учётом recurrence.durationMin.
-- Имя таблицы — "ScheduleEvent" (Prisma без @@map в schedule-service).

-- AlterTable
ALTER TABLE "ScheduleEvent" ADD COLUMN "plannedEnd" TIMESTAMP(3);

-- Backfill: plannedStart + 8 hours
UPDATE "ScheduleEvent"
SET "plannedEnd" = "plannedStart" + INTERVAL '8 hours'
WHERE "plannedEnd" IS NULL;

-- Теперь колонка обязательная
ALTER TABLE "ScheduleEvent" ALTER COLUMN "plannedEnd" SET NOT NULL;
