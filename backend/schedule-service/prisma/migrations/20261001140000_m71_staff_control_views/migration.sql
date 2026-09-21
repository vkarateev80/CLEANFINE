-- М7.1 — read-модели отчётов schedule-service (CQRS-read, решение архитектора №4):
-- контроль персонала — check-in/check-out, явки, авто-закрытия, длительность смены.
--
-- ПОЧЕМУ VIEW, А НЕ ТАБЛИЦА. Отчёт по сменам — агрегат над уже существующими сменами
-- (`ScheduleEvent`): второго места правды быть не должно (то же решение, что в
-- material-service и ticket-service).
--
-- ГЕОЗОНЫ. Признак «смена открыта в геозоне объекта» здесь НЕ считается: координаты
-- check-in хранятся в schedule-service, а сами геозоны — в gps-service, у которого своя
-- БД. Вхождение в геозону принудительно проверяется в момент отметки
-- (`ScheduleService.checkIn` → gps-service, вне зоны — 400 «Вы находитесь вне зоны
-- объекта»), поэтому в этих представлениях лежат только УСПЕШНЫЕ отметки. Фактические
-- входы/выходы и нахождение в геозоне считает gps-service в своих read-моделях
-- (`staff_geofence_sessions`) — админка складывает обе части в один отчёт.
--
-- МАРШРУТЫ. Смена привязана к графику, у которого может быть `routeId` (core-service):
-- маршрут — это набор точек/этажей, своей таблицы у него в этой БД нет. Поэтому в
-- представлениях есть `route_id`, а «пройден ли маршрут» — вопрос gps-service
-- (покрытие точками трека). Так сделано намеренно: склеить маршрут и трек в SQL нельзя.
--
-- NULL-семантика `lateness_minutes`: отрицательное значение — пришёл раньше плана,
-- NULL — отметки не было (смена пропущена или ещё не открыта).

-- Смена с расчётными показателями: одна строка на смену.
CREATE OR REPLACE VIEW staff_shift_fact AS
SELECT
    e."id"           AS event_id,
    e."userId"       AS user_id,
    s."objectId"     AS object_id,
    s."routeId"      AS route_id,
    e."date"::date   AS day,
    e."status"::text AS status,
    e."plannedStart" AS planned_start,
    e."checkInAt"    AS check_in_at,
    e."checkOutAt"   AS check_out_at,
    e."ticketId"     AS ticket_id,
    e."checkOutReason" AS check_out_reason,
    -- Опоздание в минутах: плюс — позже плана, минус — раньше. NULL — отметки не было.
    CASE
      WHEN e."checkInAt" IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM (e."checkInAt" - e."plannedStart")) / 60)::int
    END AS lateness_minutes,
    -- Длительность смены в минутах; NULL — смена не закрыта или не открывалась.
    CASE
      WHEN e."checkInAt" IS NULL OR e."checkOutAt" IS NULL THEN NULL
      ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (e."checkOutAt" - e."checkInAt")) / 60))::int
    END AS worked_minutes,
    -- Закрыта без участия оператора (авто check-out, М4.5).
    (e."checkOutReason" IS NOT NULL) AS auto_closed,
    -- Опоздал больше чем на 15 минут — порог, по которому считается «нарушение явки».
    -- Порог выбран здесь: план М7.1 задаёт разрез, но не норматив.
    (e."checkInAt" IS NOT NULL AND e."checkInAt" > e."plannedStart" + interval '15 minutes') AS late
FROM "ScheduleEvent" e
JOIN "Schedule" s ON s."id" = e."scheduleId";

-- Контроль персонала: сотрудник + объект + день (гранулярность строки отчёта).
CREATE OR REPLACE VIEW staff_control AS
SELECT
    user_id,
    object_id,
    route_id,
    day,
    COUNT(*)::int AS shifts_count,
    SUM(CASE WHEN status IN ('CHECKED_IN', 'CHECKED_OUT') THEN 1 ELSE 0 END)::int AS checked_in_count,
    SUM(CASE WHEN status = 'CHECKED_OUT' THEN 1 ELSE 0 END)::int AS checked_out_count,
    SUM(CASE WHEN status = 'MISSED' THEN 1 ELSE 0 END)::int AS missed_count,
    SUM(CASE WHEN auto_closed THEN 1 ELSE 0 END)::int AS auto_closed_count,
    SUM(CASE WHEN late THEN 1 ELSE 0 END)::int AS late_count,
    SUM(CASE WHEN worked_minutes IS NOT NULL THEN worked_minutes ELSE 0 END)::int AS worked_minutes_sum,
    SUM(CASE WHEN worked_minutes IS NOT NULL THEN 1 ELSE 0 END)::int AS worked_measured_count,
    MAX(lateness_minutes) AS max_lateness_minutes,
    MIN(check_in_at) AS first_check_in_at,
    MAX(check_out_at) AS last_check_out_at
FROM staff_shift_fact
GROUP BY user_id, object_id, route_id, day;

-- KPI смен для дашборда: одна строка, считается в SQL.
CREATE OR REPLACE VIEW staff_control_totals AS
SELECT
    COUNT(*)::int AS shifts_total,
    SUM(CASE WHEN status IN ('CHECKED_IN', 'CHECKED_OUT') THEN 1 ELSE 0 END)::int AS checked_in_count,
    SUM(CASE WHEN status = 'CHECKED_OUT' THEN 1 ELSE 0 END)::int AS checked_out_count,
    SUM(CASE WHEN status = 'PLANNED' THEN 1 ELSE 0 END)::int AS planned_count,
    SUM(CASE WHEN status = 'MISSED' THEN 1 ELSE 0 END)::int AS missed_count,
    SUM(CASE WHEN auto_closed THEN 1 ELSE 0 END)::int AS auto_closed_count,
    SUM(CASE WHEN late THEN 1 ELSE 0 END)::int AS late_count,
    SUM(CASE WHEN worked_minutes IS NOT NULL THEN worked_minutes ELSE 0 END)::int AS worked_minutes_sum,
    SUM(CASE WHEN worked_minutes IS NOT NULL THEN 1 ELSE 0 END)::int AS worked_measured_count
FROM staff_shift_fact;
