#!/usr/bin/env bash
# Cleaning Ops — сброс локального стенда к ИЗВЕСТНОМУ состоянию (М7.3).
#
# Зачем. E2E-наборы убирают за собой точечно (по id, созданным прогоном), но если
# уборка хоть раз не сработала (например, недоступен docker exec — дефект окружения
# с qemu-x86_64), на стенде остаются «чужие» строки прошлых прогонов: треки и
# геозоны М3, чаты М5, материалы и заявки М4. Набор их честно видит как чужие данные,
# и прогоны перестают быть воспроизводимыми. Приёмка М7.3 («полный набор зелёный на
# свежем стенде из develop») требует стартовать с пустых баз.
#
# Что делает (порядок важен):
#   1. останавливает девять сервисов, чтобы никто не держал соединения к БД;
#   2. удаляет и пересоздаёт девять баз (имена берутся из .env);
#   3. включает PostGIS в базе gps (в postgis-образе расширение есть только в POSTGRES_DB);
#   4. применяет миграции всех сервисов (prisma migrate deploy — включая SQL-view М7.1
#      и CHECK-ограничение М7.3);
#   5. сеет пользователей из test/fixtures/users.json (идемпотентно);
#   6. чистит объекты MinIO: файлы планов/фото/аватары после сброса баз становятся
#      сиротами (в CI то же самое делает свежий контейнер);
#   7. НЕ поднимает сервисы — это отдельный шаг, чтобы сброс можно было делать и в
#      середине работ (поднимете `~/.cleaning-ops/stand.sh up`).
#
# Использование:
#   scripts/reset-stand.sh                 # базы + MinIO + миграции + seed
#   scripts/reset-stand.sh --keep-minio    # не трогать объекты MinIO
#   scripts/reset-stand.sh --force         # не спрашивать подтверждения
#
# Ограничение: скрипт рассчитан на локальный docker-стенд (контейнер
# cleaning-ops-postgres). Имена контейнера и пользователя переопределяются
# переменными E2E_POSTGRES_CONTAINER / E2E_POSTGRES_USER — теми же, что читают
# SQL-хелперы наборов.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${E2E_POSTGRES_CONTAINER:-cleaning-ops-postgres}"
PGUSER="${E2E_POSTGRES_USER:-admin}"
MINIO_CONTAINER="${MINIO_CONTAINER:-cleaning-ops-minio}"
KEEP_MINIO=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --keep-minio) KEEP_MINIO=1 ;;
    --force) FORCE=1 ;;
    *) echo "неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

# Базы девяти сервисов: имя берём из соответствующей переменной .env, чтобы список
# не разошёлся с docker-compose и CI (там те же имена, джоба e2e).
env_value() {
  local key="$1" line val
  [ -f "$ROOT/.env" ] || return 1
  line="$(grep -E "^${key}=" "$ROOT/.env" | head -1)"
  [ -n "$line" ] || return 1
  val="${line#*=}"
  # .env с обрамляющими кавычками: bash при source снимает их сам, grep — нет,
  # и Prisma получает строку вместе с кавычками («quoted database URL»).
  case "$val" in
    \"*\") val="${val:1:${#val}-2}" ;;
    \'*\') val="${val:1:${#val}-2}" ;;
  esac
  printf '%s' "$val"
}

db_name_from_url() {
  local url="${1%%\?*}"
  printf '%s' "${url##*/}"
}

DB_VARS=(
  DATABASE_URL
  FILE_DATABASE_URL
  CORE_DATABASE_URL
  GPS_DATABASE_URL
  TICKET_DATABASE_URL
  NOTIFICATION_DATABASE_URL
  MATERIAL_DATABASE_URL
  SCHEDULE_DATABASE_URL
  CHAT_DATABASE_URL
)

psql_admin() {
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 "$@"
}

echo "=== 0/7 Проверка окружения ==="
if ! docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -tAc "select 'ok'" >/dev/null 2>&1; then
  echo "ОШИБКА: нет доступа к $CONTAINER (docker exec psql)." >&2
  echo "Проверьте: docker ps и docker exec $CONTAINER psql -U $PGUSER -d postgres -tAc \"select 'ok'\"" >&2
  exit 1
fi
echo "  PostgreSQL доступен: $CONTAINER"

DATABASES=()
for var in "${DB_VARS[@]}"; do
  url="$(env_value "$var")" || { echo "ОШИБКА: $var не найден в .env" >&2; exit 1; }
  DATABASES+=("$(db_name_from_url "$url")")
done
echo "  базы: ${DATABASES[*]}"

if [ "$FORCE" != "1" ]; then
  echo
  echo "Будут УДАЛЕНЫ все данные в этих базах и (по умолчанию) объекты MinIO."
  read -r -p "Продолжить? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "отменено"; exit 0; }
fi

echo
echo "=== 1/7 Остановка сервисов ==="
if [ -x "$HOME/.cleaning-ops/stand.sh" ]; then
  bash "$HOME/.cleaning-ops/stand.sh" stop || true
else
  echo "  ~/.cleaning-ops/stand.sh не найден — рассчитываю, что сервисы уже остановлены"
fi
pkill -f "node dist/main.js" 2>/dev/null && echo "  добиты оставшиеся node dist/main.js" || true
sleep 2

echo
echo "=== 2/7 Пересоздание баз ==="
# WITH (FORCE) — страховка от «database is being accessed by other users»: сервисы
# остановлены, но соединение могло остаться у пула, который ещё не закрылся.
for db in "${DATABASES[@]}"; do
  psql_admin -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);" >/dev/null
  psql_admin -c "CREATE DATABASE \"$db\";" >/dev/null
  echo "  пересоздана $db"
done

echo
echo "=== 3/7 PostGIS в базе gps ==="
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$(db_name_from_url "$(env_value GPS_DATABASE_URL)")" \
  -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null
echo "  расширение postgis включено"

echo
echo "=== 4/7 Миграции сервисов ==="
export PATH="$HOME/.local/bin:$PATH"
for dir in "$ROOT"/backend/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/prisma/schema.prisma" ] || continue
  # Переменную читает CLI Prisma: корневой .env он не видит, поэтому подставляем явно.
  case "$name" in
    auth-service) var=DATABASE_URL ;;
    file-service) var=FILE_DATABASE_URL ;;
    core-service) var=CORE_DATABASE_URL ;;
    gps-service) var=GPS_DATABASE_URL ;;
    ticket-service) var=TICKET_DATABASE_URL ;;
    notification-service) var=NOTIFICATION_DATABASE_URL ;;
    material-service) var=MATERIAL_DATABASE_URL ;;
    schedule-service) var=SCHEDULE_DATABASE_URL ;;
    chat-service) var=CHAT_DATABASE_URL ;;
    *) echo "  пропуск $name: неизвестная БД" >&2; continue ;;
  esac
  (
    cd "$dir" || exit 1
    env "$var=$(env_value "$var")" node node_modules/prisma/build/index.js migrate deploy >/dev/null 2>&1
  ) && echo "  миграции ok: $name" || { echo "  ОШИБКА миграций: $name" >&2; exit 1; }
done

echo
echo "=== 5/7 Seed пользователей ==="
node "$ROOT/scripts/seed/seed-users.mjs" | tail -3

echo
echo "=== 6/7 Объекты MinIO ==="
if [ "$KEEP_MINIO" = "1" ]; then
  echo "  пропущено (--keep-minio)"
elif docker exec "$MINIO_CONTAINER" sh -c 'rm -rf /data/avatars /data/documents /data/photos /data/plans' 2>/dev/null; then
  echo "  бакеты avatars/documents/photos/plans очищены"
else
  echo "  ПРЕДУПРЕЖДЕНИЕ: не удалось очистить MinIO ($MINIO_CONTAINER) — файлы останутся сиротами" >&2
fi

echo
echo "=== 7/7 Итог ==="
for var in "${DB_VARS[@]}"; do
  db="$(db_name_from_url "$(env_value "$var")")"
  tables="$(docker exec "$CONTAINER" psql -U "$PGUSER" -d "$db" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d ' ')"
  echo "  $db: таблиц public = $tables"
done
echo
echo "Стенд сброшен к известному состоянию: пустые базы, применённые миграции, засеянные пользователи."
echo "Дальше: bash ~/.cleaning-ops/stand.sh up   (поднимет контейнеры, сервисы и веб-контур)"
echo "Прогон приёмки: cd test && pnpm exec playwright test --project=api && pnpm exec playwright test --project=web"
