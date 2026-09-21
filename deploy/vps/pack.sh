#!/usr/bin/env bash
# ============================================================
# pack.sh — архив исходников стенда (PRD FR-12, опционально).
#
# Собирает tar.gz из корня репозитория БЕЗ: .git, node_modules, артефактов сборки
# (backend/*/dist, frontend/*/dist, shared/dist), секретов (.env.vps), отчётов
# тестов и логов. Назначение — передать стенд на VPS одним файлом:
#
#   bash deploy/vps/pack.sh                  # → deploy/vps/prj-cleanfine-src-<дата>.tar.gz
#   bash deploy/vps/pack.sh /tmp/out.tar.gz  # свой путь
#
# ВАЖНО: архив НЕ содержит shared/dist — на целевой машине перед docker build
# обязателен `pnpm build:shared` (иначе сборка образов упадёт, FR-14/ADR-8).
# ============================================================
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$KIT_DIR/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-$KIT_DIR/prj-cleanfine-src-${STAMP}.tar.gz}"

cd "$ROOT_DIR"

echo "==> упаковка $ROOT_DIR → $OUT"
tar -czf "$OUT" \
  --exclude='./.git' \
  --exclude='./.cache' \
  --exclude='./node_modules' \
  --exclude='*/node_modules' \
  --exclude='./backend/*/dist' \
  --exclude='./frontend/*/dist' \
  --exclude='./shared/dist' \
  --exclude='./mobile/*/build' \
  --exclude='./test/reports' \
  --exclude='./test-results' \
  --exclude='./playwright-report' \
  --exclude='./deploy/vps/.env.vps' \
  --exclude='*.log' \
  --exclude='*.tsbuildinfo' \
  .

echo "==> готово: $(du -h "$OUT" | cut -f1)  $OUT"
echo "    Проверка содержимого без секретов и артефактов:"
if tar -tzf "$OUT" | grep -E '(^|/)(\.git/|node_modules/|\.env\.vps$|shared/dist/|backend/[^/]+/dist/)' ; then
  echo "ОШИБКА: в архив попали исключённые пути" >&2
  exit 1
else
  echo "    чисто"
fi
