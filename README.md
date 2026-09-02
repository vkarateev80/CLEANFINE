# Cleaning Ops — монорепо

Система управления клининговыми работами. Подробности:

- 📋 **Канонический устав:** [`УСТАВ.md`](./УСТАВ.md) (спецификации всех агентов/сервисов)
- 🗺 **Мастер-план реализации (М0–М7):** [`ПЛАН.md`](./ПЛАН.md)
- 📚 **Документация (рабочая):** [`docs/README.md`](./docs/README.md) — главный README (Orchestrator)

## Быстрый старт (dev)

```bash
# 1. Окружение
cp .env.example .env          # заполнить секреты
# 2. Инфраструктура (PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO)
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
# 3. Зависимости (pnpm)
pnpm install
# 4. Проверки
pnpm format:check && pnpm --filter @cleaning-ops/shared typecheck
```

> Примечание локальной разработки (Windows, М0): pnpm-обёртки `*.ps1` не работают под сандбоксом DSH и локальный pnpm 8 несовместим с Node 24 — используйте `node <путь>\node_modules\pnpm\bin\pnpm.cjs` от pnpm ≥10 либо npm. В CI (Linux) — pnpm по уставу.
