-- М7.1 — read-модели отчётов (CQRS-read, решение архитектора №4).
--
-- ПОЧЕМУ VIEW, А НЕ ТАБЛИЦА. Отчёт по расходу — это агрегат над уже существующими
-- движениями (`MaterialMovement`): отдельного хранилища у него нет и быть не должно,
-- иначе появится второе место правды. VIEW даёт read-модель без денормализации и без
-- проекции, которую пришлось бы чинить при расхождении.
--
-- ПОЧЕМУ НЕ ЕДИНОЕ VIEW СКВОЗЬ СЕРВИСЫ. У каждого сервиса своя БД
-- (`cleaning_ops_materials`, `cleaning_ops_tickets`, …) и своя Prisma-схема, поэтому
-- join между материалами и заявками в SQL невозможен — это факт схемы, а не деталь
-- реализации. Read-модели создаются в сервисе-владельце данных, а сквозной доска действий
-- собирает админка из read-эндпоинтов сервисов.
--
-- ПОЧЕМУ ТРИ ГРАНУЛЯРНОСТИ. Требование М7.1 — разрез «объект / период / материал».
-- Одним представлением это не выражается: у агрегата разная зернистость. Поэтому
--  - report_material_consumption      — расход по объекту + материалу (без даты);
--  - report_material_consumption_daily — тот же расход в разрезе дня (график по времени);
--  - report_material_consumption_totals — строка на объект (для карточек доски действий).
--
-- Денежные величины (`cost`) в представления НЕ входят намеренно: цена материала
-- (`Material.costPerUnit`) — свойство справочника, а не движения, и может быть
-- пересмотрена задним числом. VIEW отдаёт количество, стоимость считает сервис по
-- актуальной цене справочника — то же правило, что и в `MaterialsService.report`.
--
-- `operations` — число движений, попавших в строку. Это и есть «количество операций»:
-- ручной расход из админки и автосписание по техкарте (М4.2) создают по движению
-- каждое, поэтому счётчик честно отражает обе причины.

-- Расход по объекту и материалу: OUT (расход) и WRITE_OFF (списание).
CREATE OR REPLACE VIEW report_material_consumption AS
SELECT
    m."objectId"           AS object_id,
    m."materialId"         AS material_id,
    mat."name"             AS material_name,
    mat."unit"             AS unit,
    mat."costPerUnit"      AS cost_per_unit,
    SUM(m."quantity")      AS consumed_quantity,
    COUNT(*)               AS operations,
    MIN(m."createdAt")     AS first_movement_at,
    MAX(m."createdAt")     AS last_movement_at
FROM "MaterialMovement" m
JOIN "Material" mat ON mat."id" = m."materialId"
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY m."objectId", m."materialId", mat."name", mat."unit", mat."costPerUnit";

-- Тот же расход в разрезе дня (UTC): по нему строится график «расход за период».
-- День считается в UTC, потому что `createdAt` хранится без таймзоны
-- (`TIMESTAMP(3)`, Prisma пишет UTC) — локальная дата дала бы сдвиг на границе суток.
CREATE OR REPLACE VIEW report_material_consumption_daily AS
SELECT
    date_trunc('day', m."createdAt")::date AS day,
    m."objectId"                          AS object_id,
    m."materialId"                        AS material_id,
    mat."name"                            AS material_name,
    mat."unit"                            AS unit,
    mat."costPerUnit"                     AS cost_per_unit,
    SUM(m."quantity")                     AS consumed_quantity,
    COUNT(*)                              AS operations
FROM "MaterialMovement" m
JOIN "Material" mat ON mat."id" = m."materialId"
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY 1, 2, 3, 4, 5, 6;

-- Итог по объекту: одна строка на объект, где были расход или списание.
-- Нужен доске действий (KPI по объектам) и как «шапка» отчёта без разбивки по материалам.
CREATE OR REPLACE VIEW report_material_consumption_totals AS
SELECT
    m."objectId"       AS object_id,
    COUNT(DISTINCT m."materialId") AS materials_count,
    SUM(m."quantity")  AS consumed_quantity,
    COUNT(*)           AS operations,
    MAX(m."createdAt") AS last_movement_at
FROM "MaterialMovement" m
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY m."objectId";
