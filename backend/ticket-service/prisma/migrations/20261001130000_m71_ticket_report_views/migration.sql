-- М7.1 — read-модели отчётов ticket-service (CQRS-read, решение архитектора №4).
--
-- ПОЧЕМУ VIEW, А НЕ ТАБЛИЦА. Отчёт по выполнению заявок — агрегат над уже
-- существующими заявками (`tickets`): второго места правды быть не должно, а проекция,
-- которую пришлось бы чинить при расхождении, не нужна (см. `report_material_consumption`
-- в material-service — то же решение).
--
-- ПОЧЕМУ НЕ ЕДИНОЕ VIEW СКВОЗЬ СЕРВИСЫ. Своя БД (`cleaning_ops_tickets`) и своя
-- Prisma-схема: join с материалами или сменами в SQL невозможен. Сквозной дашборд
-- собирается админкой из read-эндпоинтов сервисов.
--
-- ЧТО ЗНАЧИТ «ВЫПОЛНЕНА». Статусы заявки — state machine из shared (`new → assigned →
-- in_progress → completed → verified → closed`, плюс `paused`, `rejected`, `overdue`).
-- В отчёт выполнения попадают терминальные для работы статусы: completed, verified, closed
-- и overdue (просроченная заявка работу уже не «держит», но обязана быть в отчёте).
-- `rejected` исключён: заявку отклонили, работы по ней не было.
--
-- ВРЕМЯ ЦИКЛА. Считается в двух разрезах, потому что «цикл» для плановой и аварийной
-- заявки — разные отрезки:
--  - cycle_minutes   = completedAt − COALESCE(acceptedAt, assignedAt, createdAt)
--    («сколько работали»: от принятия исполнителем до выполнения);
--  - reaction_minutes = assignedAt − createdAt («сколько ждали реакции»).
-- NULL означает «не измерено» (заявка ещё не выполнена) и в сумму не попадает:
-- COALESCE в `ticket_execution_totals` считает сумму только по строкам со временем.
--
-- ПРОСРОЧКА. `overdue_count` — заявки со статусом `overdue` ИЛИ с проставленным
-- `overdueAt`, но не закрытые: так одна и та же заявка не попадёт в счётчик дважды.

-- Выполнение заявок: объект + тип + статус (гранулярность строки).
CREATE OR REPLACE VIEW ticket_execution AS
SELECT
    t."objectId"  AS object_id,
    t."type"::text AS type,
    t."status"::text AS status,
    COUNT(*)::int AS tickets_count,
    SUM(CASE WHEN t."status" IN ('completed', 'verified', 'closed') THEN 1 ELSE 0 END)::int AS completed_count,
    SUM(
      CASE
        WHEN t."status" = 'overdue' OR (t."overdueAt" IS NOT NULL AND t."closedAt" IS NULL) THEN 1
        ELSE 0
      END
    )::int AS overdue_count,
    SUM(
      CASE
        WHEN t."completedAt" IS NOT NULL THEN
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              t."completedAt" - COALESCE(t."acceptedAt", t."assignedAt", t."createdAt")
            )) / 60
          )
        ELSE 0
      END
    )::numeric AS cycle_minutes_sum,
    SUM(
      CASE
        WHEN t."completedAt" IS NOT NULL THEN 1
        ELSE 0
      END
    )::int AS cycle_measured_count,
    SUM(
      CASE
        WHEN t."assignedAt" IS NOT NULL THEN
          GREATEST(0, EXTRACT(EPOCH FROM (t."assignedAt" - t."createdAt")) / 60)
        ELSE 0
      END
    )::numeric AS reaction_minutes_sum,
    SUM(
      CASE
        WHEN t."assignedAt" IS NOT NULL THEN 1
        ELSE 0
      END
    )::int AS reaction_measured_count,
    MIN(t."createdAt") AS first_created_at,
    MAX(t."createdAt") AS last_created_at
FROM tickets t
WHERE t."status" IN ('completed', 'verified', 'closed', 'overdue')
GROUP BY t."objectId", t."type", t."status";

-- Заявки по дням создания: ряд для графика «создано / выполнено» и для дашборда.
-- День считается в UTC: `createdAt` — `TIMESTAMP(3)` без таймзоны (Prisma пишет UTC),
-- локальная дата дала бы сдвиг на границе суток.
CREATE OR REPLACE VIEW ticket_execution_daily AS
SELECT
    date_trunc('day', t."createdAt")::date AS day,
    t."objectId" AS object_id,
    t."type"::text AS type,
    COUNT(*)::int AS created_count,
    SUM(CASE WHEN t."status" IN ('completed', 'verified', 'closed') THEN 1 ELSE 0 END)::int AS completed_count,
    SUM(
      CASE
        WHEN t."status" = 'overdue' OR (t."overdueAt" IS NOT NULL AND t."closedAt" IS NULL) THEN 1
        ELSE 0
      END
    )::int AS overdue_count,
    SUM(
      CASE
        WHEN t."completedAt" IS NOT NULL THEN
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              t."completedAt" - COALESCE(t."acceptedAt", t."assignedAt", t."createdAt")
            )) / 60
          )
        ELSE 0
      END
    )::numeric AS cycle_minutes_sum,
    SUM(CASE WHEN t."completedAt" IS NOT NULL THEN 1 ELSE 0 END)::int AS cycle_measured_count
FROM tickets t
GROUP BY 1, 2, 3;

-- Сводка по заявкам одной строкой: KPI дашборда без агрегации в приложении.
CREATE OR REPLACE VIEW ticket_execution_totals AS
SELECT
    COUNT(*)::int AS tickets_total,
    SUM(CASE WHEN t."status" = 'new' THEN 1 ELSE 0 END)::int AS new_count,
    SUM(CASE WHEN t."status" IN ('assigned', 'in_progress', 'paused') THEN 1 ELSE 0 END)::int AS in_work_count,
    SUM(CASE WHEN t."status" IN ('completed', 'verified', 'closed') THEN 1 ELSE 0 END)::int AS completed_count,
    SUM(
      CASE
        WHEN t."status" = 'overdue' OR (t."overdueAt" IS NOT NULL AND t."closedAt" IS NULL) THEN 1
        ELSE 0
      END
    )::int AS overdue_count,
    SUM(CASE WHEN t."type" = 'emergency' THEN 1 ELSE 0 END)::int AS emergency_count,
    AVG(
      CASE
        WHEN t."completedAt" IS NOT NULL THEN
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              t."completedAt" - COALESCE(t."acceptedAt", t."assignedAt", t."createdAt")
            )) / 60
          )
        ELSE NULL
      END
    )::numeric AS avg_cycle_minutes,
    SUM(CASE WHEN t."completedAt" IS NOT NULL THEN 1 ELSE 0 END)::int AS cycle_measured_count
FROM tickets t;
