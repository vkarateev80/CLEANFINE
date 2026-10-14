#!/usr/bin/env bash
# Сборка образов CLEANFINE на Mac и выкат на vps2 (k3s), 15.10.2026.
#
# Зачем: сборка на боевом хосте занимала все ядра и диск — пробы падали,
# сервисы перезапускались. На Mac (Apple Silicon) образы linux/amd64 собираются
# через colima с Rosetta (`colima start --vz-rosetta --cpu 6 --memory 8`),
# затем уезжают на сервер сжатым потоком (zstd) и импортируются в containerd k3s.
#
# Использование:
#   deploy/vps/build-local.sh <тег> <образ> [<образ> ...]
#   deploy/vps/build-local.sh 1015-markers web-admin
#   deploy/vps/build-local.sh 1015-all auth files core gps tickets notifications materials schedule chat web-admin web-operator web-client
#
# Образы: auth files core gps tickets notifications materials schedule chat
#         web-admin web-operator web-client
# Переменные: SSH_HOST (vps2), NO_ROLLOUT=1 — только собрать и импортировать.
#
# Требования на Mac: docker + buildx (brew install docker-buildx), colima с
# rosetta, zstd; на сервере: zstd, k3s, kubectl. shared/dist собирается здесь же.
set -euo pipefail

TAG="${1:?тег образа, например 1015-markers}"
shift
[ $# -gt 0 ] || { echo "укажите хотя бы один образ" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH_HOST="${SSH_HOST:-vps2}"
NS=cleaning-ops
cd "$ROOT"

# образ → каталог сервиса (бэкенд) или VITE_BASE (фронтенд). Функции, а не
# ассоциативные массивы: системный bash macOS — 3.2, без `declare -A`.
backend_dir() {
  case "$1" in
    auth) echo auth-service ;; files) echo file-service ;; core) echo core-service ;;
    gps) echo gps-service ;; tickets) echo ticket-service ;; notifications) echo notification-service ;;
    materials) echo material-service ;; schedule) echo schedule-service ;; chat) echo chat-service ;;
    *) echo "" ;;
  esac
}
web_base() {
  case "$1" in
    web-admin) echo / ;; web-operator) echo /app/ ;; web-client) echo /client/ ;; *) echo "" ;;
  esac
}

for img in "$@"; do
  if [[ -z "$(backend_dir "$img")" && -z "$(web_base "$img")" ]]; then
    echo "неизвестный образ: $img" >&2; exit 2
  fi
done

echo "==> shared/dist"
npm_config_manage_package_manager_versions=false npx -y pnpm@10 build:shared >/dev/null

build() {
  local img="$1"
  local start=$SECONDS
  if [[ -n "$(backend_dir "$img")" ]]; then
    # builder по умолчанию (docker-драйвер): образ сразу попадает в docker.
    docker buildx build --platform linux/amd64 \
      -f "backend/$(backend_dir "$img")/Dockerfile" \
      -t "cleaning-ops/$img:$TAG" -t "cleaning-ops/$img:latest" . >"/tmp/cf-build-$img.log" 2>&1 || return 1
  else
    docker buildx build --platform linux/amd64 \
      -f deploy/vps/Dockerfile.web --build-arg "APP=$img" --build-arg "VITE_BASE=$(web_base "$img")" \
      -t "cleaning-ops/$img:$TAG" -t "cleaning-ops/$img:latest" . >"/tmp/cf-build-$img.log" 2>&1 || return 1
  fi
  echo "    собран за $((SECONDS - start)) с"
}

ship() {
  local img="$1"
  local start=$SECONDS
  local size
  size=$(docker image inspect "cleaning-ops/$img:latest" --format '{{.Size}}')
  echo "    размер $((size / 1024 / 1024)) МБ, отправка…"
  docker save "cleaning-ops/$img:$TAG" "cleaning-ops/$img:latest" \
    | zstd -T0 -3 -q \
    | ssh -o ConnectTimeout=20 -o ServerAliveInterval=15 "$SSH_HOST" 'zstd -d -q | k3s ctr images import - >/dev/null && echo "    импортировано"'
  echo "    доставлен за $((SECONDS - start)) с"
}

for img in "$@"; do
  echo "==> $img"
  if ! build "$img"; then
    echo "СБОРКА $img УПАЛА, см. /tmp/cf-build-$img.log:" >&2
    grep -n "error TS\|ERROR" "/tmp/cf-build-$img.log" | head -5 >&2
    exit 1
  fi
  ship "$img"
done

if [[ "${NO_ROLLOUT:-0}" != "1" ]]; then
  echo "==> rollout"
  deploys=()
  for img in "$@"; do deploys+=("deploy/$img"); done
  ssh -o ConnectTimeout=20 "$SSH_HOST" "kubectl -n $NS rollout restart ${deploys[*]} && for d in ${deploys[*]}; do kubectl -n $NS rollout status \$d --timeout=240s | tail -1; done"
fi
echo "ГОТОВО: $* → $TAG"
