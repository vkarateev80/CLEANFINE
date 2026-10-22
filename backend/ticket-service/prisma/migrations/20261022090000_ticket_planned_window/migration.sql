-- Окно смены плановой заявки (22.10.2026). schedule-service создаёт заявку в полночь
-- на смену, которая начнётся, например, в 18:00: раньше дедлайн прибытия ставился
-- «+15 минут от создания», и заявка просрочивалась в 00:15 с ночным push.
-- Теперь у таких заявок дедлайн выполнения — конец смены (plannedEnd).

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "plannedStart" TIMESTAMP(3),
ADD COLUMN "plannedEnd" TIMESTAMP(3);
