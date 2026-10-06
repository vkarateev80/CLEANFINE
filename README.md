# CLEANFINE — монорепо

Система управления клининговыми работами. Подробности:

- 📋 **Канонический устав:** [`УСТАВ.md`](./УСТАВ.md) (спецификации всех агентов/сервисов)
- 🗺 **Мастер-план реализации (М0–М7):** [`ПЛАН.md`](./ПЛАН.md)
- 🧳 **Контекст и переезд (состояние, коммиты, окружение, деферы):** [`КОНТЕКСТ.md`](./КОНТЕКСТ.md)
- 📚 **Документация (рабочая):** [`docs/README.md`](./docs/README.md) — главный README (Orchestrator)

## Быстрый старт (dev)

```bash
# 1. Окружение
cp .env.example .env          # заполнить секреты
# 2. Инфраструктура (PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO)
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
# 3. Зависимости (pnpm)
pnpm install
# 4. Контракты shared → dist (обязательно перед сборкой сервисов)
pnpm build:shared
# 5. Проверки
pnpm format:check && pnpm --filter @cleaning-ops/shared typecheck
```

> **Сборка `shared` обязательна перед сборкой/тайпчеком сервисов.** Backend и web-admin
> резолвят `@cleaning-ops/shared/*` в `shared/dist` (tsconfig `paths`), поэтому контракты
> собираются первыми. `pnpm build` делает это сам: shared, затем все остальные пакеты.

> Примечание локальной разработки (Windows, М0): pnpm-обёртки `*.ps1` не работают под сандбоксом DSH и локальный pnpm 8 несовместим с Node 24 — используйте `node <путь>\node_modules\pnpm\bin\pnpm.cjs` от pnpm ≥10 либо npm. В CI (Linux) — pnpm по уставу.
