#!/usr/bin/env bash
# ============================================================
# seed.sh — демо-пользователи стенда prj-cleanfine.
#
# System Design v2, §6 (решение O3) и PRD FR-10. Запускает КАНОНИЧЕСКИЙ
# scripts/seed/seed-users.mjs в одноразовом контейнере на runtime-образе
# auth-service, с bind-mount двух файлов:
#   * scripts/seed/seed-users.mjs   → /app/scripts/seed/seed-users.mjs:ro
#   * test/fixtures/users.json      → /app/test/fixtures/users.json:ro
#
# Почему это работает (проверено по исходнику скрипта):
#   1) скрипт считает root = <каталог скрипта>/../.. ⇒ /app;
#   2) createRequire('/app/backend/auth-service/package.json') даёт базу резолва,
#      и require('@prisma/client') / require('bcrypt') находятся в /app/node_modules
#      (auth-образ копирует node_modules целиком, оба пакета — dependencies);
#   3) фикстуры читаются из /app/test/fixtures/users.json (смонтированы);
#   4) /app/.env в контейнере нет — loadEnv() молча продолжает, `DATABASE_URL`
#      берётся из окружения контейнера (БД cleaning_ops);
#   5) идемпотентность встроена: upsert по email ⇒ повторный прогон не даёт дублей.
#
# Скрипт и фикстуры НЕ копируются в образ — backend-код не меняется (ADR-4).
# Устаревший /opt-овский seed-users.js НЕ используется: в нём нет PIN и биометрии.
#
# Запуск: bash deploy/vps/seed.sh
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$KIT_DIR/../.." && pwd)"
ENV_FILE="$KIT_DIR/.env.vps"
COMPOSE_FILE="$KIT_DIR/docker-compose.yml"

cd "$ROOT_DIR"

[ -f "$ENV_FILE" ] || { echo "ОШИБКА: нет $ENV_FILE — сначала bash deploy/vps/gen-env.sh" >&2; exit 1; }
[ -f scripts/seed/seed-users.mjs ] || { echo "ОШИБКА: не найден scripts/seed/seed-users.mjs" >&2; exit 1; }
[ -f test/fixtures/users.json ] || { echo "ОШИБКА: не найден test/fixtures/users.json" >&2; exit 1; }

echo "==> seed демо-пользователей (4 роли: ADMIN/SUPERVISOR/OPERATOR/CLIENT)"

# ВАЖНО про пути монтирования (уточнение к §6 System Design).
# Скрипт вычисляет root = <каталог скрипта>/../.. и делает
#   createRequire(join(root, 'backend', 'auth-service', 'package.json'))
# то есть ищет backend/auth-service/node_modules ОТНОСИТЕЛЬНО root.
# В System Design §6 предполагалось монтировать в /app — это было верно для
# СТАРОГО паттерна Dockerfile, где auth-образ имел WORKDIR /app. По целевому
# паттерну ADR-8/D-3 runtime-WORKDIR = /repo/backend/auth-service, а каталога
# /app в образе нет вовсе. Поэтому монтируем в /repo/... — тогда
#   root = /repo, а backend/auth-service/package.json резолвится в
#   /repo/backend/auth-service/node_modules, где лежат @prisma/client и bcrypt.
SEED_MOUNT_ROOT="${SEED_MOUNT_ROOT:-/repo}"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps \
  -v "$ROOT_DIR/scripts/seed/seed-users.mjs:${SEED_MOUNT_ROOT}/scripts/seed/seed-users.mjs:ro" \
  -v "$ROOT_DIR/test/fixtures/users.json:${SEED_MOUNT_ROOT}/test/fixtures/users.json:ro" \
  auth node "${SEED_MOUNT_ROOT}/scripts/seed/seed-users.mjs"

echo "==> проверка количества пользователей (AC-6)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -U admin -d cleaning_ops -tAc 'select count(*) from users' \
  | sed 's/^/    пользователей в БД cleaning_ops: /'
