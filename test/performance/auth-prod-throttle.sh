#!/usr/bin/env bash
# Второй экземпляр auth-service с БОЕВЫМИ лимитами входа (сценарий М7.2 auth.js).
#
# Зачем: дев-стенд (stand.sh) поднимает auth-service с THROTTLE_LOGIN_LIMIT=1000, иначе
# e2e-набор упирается в лимит логинов (см. test/README.md). Из-за этого шторм логинов
# на основном стенде лимитом не ограничен, и порог сценария `auth.js` там не проверить —
# это не дефект продукта, а свойство тестового окружения.
#
# Поэтому сценарий меряется против отдельного экземпляра того же кода и той же БД,
# но с лимитами по умолчанию (5 логинов/мин на IP, 100 запросов/мин). Порт 3101,
# отдельные логи. Основной стенд (nginx :8080, сервисы :3001-:3009) не затрагивается.
#
# Использование:
#   bash test/performance/auth-prod-throttle.sh start
#   bash test/performance/auth-prod-throttle.sh stop
#   bash test/performance/auth-prod-throttle.sh status
set -euo pipefail

ROOT="/Users/mac/Documents/DSH/DOMCLEAR"
PORT="${AUTH_PROD_PORT:-3101}"
LOG="${AUTH_PROD_LOG:-$HOME/.cleaning-ops/logs/auth-service-prodthrottle.log}"
PIDFILE="$HOME/.cleaning-ops/run/auth-prod-throttle.pid"

is_up() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && exec 3>&- 2>/dev/null; }

start() {
  if is_up; then
    echo "уже слушает :$PORT (pid $(cat "$PIDFILE" 2>/dev/null || echo '?'))"
    return 0
  fi
  mkdir -p "$(dirname "$LOG")" "$(dirname "$PIDFILE")"
  (
    cd "$ROOT/backend/auth-service"
    # Явно боевые лимиты: значения из configuration.ts по умолчанию (5/100/60000).
    # SCHEDULE_CRON_ENABLED не нужен — это auth; прочие значения берутся из ../../.env.
    PORT="$PORT" \
      THROTTLE_LOGIN_LIMIT=5 \
      THROTTLE_GLOBAL_LIMIT=100 \
      THROTTLE_TTL_MS=60000 \
      nohup node dist/main.js >>"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
  )
  for _ in $(seq 1 30); do
    is_up && break
    sleep 1
  done
  if is_up; then
    echo "auth-service (боевые лимиты) → http://127.0.0.1:$PORT/api, pid $(cat "$PIDFILE"), лог $LOG"
  else
    echo "НЕ ПОДНЯЛСЯ за 30 с — см. $LOG" >&2
    tail -20 "$LOG" >&2 || true
    exit 1
  fi
}

stop() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE")"
    if kill "$pid" 2>/dev/null; then echo "остановлен pid $pid"; fi
    rm -f "$PIDFILE"
  else
    echo "pid-файл не найден — экземпляр, вероятно, не запущен"
  fi
}

status() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"email":"admin","password":"admin123"}' || true)"
  echo "порт :$PORT → логин отвечает $code (201 = поднят)"
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "использование: $0 {start|stop|status}" >&2; exit 2 ;;
esac
