# QA-набор Cleaning Ops (каркас М0.8)

Структура — по УСТАВ.md → Агент QA:

```
test/
├── unit/backend/        # эталонные unit-тесты сервисов (подключаются с М1)
├── unit/frontend/       # unit-тесты веб
├── integration/         # интеграционные сценарии
├── e2e/web/             # Playwright (web-admin, web-client)
├── e2e/mobile/          # интеграционные тесты Flutter (М6)
├── performance/k6/      # нагрузочные сценарии k6
├── performance/results/ # результаты прогонов (в gitignore)
├── fixtures/            # users.json, objects.json, tickets.json
├── reports/             # отчёты (в gitignore)
└── playwright.config.ts
```

## Статус по фазам

- **М0** — каркас: fixtures, шаблон k6, playwright.config.ts. Эталонный unit-тест «одного сервиса» отложен до М1 (сервисов ещё нет) — решение архитектора, ПЛАН.md М0.8.
- **М1** — первый e2e-набор (auth): в `test/package.json` добавляется `@playwright/test`, в CI включается job `e2e` (снять `if: false`).
- **М2–М5** — e2e-вертикали по фазам плана.
- **М6** — тесты Flutter (`flutter test`, integration_test) — живут в `mobile/cleaning-ops-app/test/`.
- **М7** — полный набор, k6, UAT.

## Запуск

```bash
# после М1.8 (когда установлен @playwright/test)
pnpm --filter @cleaning-ops/qa test:e2e

# нагрузка (требуется k6)
k6 run test/performance/k6/tickets.js
```
