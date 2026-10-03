#!/bin/bash
# ============================================================
# Cleaning Ops — Android-эмулятор · Оператор
#
# Лончер мобильного приложения: при необходимости поднимает
# дев-стенд API (:3001–:3009) и Android-эмулятор, затем запускает
# `flutter run` с автологином:
#   --dart-define=AUTO_LOGIN_EMAIL/PASSWORD — экран входа сам
#   заполняет форму и нажимает «Войти» (login_page.dart).
#
# Дев-стенд локальный, пароли — демо-учётки из test/fixtures/users.json.
# Выбор AVD: CLEANFINE_AVD=<имя> (иначе co-test, иначе первый из списка).
# DRY_RUN=1 — показать шаги и команду без запуска.
# ============================================================
set -u

ROOT="${CLEANFINE_ROOT:-/Users/mac/Desktop/MIMO/Clean}"
APP_DIR="$ROOT/mobile/cleaning-ops-app"
EMAIL="operator@cleaning-ops.com"
PASSWORD="oper123"
# 10.0.2.2 — как эмулятор Android видит хост-машину (localhost — это он сам).
API_HOST="10.0.2.2"

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

# --- эмулятор Android ------------------------------------------------------
ensure_emulator() {
  local dev
  dev="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
  if [ -z "$dev" ]; then
    local avd="${CLEANFINE_AVD:-}"
    if [ -z "$avd" ]; then
      local list
      list="$(emulator -list-avds 2>/dev/null)"
      if echo "$list" | grep -qx 'co-test'; then
        avd="co-test"
      else
        avd="$(echo "$list" | head -1)"
      fi
    fi
    if [ -z "$avd" ]; then
      echo "Нет AVD: emulator -list-avds (создайте в Android Studio → AVD Manager)" >&2
      return 1
    fi
    echo "Поднимаю эмулятор $avd (лог /tmp/cleanfine-emulator.log)…" >&2
    nohup emulator -avd "$avd" -no-snapshot-load >/tmp/cleanfine-emulator.log 2>&1 &
    adb wait-for-device
    local i booted=0
    for i in $(seq 1 120); do
      if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
        booted=1
        break
      fi
      sleep 2
    done
    if [ "$booted" != "1" ]; then
      echo "Эмулятор не поднялся за 4 мин: /tmp/cleanfine-emulator.log" >&2
      return 1
    fi
    dev="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
    [ -z "$dev" ] && { echo "adb не видит устройство" >&2; return 1; }
  fi
  echo "$dev"
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN: ensure_api + ensure_emulator +"
  echo "DRY_RUN flutter run -d <emu-udid> --dart-define=API_HOST=$API_HOST --dart-define=AUTO_LOGIN_EMAIL=$EMAIL --dart-define=AUTO_LOGIN_PASSWORD=$PASSWORD"
  exit 0
fi

command -v adb >/dev/null || { echo "adb не найден: /Users/mac/Android/sdk/platform-tools" >&2; exit 1; }
[ -x "$FLUTTER_BIN" ] || { echo "flutter не найден: /Users/mac/flutter/bin/flutter" >&2; exit 1; }
ensure_api || exit 1
EMU_DEV="$(ensure_emulator)" || exit 1
run_flutter "$EMU_DEV"
