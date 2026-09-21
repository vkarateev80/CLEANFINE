#!/usr/bin/env bash
# ============================================================
# build-vps.sh — сборка образов стенда prj-cleanfine «берегущими» группами.
#
# Зачем отдельный скрипт, а не один `docker compose build`: рядом на хосте
# работает демо-стенд cleaning-ops-vps (15 контейнеров, 4 vCPU / 7.8 ГиБ всего).
# Общая сборка всех 11 образов поднимала load average до ~16 и роняла
# healthcheck демо-rabbitmq в транзиентный `unhealthy`. Поэтому здесь:
#   * сервисы собираются группами (1–2 за раз);
#   * перед каждой группой ждём снижения load average ниже порога;
#   * COMPOSE_PARALLEL_LIMIT=2 — не более двух образов одновременно;
#   * между группами короткая пауза.
#
# Запуск (из КОРНЯ репозитория): bash deploy/vps/build-vps.sh
# Демо-стенд скрипт НЕ трогает: только читает load average и статусы (read-only).
#
# ВАЖНО про переносимость: список групп задан явными строками в `for`, без
# bash-массивов — такая форма корректно работает и в ограниченных оболочках
# (в среде с файловой песочницей обёртка искажает разворачивание "${ARR[@]}").
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$KIT_DIR/../.." && pwd)"
ENV_FILE="$KIT_DIR/.env.vps"
COMPOSE_FILE="$KIT_DIR/docker-compose.yml"

export npm_config_cache="${npm_config_cache:-$ROOT_DIR/.cache/npm}"
export BUILDX_CONFIG="${BUILDX_CONFIG:-$ROOT_DIR/.cache/buildx}"
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-2}"
mkdir -p "$npm_config_cache" "$BUILDX_CONFIG"

cd "$ROOT_DIR"
if [ ! -f "$ENV_FILE" ]; then
  echo "ОШИБКА: нет $ENV_FILE — выполните bash deploy/vps/gen-env.sh" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# Порог load average: 4 vCPU, load 8 — уже двукратная перегрузка, ждём ниже 6.
LOAD_THRESHOLD="${LOAD_THRESHOLD:-6.0}"
PAUSE_BETWEEN="${PAUSE_BETWEEN:-45}"

demo_unhealthy() {
  docker ps --format '{{.Names}} {{.Status}}' | grep '^cleaning-ops-vps-' | grep -c unhealthy || true
}

demo_healthy() {
  docker ps --format '{{.Names}} {{.Status}}' | grep '^cleaning-ops-vps-' | grep -c healthy || true
}

load_avg() { awk '{print $1}' /proc/loadavg; }

wait_for_load() {
  waited=0
  while :; do
    l="$(load_avg)"
    if awk -v l="$l" -v t="$LOAD_THRESHOLD" 'BEGIN{exit !(l < t)}'; then
      echo "    load average ${l} < ${LOAD_THRESHOLD} — собираю"
      return 0
    fi
    if [ "$waited" -ge 600 ]; then
      echo "    load average ${l} держится >= ${LOAD_THRESHOLD} уже ${waited}s — собираю всё равно"
      return 0
    fi
    echo "    load average ${l} >= ${LOAD_THRESHOLD}, жду (${waited}s)"
    sleep 30
    waited=$((waited + 30))
  done
}

echo "=== сборка образов prj-cleanfine берегущими группами ==="
echo "    параллелизм: ${COMPOSE_PARALLEL_LIMIT}; порог load: ${LOAD_THRESHOLD}; пауза между группами: ${PAUSE_BETWEEN}s"
echo "    демо-стенд: healthy=$(demo_healthy), unhealthy=$(demo_unhealthy) — не трогаем"

START="$(date +%s)"

# Группы: сначала «тяжёлые» backend (npm install + nest build), затем фронтенды.
for group in "auth files" "core gps" "tickets notifications" "materials schedule" "chat" "web-admin web-client"; do
  echo
  echo "--- группа: ${group} ---"
  wait_for_load
  group_start="$(date +%s)"
  "${COMPOSE[@]}" build ${group}
  group_end="$(date +%s)"
  group_secs=$((group_end - group_start))
  echo "    группа собрана за ${group_secs}s"
  echo "    демо-стенд: healthy=$(demo_healthy), unhealthy=$(demo_unhealthy)"
  sleep "${PAUSE_BETWEEN}"
done

end="$(date +%s)"
total=$((end - START))
echo
echo "=== готово за ${total}s ==="
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep prj-cleanfine | sort
