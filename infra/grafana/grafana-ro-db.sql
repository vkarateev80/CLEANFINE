-- Чтение всех таблиц и отчётных представлений сервиса (смены, заявки, справочники).
-- Запуск в базе сервиса: psql -d <база> -f grafana-ro-db.sql (скрипт apply.sh).
SELECT format('GRANT CONNECT ON DATABASE %I TO grafana_ro', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro;
-- Новые таблицы и представления из будущих миграций (их создаёт admin) — тоже читаемые.
ALTER DEFAULT PRIVILEGES FOR ROLE admin IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro;
