#!/usr/bin/env bash
# ============================================================
# bootstrap.sh — полный прогон развёртывания стенда prj-cleanfine.
#
# System Design v2, §7 (шаги 0…6); PRD FR-9, FR-13…FR-20.
# Запускать ИЗ КОРНЯ репозитория: bash deploy/vps/bootstrap.sh
#
# Порядок: prerequisites → env → build → инфраструктура → миграции →
#          приложения → seed → смоук.
#
# Идемпотентность (FR-20): повторный прогон не пересоздаёт секреты, не дублирует
# seed, `prisma migrate deploy` отвечает «already in sync», образы берутся из кэша.
#
# ДЕМО-СТЕНД cleaning-ops-vps НЕ ТРОГАЕТСЯ (NFR-1, AC-5): скрипт работает только
# с compose-проектом prj-cleanfine и не останавливает/не пересоздаёт чужие
# контейнеры. Единственное касание — read-only проверка числа контейнеров.
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$KIT_DIR/../.." && pwd)"
ENV_FILE="$KIT_DIR/.env.vps"
COMPOSE_FILE="$KIT_DIR/docker-compose.yml"

# Кэши инструментов внутри рабочей копии: npm по умолчанию пишет в ~/.npm,
# BuildKit — в ~/.docker/buildx; в средах с файловой песочницей это недоступно.
export npm_config_cache="${npm_config_cache:-$ROOT_DIR/.cache/npm}"
export BUILDX_CONFIG="${BUILDX_CONFIG:-$ROOT_DIR/.cache/buildx}"
mkdir -p "$npm_config_cache" "$BUILDX_CONFIG"

cd "$ROOT_DIR"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

TAILNET_IP=100.109.185.14
DEMO_PROJECT=cleaning-ops-vps

# ---------------------------------------------------------------- 0) Prerequisites
log "0/6 Предварительные проверки (FR-13)"

command -v docker >/dev/null 2>&1 || fail "не найден docker"
docker compose version >/dev/null 2>&1 || fail "не найден docker compose v2"
command -v openssl >/dev/null 2>&1 || fail "не найден openssl (нужен gen-env.sh)"

docker info >/dev/null 2>&1 || fail "docker daemon недоступен"

# Tailnet-адрес должен существовать: публикация идёт только на него (NFR-2).
if ! ip -4 addr show 2>/dev/null | grep -q "$TAILNET_IP"; then
  fail "на хосте нет адреса $TAILNET_IP — публикация стенда невозможна (NFR-2)"
fi

# Порты стенда обязаны быть свободны. Занятость = чужой стенд или прошлый запуск.
# Матчим точный номер порта в конце адреса (форматы ss: `0.0.0.0:8090`,
# `100.109.185.14:8090`, `[::]:8090`).
CONFLICTS="$(ss -ltn 2>/dev/null | awk '{print $4}' \
  | grep -E ':(8090|8091|811[1-9]|812[0-1])$' || true)"
if [ -n "$CONFLICTS" ]; then
  echo "$CONFLICTS"
  fail "порты 8090/8091/8111–8119/8120–8121 уже заняты"
fi

# Базовая линия демо-стенда: запоминаем, сколько его контейнеров было ДО.
DEMO_BEFORE="$(docker ps --format '{{.Names}}' | grep -c "^${DEMO_PROJECT}-" || true)"
log "демо-стенд ${DEMO_PROJECT}: контейнеров ДО = ${DEMO_BEFORE} (не трогаем)"

# ---------------------------------------------------------------------- 1) env
log "1/6 Окружение и сборка образов (FR-7, FR-14)"
bash "$KIT_DIR/gen-env.sh"

# NODE_ENV=production в сессии заставляет pnpm пропускать devDependencies
# (typescript для shared, vite для фронтов) — для host-шагов его нейтрализуем.
if [ ! -d node_modules ]; then
  log "установка зависимостей монорепо"
  ( unset NODE_ENV; pnpm install --frozen-lockfile 2>/dev/null || pnpm install )
fi

log "сборка shared/dist (обязательна ДО docker build: Dockerfile копируют shared/dist)"
# pnpm в ограниченных средах может не запуститься (нужен каталог в $XDG_DATA_HOME),
# поэтому при неудаче падаем на прямой вызов tsc из воркспейса.
if ! ( unset NODE_ENV; pnpm build:shared ); then
  echo "pnpm build:shared не сработал — собираю shared напрямую через tsc"
  ( unset NODE_ENV; ./shared/node_modules/.bin/tsc -b shared/tsconfig.json --force )
fi
[ -f shared/dist/constants/events.js ] || fail "shared/dist/constants/events.js не собран"

# Сборка идёт ГРУППАМИ с ожиданием снижения load average: хост делится с
# демо-стендом, и общий `docker compose build` роняет его healthcheck (§3.1 README).
log "сборка образов (9 backend + 2 фронтенда; берегущими группами, первый прогон долгий)"
bash "$KIT_DIR/build-vps.sh"

# ------------------------------------------------------------- 2) Инфраструктура
log "2/6 Инфраструктура (FR-15): postgres, redis, rabbitmq, minio"
"${COMPOSE[@]}" up -d postgres redis rabbitmq minio

log "ожидание healthy (до 300 с)"
deadline=$(( $(date +%s) + 300 ))
while :; do
  healthy="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' 2>/dev/null \
    | grep -cE '^(postgres|redis|rabbitmq|minio) healthy$' || true)"
  [ "$healthy" -eq 4 ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    "${COMPOSE[@]}" ps
    "${COMPOSE[@]}" logs --tail=40 postgres redis rabbitmq minio
    fail "инфраструктура не стала healthy за 300 с"
  fi
  sleep 5
done
echo "инфраструктура: 4/4 healthy"
echo "initdb создаёт 8 БД + PostGIS/pg_trgm только при ПЕРВОМ создании тома (FR-15)."

# ----------------------------------------------------------------- 3) Миграции
log "3/6 Миграции Prisma по 9 сервисам, каждый со своей БД (FR-16, ADR-7)"
for svc in auth files core gps tickets notifications materials schedule chat; do
  printf '  %-14s ' "$svc"
  if "${COMPOSE[@]}" run --rm --no-deps "$svc" npx prisma migrate deploy >/dev/null 2>&1; then
    echo "ok"
  else
    "${COMPOSE[@]}" run --rm --no-deps "$svc" npx prisma migrate deploy
    fail "миграции $svc не применились"
  fi
done

# -------------------------------------------------------------- 4) Приложения
log "4/6 Приложения (FR-17): 9 backend + 2 фронтенда"
"${COMPOSE[@]}" up -d auth files core gps tickets notifications materials schedule chat web-admin web-client

# Проверка КАЖДОГО сервиса с ОДНИМ повтором.
# Зачем: при первом старте сервис может успеть обратиться к postgres до того, как
# тот начнёт принимать соединения, и упасть на инициализации Prisma
# (наблюдалось на этом стенде: core — P2024 «Timed out fetching a new connection
# from the connection pool», schedule — P1001 «Can't reach database server at
# postgres:5432»). Контейнеры объявлены без политики restart, поэтому такое
# падение оставило бы сервис лежать навсегда. Логика: пробуем свой эндпоинт
# каждого сервиса, при отсутствии ответа перезапускаем его один раз.
log "проверка живости 9 сервисов (с одним повтором для упавших)"
declare -A PROBE=(
  [auth]="3001 /api/auth/me"
  [files]="3002 /api/files/health/ping"
  [core]="3003 /api/objects"
  [gps]="3004 /api/gps/tracks"
  [tickets]="3005 /api/tickets"
  [notifications]="3006 /api/notifications"
  [materials]="3007 /api/materials"
  [schedule]="3008 /api/schedule"
  [chat]="3009 /api/chat/chats"
)

probe_service() {  # $1 = сервис; печатает HTTP-код или ERR
  local svc="$1" spec port path
  spec="${PROBE[$svc]}"; port="${spec%% *}"; path="${spec#* }"
  docker exec "prj-cleanfine-${svc}-1" node -e \
    "require('http').get({host:'127.0.0.1',port:${port},path:'${path}'},r=>{console.log(r.statusCode);process.exit(0)}).on('error',()=>{console.log('ERR');process.exit(0)})" \
    2>/dev/null || echo ERR
}

deadline=$(( $(date +%s) + 120 ))
while :; do
  down=""
  for svc in auth files core gps tickets notifications materials schedule chat; do
    [ "$(probe_service "$svc")" = "ERR" ] && down="${down} ${svc}"
  done
  [ -z "$down" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "перезапускаю не ответившие сервисы:${down}"
    # shellcheck disable=SC2086
    "${COMPOSE[@]}" up -d --force-recreate ${down}
    sleep 30
    break
  fi
  sleep 5
done

fails=""
for svc in auth files core gps tickets notifications materials schedule chat; do
  code="$(probe_service "$svc")"
  printf '  %-14s HTTP=%s\n' "$svc" "$code"
  [ "$code" = "ERR" ] && fails="${fails} ${svc}"
done
if [ -n "$fails" ]; then
  echo "--- логи не ответивших:${fails} ---"
  # shellcheck disable=SC2086
  "${COMPOSE[@]}" logs --tail=40 ${fails}
  fail "сервисы не отвечают:${fails}"
fi

# ------------------------------------------------------------------- 5) Seed
log "5/6 Seed демо-пользователей (FR-10, FR-18, §6)"
bash "$KIT_DIR/seed.sh"

# Демо-наполнение портала: владелец + его объект. Без этого портал показывает
# «Объект не подключён» — привязка идёт сопоставлением Object.clientName с
# fullName пользователя (см. deploy/vps/README.md §5.1). Скрипт идемпотентен и
# работает через API уже поднятого стенда, поэтому запускается ЗДЕСЬ, а не в seed.sh
# (тот работает через Prisma внутри контейнера). Падение не должно ломать bootstrap:
# демо-данные — не критичный шаг, поэтому без `set -e`-эскалации.
log "демо-наполнение портала (владелец + объект)"
if ! node "$ROOT_DIR/scripts/seed/seed-demo-object.mjs"; then
  echo "ПРЕДУПРЕЖДЕНИЕ: демо-наполнение портала не выполнено (стенд продолжает работать)."
  echo "Повторить вручную: node scripts/seed/seed-demo-object.mjs"
fi

# ------------------------------------------------------------------ 6) Смоук
log "6/6 Смоук (§12)"
"${COMPOSE[@]}" ps

echo
echo "-- AC-1: контейнеры проекта"
running="$("${COMPOSE[@]}" ps --status running --format '{{.Service}}' | wc -l)"
echo "   running: $running (ожидается 15)"

echo "-- AC-2: HTTP фронтендов"
for pair in "8090 web-admin" "8091 web-client"; do
  set -- $pair
  printf '   %-11s http://%s:%s/ → %s\n' "$2" "$TAILNET_IP" "$1" \
    "$(curl -s -o /dev/null -w '%{http_code}' "http://${TAILNET_IP}:$1/" || echo 'нет ответа')"
done

echo "-- AC-3: логин admin@cleaning-ops.com"
LOGIN_CODE="$(curl -s -o /tmp/cf-login.json -w '%{http_code}' -X POST \
  "http://${TAILNET_IP}:8090/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@cleaning-ops.com","password":"admin123"}' || true)"
echo "   POST /api/auth/login → $LOGIN_CODE (ожидается 201)"
if [ "$LOGIN_CODE" = "201" ]; then
  TOKEN="$(python3 -c 'import json;print(json.load(open("/tmp/cf-login.json"))["accessToken"])' 2>/dev/null || true)"
  ME_CODE="$(curl -s -o /tmp/cf-me.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
    "http://${TAILNET_IP}:8090/api/auth/me" || true)"
  ROLE="$(python3 -c 'import json;print(json.load(open("/tmp/cf-me.json")).get("role"))' 2>/dev/null || true)"
  echo "   GET  /api/auth/me     → $ME_CODE, role=$ROLE (ожидается 200/ADMIN)"
  rm -f /tmp/cf-login.json /tmp/cf-me.json
fi

echo "-- AC-4: 9 сервисов на tailnet 8111–8119"
probe() { printf '   %s %-42s → %s\n' "$1" "$2" "$(curl -s -o /dev/null -w '%{http_code}' "http://${TAILNET_IP}:$1$2" || echo 000)"; }
probe 8111 /api/auth/me
probe 8112 /api/files/health/ping
probe 8113 /api/objects
probe 8114 /api/gps/tracks
probe 8115 /api/tickets
probe 8116 /api/notifications
probe 8117 /api/materials
probe 8118 /api/schedule
probe 8119 /api/chat/chats

echo "-- DC-3: ошибки резолва контрактов в логах (ожидается пусто)"
if "${COMPOSE[@]}" logs 2>&1 | grep -E 'Cannot find module|ERR_PACKAGE_PATH_NOT_EXPORTED'; then
  fail "в логах есть ошибки резолва @cleaning-ops/shared"
else
  echo "   чисто"
fi

echo "-- AC-5: демо-стенд не изменён"
DEMO_AFTER="$(docker ps --format '{{.Names}}' | grep -c "^${DEMO_PROJECT}-" || true)"
echo "   ${DEMO_PROJECT}: контейнеров ДО=$DEMO_BEFORE, ПОСЛЕ=$DEMO_AFTER"
[ "$DEMO_BEFORE" = "$DEMO_AFTER" ] || fail "число контейнеров демо-стенда изменилось!"

log "Готово. Доступы: http://${TAILNET_IP}:8090 (web-admin), http://${TAILNET_IP}:8091 (портал)"
echo "Подробности, демо-креды и откат — deploy/vps/README.md"
