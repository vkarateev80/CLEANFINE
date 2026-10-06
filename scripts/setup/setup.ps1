# CLEANFINE — настройка окружения (Windows PowerShell)
# Копирует .env.example в .env, если .env ещё нет.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envExample = Join-Path $root '.env.example'
$envFile = Join-Path $root '.env'

if (-not (Test-Path $envFile)) {
  Copy-Item $envExample $envFile
  Write-Host "Создан .env из .env.example. Отредактируйте секреты (пароли БД/RabbitMQ/MinIO, JWT)." -ForegroundColor Yellow
} else {
  Write-Host ".env уже существует — пропускаю." -ForegroundColor Green
}

Write-Host ""
Write-Host "Запуск инфраструктуры:"
Write-Host "  docker compose --env-file .env -f infra/docker/docker-compose.yml up -d"
Write-Host "UI: RabbitMQ http://localhost:15672 (admin/<пароль>), MinIO http://localhost:9001"
