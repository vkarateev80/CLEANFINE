#!/bin/bash
# ============================================================
# Cleaning Ops — iOS-симулятор · Оператор
#
# Лончер мобильного приложения: при необходимости поднимает
# дев-стенд API (:3001–:3009) и симулятор iPhone, затем запускает
# `flutter run` с автологином:
#   --dart-define=AUTO_LOGIN_EMAIL/PASSWORD — экран входа сам
#   заполняет форму и нажимает «Войти» (login_page.dart).
#
# Дев-стенд локальный, пароли — демо-учётки из test/fixtures/users.json.
# DRY_RUN=1 — показать шаги и команду без запуска.
# ============================================================
set -u

ROOT="${CLEANFINE_ROOT:-/Users/mac/Desktop/MIMO/Clean}"
APP_DIR="$ROOT/mobile/cleaning-ops-app"
EMAIL="operator@cleaning-ops.com"
PASSWORD="oper123"
# iOS-симулятор видит хост-машину как localhost (не 10.0.2.2 — это Android).
API_HOST="localhost"

# flutter/pod/adb не во всех путях .command-сессии (Terminal стартует
# с минимальным PATH) — добавляем явно.
export PATH="$HOME/.local/bin:/Users/mac/flutter/bin:/Users/mac/Android/sdk/platform-tools:/Users/mac/Android/sdk/emulator:$PATH"

FLUTTER_BIN="$(command -v flutter || true)"
[ -z "$FLUTTER_BIN" ] && FLUTTER_BIN="/Users/mac/flutter/bin/flutter"

run_flutter() {
  echo "==> flutter run -d $1 (API_HOST=$API_HOST, автологин $EMAIL)"
  cd "$APP_DIR" || exit 1
  exec "$FLUTTER_BIN" run -d "$1" \
    --dart-define=API_HOST="$API_HOST" \
    --dart-define=AUTO_LOGIN_EMAIL="$EMAIL" \
    --dart-define=AUTO_LOGIN_PASSWORD="$PASSWORD"
}

# --- дев-стенд API ---------------------------------------------------------
ensure_api() {
  if curl -s -o /dev/null --max-time 2 "http://localhost:3001/"; then
    return 0
  fi
  echo "Поднимаю дев-стенд API (логи /tmp/cleanfine-*.log)…" >&2
  (
    cd "$ROOT" || exit 1
    set +u
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    set -u
    for svc in auth-service file-service core-service gps-service ticket-service \
               notification-service material-service schedule-service chat-service; do
      if [ -f "backend/$svc/dist/main.js" ]; then
        (cd "backend/$svc" && nohup node dist/main.js >"/tmp/cleanfine-$svc.log" 2>&1 &)
      else
        echo "  нет backend/$svc/dist/main.js — соберите: pnpm -r build" >&2
      fi
    done
  ) >&2
  local i
  for i in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null --max-time 2 "http://localhost:3001/"; then
      return 0
    fi
  done
  echo "API не поднялся — смотрите /tmp/cleanfine-auth-service.log" >&2
  return 1
}

# --- симулятор -------------------------------------------------------------
ensure_simulator() {
  local udid
  udid="$(xcrun simctl list devices booted | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1 || true)"
  if [ -z "$udid" ]; then
    # Первый доступный iPhone (стопка симуляторов у всех разная —
    # берём по порядку из `available`, без жёстких имён).
    udid="$(xcrun simctl list devices available | awk -F'[()]' '/iPhone/ && /Shutdown/ {print $2; exit}')"
    if [ -z "$udid" ]; then
      echo "Нет доступного iPhone-симулятора: xcrun simctl list devices" >&2
      return 1
    fi
    echo "Поднимаю симулятор ${udid}…" >&2
    xcrun simctl boot "$udid" 2>/dev/null || true
    open -a Simulator 2>/dev/null || true
  fi
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1 || true
  echo "$udid"
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN: ensure_api + ensure_simulator +"
  echo "DRY_RUN flutter run -d <sim-udid> --dart-define=API_HOST=localhost --dart-define=AUTO_LOGIN_EMAIL=$EMAIL --dart-define=AUTO_LOGIN_PASSWORD=$PASSWORD"
  exit 0
fi

command -v xcrun >/dev/null || { echo "xcrun не найден — нужен Xcode" >&2; exit 1; }
[ -x "$FLUTTER_BIN" ] || { echo "flutter не найден: /Users/mac/flutter/bin/flutter" >&2; exit 1; }
ensure_api || exit 1
SIM_UDID="$(ensure_simulator)" || exit 1
run_flutter "$SIM_UDID"
