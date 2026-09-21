#!/usr/bin/env bash
# ============================================================
# redeploy.sh — быстрый повторный деплой стенда prj-cleanfine.
#
# System Design v2, §2 и §7; PRD FR-11. Отличие от bootstrap.sh: без
# prerequisites-блока, без ожидания healthy «с нуля» и без смоука — только
# то, что нужно после правки кода:
#   1) pnpm build:shared   — дешёвая пересборка контрактов (на случай правок shared);
#   2) docker compose build — пересборка изменившихся образов (кэш сохраняется);
#   3) prisma migrate deploy по 9 сервисам (идемпотентно, «already in sync»);
#   4) up -d               — пересоздание только изменившихся контейнеров.
#
# Демо-стенд cleaning-ops-vps не трогается (NFR-1).
#
# Запуск: bash deploy/vps/redeploy.sh
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$KIT_DIR/../.." && pwd)"
ENV_FILE="$KIT_DIR/.env.vps"
COMPOSE_FILE="$KIT_DIR/docker-compose.yml"

export npm_config_cache="${npm_config_cache:-$ROOT_DIR/.cache/npm}"
export BUILDX_CONFIG="${BUILDX_CONFIG:-$ROOT_DIR/.cache/buildx}"
mkdir -p "$npm_config_cache" "$BUILDX_CONFIG"

cd "$ROOT_DIR"

[ -f "$ENV_FILE" ] || { echo "ОШИБКА: нет $ENV_FILE — сначала bash deploy/vps/gen-env.sh" >&2; exit 1; }

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "==> shared/dist (NODE_ENV нейтрализован, иначе pnpm пропустит devDeps)"
if ! ( unset NODE_ENV; pnpm build:shared ); then
  echo "pnpm build:shared не сработал — собираю shared напрямую через tsc"
  ( unset NODE_ENV; ./shared/node_modules/.bin/tsc -b shared/tsconfig.json --force )
fi

# Группами и с оглядкой на load average: хост делится с демо-стендом (§3.1 README).
echo "==> сборка образов (берегущими группами)"
bash "$KIT_DIR/build-vps.sh"

echo "==> миграции (9 сервисов)"
for svc in auth files core gps tickets notifications materials schedule chat; do
  printf '  %-14s ' "$svc"
  if "${COMPOSE[@]}" run --rm --no-deps "$svc" npx prisma migrate deploy >/dev/null 2>&1; then
    echo ok
  else
    echo "ПРОВАЛ"
    "${COMPOSE[@]}" run --rm --no-deps "$svc" npx prisma migrate deploy
    exit 1
  fi
done

echo "==> применение"
"${COMPOSE[@]}" up -d auth files core gps tickets notifications materials schedule chat web-admin web-client

echo "==> состояние"
"${COMPOSE[@]}" ps

echo
echo "Смоук: bash deploy/vps/bootstrap.sh (шаг 6) или проверки из deploy/vps/README.md"
