-- М7.1 — read-модели отчётов gps-service (CQRS-read, решение архитектора №4):
-- контроль персонала по геозонам и маршрутам — входы/выходы, нахождение на объекте,
-- активность по маршруту.
--
-- ПОЧЕМУ В GPS, А НЕ В SCHEDULE. Геозоны (`geofences`) и треки (`gps_tracks`) живут в БД
-- `cleaning_ops_gps`, у schedule-service своя БД: join между отметкой смены и полигоном
-- объекта в SQL невозможен. Поэтому «был ли сотрудник в геозоне» считается здесь —
-- единственным сервисом, у которого есть геометрия и PostGIS.
--
-- ГЕОМЕТРИЯ ТОЛЬКО В SQL. Prisma не поддерживает PostGIS-типы (`location` объявлен как
-- `Unsupported`), поэтому в read-моделях геометрия не хранится и не отдаётся: наружу
-- идут полигон-независимые числа — время на объекте, число входов, активные дни,
-- покрытие по часам. Это же избавляет от сериализации WKB в ответе API.
--
-- ПОРОГ «ПОСЕЩЕНИЕ». Точка внутри геозоны — ещё не работа на объекте: курьер идёт
-- транзитом. Посещением считается пара «вошёл/вышел» длительностью ≥ 5 минут
-- (`GEOFENCE_MIN_VISIT_MINUTES` в `reports.service.ts` — одно место правды в коде).
-- Порог задан константой, а не параметром: представление должно быть детерминированным,
-- а настройку отчёта незачем хранить в БД.
--
-- ПОЧЕМУ ВЫБОРКА ТОЧЕК ИДЁТ ПО КОЛЬЦУ, А НЕ ВНУТРИ РАДИУСА. Если брать только точки в
-- радиусе 2 км от границы (`ST_DWithin`), пара «вошёл/вышел» не закрывается: точка,
-- которой сотрудник вышел, уже далеко от объекта, в радиус не попадает, выход не
-- находится, и посещение остаётся незакрытым (а значит не дотягивает до порога).
-- Поэтому радиус работает как КОЛЬЦО: пока сотрудник был рядом, точки идут полностью,
-- плюс добавляется первая точка ЗА кольцом — она и закрывает последний выход.
--
-- ПОЧЕМУ ПРЕДЫДУЩАЯ ТОЧКА ИЩЕТСЯ ПОДЗАПРОСОМ, А НЕ CTE С РАВЕНСТВОМ ВРЕМЕНИ.
-- `gps_tracks.timestamp` — `timestamptz` с микросекундами. Соединение «строка кольца ↔
-- строка таблицы» по равенству времени (`scope.ts = t."timestamp"`) молча теряло строки
-- с ненулевыми микросекундами: выход не находился, посещение не закрывалось. Подзапрос
-- «последняя точка раньше текущей» от равенства времени не зависит.
--
-- ПАРЫ «ВОХОД/ВЫХОД». Соседние точки каждого сотрудника упорядочены по времени (`lag`),
-- состояние «внутри» вычисляется ST_Contains по границе геозоны; переход true → false
-- закрывает посещение.
--
-- ПОЧЕМУ РАДИУС СТОИТ ТОЛЬКО В WHERE, А НЕ В ON. Условие `ST_DWithin` в `ON` отбрасывало
-- ровно те точки, ради которых кольцо и заведено: точка выхода далека от объекта (в
-- замере сценария — 4140 м), `ON` её не пропускал, и выход снова не находился. В `WHERE`
-- условие работает как задумано: «рядом сейчас ИЛИ рядом была предыдущая точка».

-- DROP + CREATE, а не OR REPLACE: состав колонок менялся, а `CREATE OR REPLACE` не
-- переписывает тела зависимых представлений. Представления данных не хранят — DROP
-- ничего не теряет, и повторный запуск миграции идемпотентен.
DROP VIEW IF EXISTS staff_geofence_totals;
DROP VIEW IF EXISTS staff_geofence_control;
DROP VIEW IF EXISTS staff_route_activity;
DROP VIEW IF EXISTS staff_geofence_sessions;

-- Посещения геозон: сотрудник + объект, время входа/выхода и длительность.
CREATE VIEW staff_geofence_sessions AS
WITH points AS (
  SELECT
    t.user_id,
    t."timestamp" AS ts,
    g.id   AS geofence_id,
    g.object_id,
    g.name AS geofence_name,
    ST_Contains(g.boundary, t.location) AS inside,
    LAG(ST_Contains(g.boundary, t.location)) OVER (
      PARTITION BY t.user_id, g.id ORDER BY t."timestamp"
    ) AS prev_inside
  FROM gps_tracks t
  JOIN geofences g
    ON g.boundary IS NOT NULL
   AND t.location IS NOT NULL
  WHERE ST_DWithin(g.boundary::geography, t.location::geography, 2000)
     OR ST_DWithin(
          g.boundary::geography,
          (
            SELECT prev.location
            FROM gps_tracks prev
            WHERE prev.user_id = t.user_id
              AND prev."timestamp" < t."timestamp"
              AND prev.location IS NOT NULL
            ORDER BY prev."timestamp" DESC
            LIMIT 1
          )::geography,
          2000
        )
),
entries AS (
  SELECT user_id, geofence_id, object_id, geofence_name, ts AS entered_at
  FROM points
  WHERE inside AND (prev_inside IS NULL OR prev_inside = false)
),
exits AS (
  SELECT user_id, geofence_id, ts AS exited_at
  FROM points
  WHERE inside = false AND prev_inside = true
)
SELECT
  e.user_id,
  e.object_id,
  e.geofence_id,
  e.geofence_name,
  e.entered_at,
  x.exited_at,
  date_trunc('day', e.entered_at)::date AS day,
  CASE
    WHEN x.exited_at IS NULL THEN NULL
    ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (x.exited_at - e.entered_at)) / 60))::int
  END AS dwell_minutes
FROM entries e
LEFT JOIN LATERAL (
  SELECT exited_at
  FROM exits x
  WHERE x.user_id = e.user_id AND x.geofence_id = e.geofence_id AND x.exited_at > e.entered_at
  ORDER BY x.exited_at ASC
  LIMIT 1
) x ON true;

-- Контроль персонала по геозонам: сотрудник + объект + день.
-- `visits_count` — посещения от порога (транзит отсечён), `presence_count` — ВСЕ
-- появления в геозоне, включая транзит и незакрытые сессии (сотрудник ещё на объекте).
-- Первая версия считала появление предикатом `dwell IS NULL OR dwell >= порога` и теряла
-- короткие закрытые сессии — то есть ровно транзит, который presence_count и должен
-- показывать. Разница `presence_count − visits_count` и есть транзит: показатель полезен
-- бригадиру («заезжал, но не работал»).
CREATE VIEW staff_geofence_control AS
SELECT
    user_id,
    object_id,
    day,
    COUNT(*)::int AS sessions_count,
    SUM(CASE WHEN dwell_minutes IS NOT NULL AND dwell_minutes >= 5 THEN 1 ELSE 0 END)::int AS visits_count,
    COUNT(*)::int AS presence_count,
    SUM(COALESCE(dwell_minutes, 0))::int AS dwell_minutes_sum,
    MIN(entered_at) AS first_entered_at,
    MAX(COALESCE(exited_at, entered_at)) AS last_seen_at
FROM staff_geofence_sessions
GROUP BY user_id, object_id, day;

-- Активность сотрудника по дням: сколько точек трека он отдал и в скольких геозонах был.
-- Это «маршрут» в измеримой форме: покрытие рабочего дня точками и объектами.
CREATE VIEW staff_route_activity AS
SELECT
    t.user_id,
    date_trunc('day', t."timestamp")::date AS day,
    COUNT(*)::int AS points_count,
    MIN(t."timestamp") AS first_point_at,
    MAX(t."timestamp") AS last_point_at,
    GREATEST(0, ROUND(EXTRACT(EPOCH FROM (MAX(t."timestamp") - MIN(t."timestamp"))) / 60))::int AS span_minutes,
    COUNT(DISTINCT g.object_id)::int AS objects_visited
FROM gps_tracks t
LEFT JOIN geofences g
  ON g.boundary IS NOT NULL
 AND g.object_id IS NOT NULL
 AND ST_Contains(g.boundary, t.location)
WHERE t.location IS NOT NULL
GROUP BY t.user_id, date_trunc('day', t."timestamp")::date;

-- KPI контроля персонала по GPS для дашборда: одна строка.
CREATE VIEW staff_geofence_totals AS
SELECT
    (SELECT COUNT(*)::int FROM staff_geofence_control) AS control_rows,
    (SELECT COALESCE(SUM(visits_count), 0)::int FROM staff_geofence_control) AS visits_count,
    (SELECT COALESCE(SUM(dwell_minutes_sum), 0)::int FROM staff_geofence_control) AS dwell_minutes_sum,
    (SELECT COUNT(DISTINCT user_id)::int FROM staff_route_activity) AS tracked_users_count,
    (SELECT COALESCE(SUM(points_count), 0)::int FROM staff_route_activity) AS points_count,
    (SELECT COALESCE(SUM(objects_visited), 0)::int FROM staff_route_activity) AS objects_visited_count;
