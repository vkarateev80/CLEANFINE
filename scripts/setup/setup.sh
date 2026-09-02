#!/usr/bin/env bash
# Cleaning Ops — настройка окружения (bash/macOS/Linux/WSL)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_EXAMPLE="$ROOT/.env.example"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Создан .env из .env.example. Отредактируйте секреты (пароли БД/RabbitMQ/MinIO, JWT)." >&2
else
  echo ".env уже существует — пропускаю." >&2
fi

echo ""
echo "Запуск инфраструктуры:"
echo "  docker compose --env-file .env -f infra/docker/docker-compose.yml up -d"
echo "UI: RabbitMQ http://localhost:15672, MinIO http://localhost:9001"
