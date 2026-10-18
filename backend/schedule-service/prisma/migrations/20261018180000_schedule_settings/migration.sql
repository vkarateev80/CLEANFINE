-- Настройки расписания (18.10.2026): часовой пояс организации, одна строка "default".
-- Строку не вставляем: без неё сервис берёт SCHEDULE_TIME_ZONE (по умолчанию
-- Europe/Moscow), первая правка в админке создаёт её upsert-ом.

-- CreateTable
CREATE TABLE "ScheduleSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ScheduleSettings_pkey" PRIMARY KEY ("id")
);
