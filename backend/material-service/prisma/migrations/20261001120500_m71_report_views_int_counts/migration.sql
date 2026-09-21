-- М7.1 — приведение счётчиков read-моделей отчётов к int.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ МИГРАЦИЯ. `COUNT(*)` в PostgreSQL возвращает bigint, а драйвер
-- отдаёт его в JS как BigInt. Prisma `$queryRaw` доводит BigInt до сервиса, и
-- `JSON.stringify` на нём падает («Do not know how to serialize a BigInt») — то есть
-- отчёт отдавал бы 500 на первом же запросе с непустыми данными. `::int` снимает
-- проблему на уровне read-модели, а не в сериализаторе: счётчик операций заведомо
-- помещается в 2^31.
--
-- ПОЧЕМУ DROP + CREATE, А НЕ OR REPLACE. `CREATE OR REPLACE VIEW` запрещает менять тип
-- колонки (`cannot change data type of view column "operations" from bigint to integer`,
-- SQLSTATE 42P16), а нам нужен именно другой тип. Представления — не таблицы: данных в
-- них нет, `DROP VIEW` ничего не теряет, и колонки снаружи адресуются по имени, поэтому
-- порядок и состав колонок сохранены один в один.
--
-- Миграция идемпотентна: `DROP VIEW IF EXISTS` + `CREATE VIEW` дают то же определение
-- при повторном применении и на чистой БД, где первая миграция уже создала
-- представления с bigint.

DROP VIEW IF EXISTS report_material_consumption_daily;
DROP VIEW IF EXISTS report_material_consumption_totals;
DROP VIEW IF EXISTS report_material_consumption;

CREATE VIEW report_material_consumption AS
SELECT
    m."objectId"           AS object_id,
    m."materialId"         AS material_id,
    mat."name"             AS material_name,
    mat."unit"             AS unit,
    mat."costPerUnit"      AS cost_per_unit,
    SUM(m."quantity")      AS consumed_quantity,
    COUNT(*)::int          AS operations,
    MIN(m."createdAt")     AS first_movement_at,
    MAX(m."createdAt")     AS last_movement_at
FROM "MaterialMovement" m
JOIN "Material" mat ON mat."id" = m."materialId"
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY m."objectId", m."materialId", mat."name", mat."unit", mat."costPerUnit";

CREATE VIEW report_material_consumption_daily AS
SELECT
    date_trunc('day', m."createdAt")::date AS day,
    m."objectId"                          AS object_id,
    m."materialId"                        AS material_id,
    mat."name"                            AS material_name,
    mat."unit"                            AS unit,
    mat."costPerUnit"                     AS cost_per_unit,
    SUM(m."quantity")                     AS consumed_quantity,
    COUNT(*)::int                         AS operations
FROM "MaterialMovement" m
JOIN "Material" mat ON mat."id" = m."materialId"
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE VIEW report_material_consumption_totals AS
SELECT
    m."objectId"       AS object_id,
    COUNT(DISTINCT m."materialId")::int AS materials_count,
    SUM(m."quantity")  AS consumed_quantity,
    COUNT(*)::int      AS operations,
    MAX(m."createdAt") AS last_movement_at
FROM "MaterialMovement" m
WHERE m."type" IN ('OUT', 'WRITE_OFF')
GROUP BY m."objectId";
