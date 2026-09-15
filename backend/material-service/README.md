# material-service (М4.1 + М4.2)

Справочник материалов, складские остатки по объектам, движения (приход/расход/перемещение/списание),
автосписание по завершению операций техкарты, пороги и отчёт по расходу.

- **Порт:** `MATERIAL_SERVICE_PORT` (3007)
- **БД:** `cleaning_ops_materials` (PostgreSQL, `MATERIAL_DATABASE_URL`)
- **Шина:** RabbitMQ, exchange `cleaning-ops.events` (topic), контракт — `shared/constants/events.ts`
- **Swagger:** `http://localhost:3007/api/docs` (кроме `NODE_ENV=production`)

## Эндпоинты

| Метод | Путь | Роли | Назначение |
|---|---|---|---|
| `POST` | `/api/materials` | ADMIN, SUPERVISOR | Создать материал |
| `GET` | `/api/materials` | все авторизованные | Справочник (`skip`, `take`, `search`) |
| `GET` | `/api/materials/stocks` | все авторизованные | Остатки по объектам (`objectId`, `onlyLow`) с названием материала и `belowThreshold` |
| `POST` | `/api/materials/movements` | ADMIN, SUPERVISOR, OPERATOR | Движение: `IN`/`OUT`/`TRANSFER`/`WRITE_OFF`; минус → 400 |
| `GET` | `/api/materials/report` | все авторизованные | Отчёт по расходу: агрегаты OUT/WRITE_OFF + итог по стоимости |
| `GET` | `/api/materials/:id/movements` | все авторизованные | История (`objectId`, `from`, `to`, `limit`) |
| `GET` | `/api/materials/:id` | все авторизованные | Материал с остатками |
| `PATCH` | `/api/materials/:id` | ADMIN, SUPERVISOR | Правка (`supplier: null` очищает поставщика) |
| `DELETE` | `/api/materials/:id` | ADMIN, SUPERVISOR | Удаление (каскадом остатки и история) |

### Правила движений

- `IN` / `TRANSFER` увеличивают остаток, `OUT` / `WRITE_OFF` уменьшают.
- Остаток пересчитывается в одной транзакции с записью движения; уход в минус → **400**
  (`quantity + delta >= 0` проверяется условным `UPDATE`, поэтому гонки тоже отклоняются).
- `TRANSFER` обязателен `targetObjectId` (≠ `objectId`): списание с одного объекта, приход на другой.
- Запись остатка создаётся автоматически при первом движении по паре `(materialId, objectId)`.

## Автосписание (М4.2)

Консьюмер слушает очередь `material.ticket.operation.completed` (routing key `ticket.operation.completed`).

1. Payload события `{ operationId, ticketId, objectId, completedAt }` — материалов в нём нет.
2. Материалы берутся по цепочке API с сервисным токеном
   (`ServiceTokenProvider` → `POST /api/auth/login`, кэш токена, при 401 перелогин и один повтор):
   `GET {TICKET_SERVICE_URL}/api/tickets/:id` → `roomId` →
   `GET {CORE_SERVICE_URL}/api/rooms/:id` → `techCardId` →
   `GET {CORE_SERVICE_URL}/api/tech-cards/:id` → `operations[]` → операция по `operationId` → `materials[]`.
   Нет `roomId`/`techCardId`/операции или сервис недоступен → warning и **ack без списания**.
3. По каждому материалу создаётся движение `OUT` на `consumptionPerOperation` по `objectId` заявки
   с `ticketId` и `userId = system:auto-consumption`.
4. **Идемпотентность:** запись в `ConsumedOperation` с `@@unique([operationId, materialId])` пишется
   в той же транзакции, что и движение. Повторная доставка события получает `P2002` и пропускает материал.
5. **Порог:** если остаток < `minStockThreshold`, публикуется `material.low`
   (`{ materialId, materialName, objectId, objectName, quantity, threshold }`).
   Название объекта берётся из core (`GET /api/objects/:id`), при недоступности — `objectId`.
6. **Устойчивость:** ленивое подключение к брокеру с cooldown, retry консьюмера, `ack` после успеха,
   `nack(requeue)` при ошибке и DLQ `material.ticket.operation.completed.dlq` после
   `MATERIAL_CONSUMER_MAX_ATTEMPTS` (по умолчанию 5) доставок. Битый payload подтверждается.

## Env

| Переменная | Значение по умолчанию | Назначение |
|---|---|---|
| `MATERIAL_SERVICE_PORT` | 3007 | Порт HTTP (`PORT` — общий фолбэк) |
| `MATERIAL_DATABASE_URL` | — | Postgres-подключение (обязательно) |
| `JWT_ACCESS_SECRET` | `dev-access-secret` | Общий секрет с auth-service |
| `RABBITMQ_URL` | `amqp://localhost:5672` | Брокер |
| `RABBITMQ_TIMEOUT_MS` | 5000 | Таймаут подключения |
| `RABBITMQ_RECONNECT_COOLDOWN_MS` | 10000 | Пауза между попытками подключения |
| `MATERIAL_CONSUMER_ENABLED` | `true` | `false` — выключить консьюмер автосписания |
| `MATERIAL_CONSUMER_MAX_ATTEMPTS` | 5 | Доставок до DLQ |
| `AUTH_SERVICE_URL` / `E2E_API_URL` | `http://localhost:3001` | Сервисный логин |
| `SERVICE_AUTH_EMAIL` / `SERVICE_AUTH_PASSWORD` | `admin@cleaning-ops.com` / `admin123` | Учётка сервиса |
| `TICKET_SERVICE_URL` | `http://localhost:3005` | Заявка → `roomId` |
| `CORE_SERVICE_URL` | `http://localhost:3003` | Помещение/техкарта/объект |
| `*_SERVICE_TIMEOUT_MS` | 5000 | Таймауты внутренних вызовов |

## Команды

```powershell
# установка (pnpm в этом окружении сломан)
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --no-package-lock --no-audit --no-fund --registry=https://registry.npmmirror.com

# Prisma
$env:MATERIAL_DATABASE_URL='postgresql://admin:PkNgqJETxnwlYFci31C0@localhost:5432/cleaning_ops_materials?schema=public'
node node_modules/prisma/build/index.js migrate dev --name init_materials --skip-seed   # миграция уже применена
node node_modules/prisma/build/index.js generate                                      # при EPERM — останови сервис

# качество
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand --coverage
node node_modules/@nestjs/cli/bin/nest.js build      # dist/main.js
node dist/main.js                                    # запуск (env берётся из ../../.env)
```

## Схема БД

`Material` (name, unit, defaultConsumption, minStockThreshold, costPerUnit, supplier?) →
`MaterialStock` (materialId, objectId, quantity, `@@unique([materialId, objectId])`) →
`MaterialMovement` (materialId, objectId, type, quantity, ticketId?, userId, `targetObjectId?`, createdAt) →
`ConsumedOperation` (operationId, materialId, ticketId, objectId, quantity, movementId?, `@@unique([operationId, materialId])`),
enum `MovementType` = `IN | OUT | TRANSFER | WRITE_OFF`.

`targetObjectId` — аддитивное расширение кода устава: перемещение это две складские операции,
и без объекта-получателя история TRANSFER нечитаема.

## Очистка данных после проверок

```powershell
@'
TRUNCATE "ConsumedOperation", "MaterialMovement", "MaterialStock", "Material" CASCADE;
'@ | Set-Content $env:TEMP\cleanup.sql
docker cp $env:TEMP\cleanup.sql cleaning-ops-postgres:/tmp/cleanup.sql
docker exec cleaning-ops-postgres psql -U admin -d cleaning_ops_materials -f /tmp/cleanup.sql
```

Имена таблиц — PascalCase, колонки — camelCase (Prisma без `@@map`), поэтому SQL в кавычках.

## Проверка порогов вручную

`tools/watch-material-low.js` подписывается на `material.low` и печатает payload:

```powershell
$env:RABBITMQ_URL='amqp://admin:<pass>@localhost:5672'
node tools/watch-material-low.js 8000
```
