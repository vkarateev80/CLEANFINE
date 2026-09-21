#!/usr/bin/env bash
# ============================================================
# gen-env.sh — генерация deploy/vps/.env.vps из шаблона.
#
# System Design v2, §2 и §7 шаг 1; PRD FR-7. Что делает:
#   1) читает deploy/vps/.env.vps.example;
#   2) подставляет вместо __CHANGE_ME__ свежие секреты `openssl rand -hex`;
#   3) согласовывает креды MinIO (MINIO_ROOT_PASSWORD == MINIO_SECRET_KEY)
#      и подставляет пароль БД внутрь всех *_DATABASE_URL и RABBITMQ_URL;
#   4) JWT_ACCESS_SECRET и JWT_REFRESH_SECRET — оба ≥32 символов и РАЗНЫЕ
#      (требование backend/auth-service/src/config/validation.ts при NODE_ENV=production).
#
# Идемпотентность (FR-20): если .env.vps уже существует — скрипт НИЧЕГО не делает
# и выходит с кодом 0. Перезапись — только явным флагом --force.
#
# Запуск (из КОРНЯ репозитория): bash deploy/vps/gen-env.sh [--force]
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$KIT_DIR/.env.vps.example"
TARGET="$KIT_DIR/.env.vps"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      echo "Использование: bash deploy/vps/gen-env.sh [--force]"
      echo "  --force  перезаписать существующий deploy/vps/.env.vps"
      exit 0
      ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "ОШИБКА: не найден openssl — без него секреты не сгенерировать (FR-13)." >&2
  exit 1
fi

if [ -f "$TARGET" ] && [ "$FORCE" -ne 1 ]; then
  echo "deploy/vps/.env.vps уже существует — оставляю без изменений (идемпотентность)."
  echo "Перезаписать: bash deploy/vps/gen-env.sh --force"
  exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
  echo "ОШИБКА: не найден шаблон $TEMPLATE" >&2
  exit 1
fi

# Секреты. 24 байта = 48 hex-символов (пароли), 32 байта = 64 hex-символа (JWT).
DB_PASSWORD="$(openssl rand -hex 24)"
RABBITMQ_PASSWORD="$(openssl rand -hex 24)"
MINIO_ROOT_PASSWORD="$(openssl rand -hex 24)"
JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
JWT_REFRESH_SECRET="$(openssl rand -hex 32)"

# Различность JWT-секретов: openssl даёт независимые значения, но проверяем явно —
# валидатор auth падает, если access и refresh совпали.
while [ "$JWT_REFRESH_SECRET" = "$JWT_ACCESS_SECRET" ]; do
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
done

echo "==> генерация $TARGET из $TEMPLATE"

# Подстановка через python: так корректно и безопасно обрабатываются и пароли,
# и строки URL (пароль входит и в *_DATABASE_URL, и в RABBITMQ_URL).
# Секреты передаются через окружение дочернего процесса, не через argv.
GEN_DB_PASSWORD="$DB_PASSWORD" \
GEN_RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD" \
GEN_MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
GEN_JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
GEN_JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
python3 - "$TEMPLATE" "$TARGET" <<'PY'
import os
import sys

template_path, target_path = sys.argv[1], sys.argv[2]
db = os.environ['GEN_DB_PASSWORD']
rabbit = os.environ['GEN_RABBITMQ_PASSWORD']
minio = os.environ['GEN_MINIO_ROOT_PASSWORD']
jwt_access = os.environ['GEN_JWT_ACCESS_SECRET']
jwt_refresh = os.environ['GEN_JWT_REFRESH_SECRET']

lines = open(template_path, encoding='utf-8').read().splitlines()
out = []

for line in lines:
    # Плейсхолдер пароля БД внутри URL: заменяем на реальный пароль.
    if line.startswith(('DATABASE_URL=', 'FILE_DATABASE_URL=', 'CORE_DATABASE_URL=',
                        'GPS_DATABASE_URL=', 'TICKET_DATABASE_URL=',
                        'NOTIFICATION_DATABASE_URL=', 'MATERIAL_DATABASE_URL=',
                        'SCHEDULE_DATABASE_URL=', 'CHAT_DATABASE_URL=')):
        line = line.replace('admin:__CHANGE_ME__@postgres:5432',
                            f'admin:{db}@postgres:5432')
    elif line.startswith('DB_PASSWORD='):
        line = f'DB_PASSWORD={db}'
    elif line.startswith('RABBITMQ_PASSWORD='):
        line = f'RABBITMQ_PASSWORD={rabbit}'
    elif line.startswith('RABBITMQ_URL='):
        line = line.replace('admin:__CHANGE_ME__@rabbitmq:5672',
                            f'admin:{rabbit}@rabbitmq:5672')
    elif line.startswith('MINIO_ROOT_PASSWORD='):
        line = f'MINIO_ROOT_PASSWORD={minio}'
    elif line.startswith('MINIO_SECRET_KEY='):
        line = f'MINIO_SECRET_KEY={minio}'
    elif line.startswith('JWT_ACCESS_SECRET='):
        line = f'JWT_ACCESS_SECRET={jwt_access}'
    elif line.startswith('JWT_REFRESH_SECRET='):
        line = f'JWT_REFRESH_SECRET={jwt_refresh}'
    out.append(line)

text = '\n'.join(out) + '\n'

leftovers = [ln.split('=', 1)[0] for ln in out
             if '__CHANGE_ME__' in ln and not ln.lstrip().startswith('#')]
if leftovers:
    print('ОШИБКА: не заполнены плейсхолдеры в переменных: '
          + ', '.join(leftovers), file=sys.stderr)
    sys.exit(1)

open(target_path, 'w', encoding='utf-8').write(text)
PY

chmod 600 "$TARGET"

# Самопроверка: секреты на месте, JWT различаются, длины достаточны (NFR-5).
check() { grep -q "^$1=" "$TARGET" || { echo "ОШИБКА: в .env.vps нет переменной $1" >&2; exit 1; }; }
for v in DB_PASSWORD RABBITMQ_PASSWORD MINIO_ROOT_PASSWORD MINIO_SECRET_KEY \
         JWT_ACCESS_SECRET JWT_REFRESH_SECRET DATABASE_URL RABBITMQ_URL \
         MINIO_ACCESS_KEY MINIO_PUBLIC_URL SERVICE_AUTH_PASSWORD; do
  check "$v"
done

access_len=$(grep '^JWT_ACCESS_SECRET=' "$TARGET" | cut -d= -f2- | wc -c)
refresh_len=$(grep '^JWT_REFRESH_SECRET=' "$TARGET" | cut -d= -f2- | wc -c)
access_val=$(grep '^JWT_ACCESS_SECRET=' "$TARGET" | cut -d= -f2-)
refresh_val=$(grep '^JWT_REFRESH_SECRET=' "$TARGET" | cut -d= -f2-)
[ "$access_len" -ge 33 ] || { echo "ОШИБКА: JWT_ACCESS_SECRET короче 32 символов" >&2; exit 1; }
[ "$refresh_len" -ge 33 ] || { echo "ОШИБКА: JWT_REFRESH_SECRET короче 32 символов" >&2; exit 1; }
[ "$access_val" != "$refresh_val" ] || { echo "ОШИБКА: JWT-секреты совпали" >&2; exit 1; }

grep -q "MINIO_SECRET_KEY=$(grep '^MINIO_ROOT_PASSWORD=' "$TARGET" | cut -d= -f2-)" "$TARGET" \
  || { echo "ОШИБКА: MINIO_SECRET_KEY != MINIO_ROOT_PASSWORD" >&2; exit 1; }

echo "==> готово: $TARGET (права 600, файл в .gitignore — в git не попадёт)"
echo "    Проверить конфигурацию: docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml config >/dev/null"
echo "    Поднять стенд:          bash deploy/vps/bootstrap.sh"
