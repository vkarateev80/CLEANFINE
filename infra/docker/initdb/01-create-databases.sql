-- Cleaning Ops: создание БД на сервис (границы микросервисов).
-- Выполняется ТОЛЬКО при первом создании тома postgres_data
-- (/docker-entrypoint-initdb.d). На существующем стенде БД создаются вручную:
--   docker exec cleaning-ops-postgres psql -U admin -d postgres -c "CREATE DATABASE cleaning_ops_gps"
--
-- POSTGRES_DB (cleaning_ops) создаётся самим образом и служит БД auth-service.

CREATE DATABASE cleaning_ops_files;
CREATE DATABASE cleaning_ops_core;
CREATE DATABASE cleaning_ops_gps;
CREATE DATABASE cleaning_ops_tickets;
CREATE DATABASE cleaning_ops_notifications;
CREATE DATABASE cleaning_ops_materials;
CREATE DATABASE cleaning_ops_schedule;

-- PostGIS нужен в каждой БД, где есть геометрия (пока — gps-service).
\connect cleaning_ops_gps
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_core
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_tickets
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_notifications
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_files
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_materials
CREATE EXTENSION IF NOT EXISTS postgis;

\connect cleaning_ops_schedule
CREATE EXTENSION IF NOT EXISTS postgis;
