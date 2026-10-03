#!/bin/bash
# ============================================================
# Cleaning Ops — Владелец (портал заказчика)
#
# Лончер Cleaning Ops: при необходимости поднимает dev-сервер
# (5174) и открывает страницу входа с автологином
# (?email=…&password=… — параметры очищаются из URL после входа).
#
# Дев-стенд локальный, пароли — демо-учётки из test/fixtures/users.json.
# ============================================================
set -u

ROOT="${CLEANFINE_ROOT:-/Users/mac/Desktop/MIMO/Clean}"
PORT=5174
APP_DIR="frontend/web-client"
EXTRA_ARGS=""
URL="http://localhost:5174/login?email=owner%40cleanfine.ru&password=owner123"

ensure_server() {
  if curl -s -o /dev/null --max-time 2 "http://localhost:${PORT}/"; then
    return 0
  fi
  echo "Поднимаю dev-сервер :${PORT} (лог /tmp/cleanfine-vite-${PORT}.log)…"
  (
    cd "$ROOT/$APP_DIR" || exit 1
    # shellcheck disable=SC2086
    nohup env npm_config_manage_package_manager_versions=false \
      pnpm exec vite --port "$PORT" $EXTRA_ARGS \
      >"/tmp/cleanfine-vite-${PORT}.log" 2>&1 &
  )
  local i
  for i in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null --max-time 2 "http://localhost:${PORT}/"; then
      return 0
    fi
  done
  echo "Сервер не поднялся — смотрите /tmp/cleanfine-vite-${PORT}.log" >&2
  return 1
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN URL: $URL"
  exit 0
fi

ensure_server || exit 1
open "$URL"
exit 0
