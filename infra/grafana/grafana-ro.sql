-- Роль Grafana только для чтения (бизнес-панель CLEANFINE, 19.10.2026).
-- Запуск: psql -d cleaning_ops -v pw=<пароль> -f grafana-ro.sql (скрипт apply.sh).
-- Идемпотентно: повторный запуск обновляет пароль и права.

SELECT 'CREATE ROLE grafana_ro LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') \gexec

ALTER ROLE grafana_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10 PASSWORD :'pw';
-- Даже ошибочный запрос панели не изменит данные и не повиснет.
ALTER ROLE grafana_ro SET default_transaction_read_only = on;
ALTER ROLE grafana_ro SET statement_timeout = '15s';

-- Пользователи (auth): только безопасные столбцы — без хэшей паролей, PIN и биометрии.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_ro;
GRANT CONNECT ON DATABASE cleaning_ops TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT (id, "fullName", role, "isActive") ON users TO grafana_ro;
