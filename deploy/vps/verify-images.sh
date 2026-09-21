#!/usr/bin/env bash
# ============================================================
# verify-images.sh — приёмка задачи :build (DC-1/DC-2 + фронтенды).
#
# Для каждого из 9 backend-образов prj-cleanfine проверяет:
#   1) DC-1: пакет контрактов лежит реальной копией в образе —
#      node_modules/@cleaning-ops/shared/{package.json,dist/constants/events.js};
#   2) DC-2: require() своего рантайм-спецификатора проходит без
#      `Cannot find module` и `ERR_PACKAGE_PATH_NOT_EXPORTED`.
# Для двух фронтендов:
#   3) в образе есть /usr/share/nginx/html/index.html и `nginx -t` проходит.
#
# Контейнеры не запускаются (только `docker run --rm` одноразово).
# Запуск: bash deploy/vps/verify-images.sh
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
RESULTS=""

check_backend() {
  svc="$1"       # имя образа
  spec="$2"      # рантайм-спецификатор shared, который реально импортирует сервис
  img="prj-cleanfine-${svc}:latest"

  # DC-1: файлы пакета внутри образа
  dc1="$(docker run --rm --entrypoint sh "$img" -c \
    'test -f node_modules/@cleaning-ops/shared/dist/constants/events.js \
     && test -f node_modules/@cleaning-ops/shared/package.json \
     && node -e "const p=require(\"./node_modules/@cleaning-ops/shared/package.json\"); \
        const e=p.exports; \
        if(!e[\"./types/*\"].require||!e[\"./constants/*\"].require||!e[\"./package.json\"]) process.exit(3);" \
     && echo DC1-OK' 2>&1 | tail -1)"

  # DC-2: require() спецификатора
  dc2="$(docker run --rm --entrypoint node "$img" -e \
    "try{const m=require('@cleaning-ops/shared/${spec}');console.log('DC2-OK '+Object.keys(m).length+' экспортов')}catch(e){console.log('DC2-FAIL '+e.code+' '+e.message.split('\n')[0]);process.exit(1)}" 2>&1 | tail -1)"

  if [ "$dc1" = "DC1-OK" ] && printf '%s' "$dc2" | grep -q '^DC2-OK'; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}$(printf '  %-16s OK   %-28s %s\n' "$svc" "$spec" "$dc2")"$'\n'
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}$(printf '  %-16s ПРОВАЛ  %-28s dc1=[%s] dc2=[%s]\n' "$svc" "$spec" "$dc1" "$dc2")"$'\n'
  fi
}

check_frontend() {
  svc="$1"
  img="prj-cleanfine-${svc}:latest"

  static_ok="$(docker run --rm --entrypoint sh "$img" -c \
    'test -f /usr/share/nginx/html/index.html && test -d /usr/share/nginx/html/assets && echo STATIC-OK' 2>&1 | tail -1)"
  # nginx -t проверяет и дефолтный конфиг, скопированный Dockerfile.web.
  # ВАЖНО: nginx резолвит имена upstream'ов УЖЕ на `nginx -t`, а контейнеры
  # prj-cleanfine в этой задаче не запускаются — без резолва имён проверка падает
  # на `host not found in upstream "auth"`. Поэтому имена подставляем через
  # --add-host (проверяется синтаксис конфига, а не живость сервисов).
  nginx_ok="$(docker run --rm --entrypoint nginx \
    --add-host auth:127.0.0.1 --add-host files:127.0.0.1 --add-host core:127.0.0.1 \
    --add-host gps:127.0.0.1 --add-host tickets:127.0.0.1 --add-host notifications:127.0.0.1 \
    --add-host materials:127.0.0.1 --add-host schedule:127.0.0.1 --add-host chat:127.0.0.1 \
    "$img" -t 2>&1 | tail -1)"

  if [ "$static_ok" = "STATIC-OK" ] && printf '%s' "$nginx_ok" | grep -q 'test is successful'; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}$(printf '  %-16s OK   статика+nginx: %s\n' "$svc" "$nginx_ok")"$'\n'
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}$(printf '  %-16s ПРОВАЛ  static=[%s] nginx=[%s]\n' "$svc" "$static_ok" "$nginx_ok")"$'\n'
  fi
}

echo "=== приёмка образов prj-cleanfine ==="
echo "--- 9 backend: DC-1 (пакет в образе) + DC-2 (require рантайм-спецификатора) ---"
# Спецификатор — реальный рантайм-импорт сервиса (проверено grep'ом по src).
# auth и files импортируют только `import type`, поэтому у них проверяется
# регрессионно любой существующий подпуть (образ собирается единым паттерном).
# Спецификатор — реальный рантайм-импорт сервиса (проверено grep'ом по src
# И по собранному dist: в эмите остаются bare-спецификаторы, tsc paths не
# переписывает). Список покрывает ВСЕ рантайм-спецификаторы проекта:
#   core types/core | gps constants/events | tickets constants/events+types/tickets
#   notifications constants/events | materials constants/events+types/materials
#   schedule constants/events+types/schedule | chat types/chat
# auth и files импортируют только `import type` — у них проверка регрессионная.
check_backend auth          constants/events
check_backend files         constants/events
check_backend core          types/core
check_backend gps           constants/events
check_backend tickets       types/tickets
check_backend tickets       constants/events
check_backend notifications constants/events
check_backend materials     types/materials
check_backend materials     constants/events
check_backend schedule      types/schedule
check_backend schedule      constants/events
check_backend chat          types/chat
printf '%s' "$RESULTS"

echo "--- 2 фронтенда: статика + nginx -t ---"
RESULTS=""
check_frontend web-admin
check_frontend web-client
printf '%s' "$RESULTS"

echo
echo "=== ИТОГ: успешно ${PASS}, провалено ${FAIL} (ожидается 14 и 0: 12 проверок backend + 2 фронтенда) ==="
[ "$FAIL" -eq 0 ]
