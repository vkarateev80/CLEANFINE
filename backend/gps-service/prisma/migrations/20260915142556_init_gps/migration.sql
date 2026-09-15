-- М3.1: схема gps-service (УСТАВ.md → Агент Backend GPS, п.1).
--
-- Расширение PostGIS нужно до создания geometry-колонок; в БД cleaning_ops_gps
-- оно уже установлено, IF NOT EXISTS делает миграцию идемпотентной.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "gps_tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- user_id без FK: пользователи живут в БД auth-service (cleaning_ops),
    -- gps-service работает со своей БД (cleaning_ops_gps) — кросс-БД FK невозможен.
    "user_id" UUID NOT NULL,
    "location" geometry(Point, 4326),
    "accuracy" DECIMAL(10,2),
    "speed" DECIMAL(10,2),
    "battery_level" INTEGER,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- object_id без FK: объекты живут в БД core-service (cleaning_ops_core),
    -- привязка между сервисами — по id.
    "object_id" UUID NOT NULL,
    "name" VARCHAR(255),
    "boundary" geometry(Polygon, 4326),
    "radius_meters" INTEGER,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_gps_tracks_user_time" ON "gps_tracks"("user_id", "timestamp" DESC);

-- Пространственные GIST-индексы. В schema.prisma они объявлены через
-- ops: raw("gist_geometry_ops_2d") + type: Gist; SQL добавлен вручную, потому что
-- Prisma не генерирует операторный класс для Unsupported-колонки.
CREATE INDEX "idx_gps_tracks_location" ON "gps_tracks" USING GIST ("location");
CREATE INDEX "idx_geofences_boundary" ON "geofences" USING GIST ("boundary");
