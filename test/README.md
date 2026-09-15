# QA-набор Cleaning Ops (каркас М0.8, e2e — М1.8, ядро — М2.9)

Структура — по УСТАВ.md → Агент QA:

```
test/
├── unit/backend/        # эталонные unit-тесты сервисов (подключаются с М1)
├── unit/frontend/       # unit-тесты веб
├── integration/         # интеграционные сценарии
├── e2e/web/             # Playwright: *.api.spec.ts (HTTP) и *.ui.spec.ts (браузер)
├── e2e/api/             # Playwright: ядро домена (core-service + file-service)
├── e2e/mobile/          # интеграционные тесты Flutter (М6)
├── helpers/             # общие хелперы (users.ts — креды, core.ts — core/file API)
├── performance/k6/      # нагрузочные сценарии k6
├── performance/results/ # результаты прогонов (в gitignore)
├── fixtures/            # users.json, objects.json, tickets.json
├── reports/             # отчёты (в gitignore)
└── playwright.config.ts
```

## Статус по фазам

- **М0** — каркас: fixtures, шаблон k6, playwright.config.ts.
- **М1 (М1.8)** — ✅ вертикаль входа:
  - **API-e2e** (`e2e/web/auth.api.spec.ts`): login → me → refresh → logout, защита от replay
    старого refresh, **PIN-вход (по email и по телефону) и биометрия**, RBAC
    (ADMIN/SUPERVISOR/OPERATOR/CLIENT), создание+деактивация сотрудника, rate limit (6-я → 429).
  - **UI-e2e** (`e2e/web/auth.ui.spec.ts`): рендер логина, валидация пустой формы,
    сообщение при неверном пароле, успешный вход → `/dashboard`, сохранение токена,
    редиректы неавторизованных переходов, 404.
  - **CI** — джоба `e2e` активна (была `if: false`).
- **М2 (М2.9)** — ✅ ядро домена (`e2e/api/core.api.spec.ts`, 19 тестов): см. раздел ниже.
- **М3 (М3.8)** — ✅ оперативка (`e2e/api/gps.api.spec.ts`, `tickets.api.spec.ts`,
  `notifications.api.spec.ts`, `operations.api.spec.ts`; 31 тест): треки и геозоны, заявки
  со state machine, in-app уведомления и сквозная SOS-вертикаль через RabbitMQ — раздел
  «e2e «оперативки» М3.8» ниже.
- **М4 (М4.7)** — ✅ планирование и учёт (`e2e/api/planning.api.spec.ts`, 16 тестов;
  `e2e/web/materials.ui.spec.ts` — 6, `e2e/web/schedule.ui.spec.ts` — 7,
  `e2e/web/m43-integration.ui.spec.ts` — 4): графики и генерация плановых заявок, check-in по
  геозоне, неявки, справочник и движения материалов, сквозное автосписание по завершённой
  операции, выбор материала техкарты из справочника — раздел «e2e «планирования» М4.7» ниже.

## Креды dev-стенда

Источник — `fixtures/users.json`; его же читает `scripts/seed/seed-users.mjs`, поэтому seed
идемпотентен и всегда приводит стенд к документированному состоянию (пароль, PIN и биометрия
перезаписываются при каждом прогоне).

| Роль | Email | Пароль | PIN | Телефон |
|---|---|---|---|---|
| ADMIN | admin@cleaning-ops.com | admin123 | 1234 | +79990000001 |
| SUPERVISOR | supervisor@cleaning-ops.com | super123 | 2345 | +79990000002 |
| OPERATOR | operator@cleaning-ops.com | oper123 | 3456 | +79990000003 |
| CLIENT | client@example.com | client123 | 4567 | +79990000004 |

Биометрические ключи — `dev-biometric-<role>`.
- **М2–М5** — e2e-вертикали по фазам плана.
- **М6** — тесты Flutter (`flutter test`, integration_test) — живут в `mobile/cleaning-ops-app/test/`.
- **М7** — полный набор, k6, UAT.

## Запуск

Нужны запущенные сервисы: auth-service на `:3001` и web-admin (vite) на `:5173`
(для ядрового набора — core-service `:3003`, file-service `:3002` и MinIO `:9000`).

```bash
# 1. Инфраструктура + миграции + seed
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm --filter @cleaning-ops/shared build
(cd backend/auth-service && pnpm prisma:deploy && pnpm build)
node scripts/seed/seed-users.mjs

# 2. auth-service. ВАЖНО: логин ограничен 5/мин — для прогона лимит поднимается
(cd backend/auth-service && THROTTLE_LOGIN_LIMIT=1000 THROTTLE_GLOBAL_LIMIT=10000 node dist/main.js)

# 3. web-admin
(cd frontend/web-admin && node node_modules/vite/bin/vite.js)

# 4. Тесты
pnpm --filter @cleaning-ops/qa test:e2e        # оба проекта
pnpm --filter @cleaning-ops/qa test:e2e:api    # только HTTP
pnpm --filter @cleaning-ops/qa test:e2e:web    # только браузер
```

Первый запуск UI-тестов требует браузера: `pnpm --filter @cleaning-ops/qa exec playwright install chromium`.

### e2e ядра домена (М2.9)

Дополнительно к auth-набору нужны **core-service** (`:3003`), **file-service** (`:3002`) и
**MinIO** (`:9000`); web-admin для этого набора не требуется.

```bash
# сервисы (каждый со своим окружением)
(cd backend/core-service && node dist/main.js)      # PORT=3003, FILE_SERVICE_URL=http://localhost:3002
(cd backend/file-service && node dist/main.js)      # PORT=3002

# прогон
cd test
node node_modules/@playwright/test/cli.js test --project=api test/e2e/api/core.api.spec.ts
```

Переменные окружения (все необязательные, дефолты — локальный стенд):

| Переменная | Дефолт | Назначение |
|---|---|---|
| `E2E_API_URL` | `http://localhost:3001` | auth-service: выдача access-токенов |
| `E2E_CORE_URL` | `http://localhost:3003` | core-service (объекты, этажи, помещения, техкарты, маршруты) |
| `E2E_FILE_URL` | `http://localhost:3002` | file-service (загрузка файлов и привязки) |

**Чем отличается от auth-прогона.** auth-набор ходит через `baseURL` проекта (`E2E_API_URL`),
ядровый набор обращается к двум сервисам по абсолютным адресам `E2E_CORE_URL`/`E2E_FILE_URL`,
поэтому смена `E2E_API_URL` его не затрагивает. Стенд для ядра — три сервиса плюс Postgres и
MinIO; логин по-прежнему нужен только auth-service.

**Что покрывает `e2e/api/core.api.spec.ts` (19 тестов).**

- Сквозной цикл: объект → 2 этажа → план (загрузка в file-service + привязка `FLOOR_PLAN` +
  `POST /api/floors/:id/plan-url`) → 3 помещения с координатами внутри плана → техкарта с 3
  операциями и материалами → `reorder` операций → маршрут с 3 точками → `reorder` точек →
  проверка `totalEstimatedTimeMin` и порядка точек → удаление точки с пересборкой `orderIndex` →
  статусная модель маршрута (DRAFT ↔ ACTIVE → ARCHIVED, из архива выхода нет). Второй тест
  покрывает multipart-загрузку плана **через core** (`POST /api/floors/:id/plan`) с пробросом
  токена в file-service.
- Негативные кейсы: 401 без токена и с мусорным токеном (core и file), 403 для OPERATOR/CLIENT на
  запись, 404 на несуществующие id, 409 на дубликат номера этажа (в объекте и в другом объекте —
  не конфликт), 400 на координаты вне плана (и на PATCH), 400 на координаты без плана, 400 на
  неполный/чужой/пустой/дублирующий список `reorder`, 400 на удаление объекта с активным
  маршрутом, 400 на помещение с другого этажа, 400 на невалидное тело и на недопустимый тип файла.
- RBAC: матрица чтения/записи по ADMIN, SUPERVISOR, OPERATOR, CLIENT; SUPERVISOR умеет писать,
  но удалять объект может только ADMIN; file-service — загрузка всем, удаление ADMIN/SUPERVISOR.
- Идемпотентность: `afterEach` удаляет созданные техкарты и объекты (каскадом этажи, помещения,
  маршруты, точки), тесты — свои файлы. Отдельный тест проверяет, что после уборки не остаётся
  ни объекта, ни этажа, ни помещения, ни маршрута. Две засеянные техкарты («Влажная уборка
  санузла») набор не трогает.

**Ограничение по лимиту входа.** auth-service пускает 5 логинов/мин на IP, причём квота общая на
весь стенд. Ядровый набор делает 4 логина (по одному на роль, токены кэшируются в
`helpers/core.ts`); если квота уже израсходована другим набором, хелпер один раз пережидает окно
(60 с) и повторяет попытку — тест остаётся зелёным, но прогон удлиняется. Чтобы прогон был
предсказуемо быстрым, поднимайте auth-service с `THROTTLE_LOGIN_LIMIT=1000
THROTTLE_GLOBAL_LIMIT=10000` (как в примере выше): при боевых 5/мин и auth-, и ядровый набор
упираются в 429.

### e2e сценария М2.7 в браузере (М2.9)

Отдельный набор `e2e/web/core.ui.spec.ts` (проект `web`) автоматизирует **ручной приёмочный
сценарий М2.7** — это прямое требование плана: «e2e-сценарий М2.7 автоматизирован в Playwright».
В отличие от ядрового набора он идёт через браузер и проверяет интерфейс, а не контракты API.

Нужны **все** сервисы: auth (`:3001`), file (`:3002`), core (`:3003`), MinIO (`:9000`) и
web-admin (`:5173`, vite dev — он проксирует `/api` по сервисам).

```bash
# web-admin
(cd frontend/web-admin && node node_modules/vite/bin/vite.js)

# прогон
cd test
node node_modules/@playwright/test/cli.js test --project=web test/e2e/web/core.ui.spec.ts
```

**Что покрывают 4 теста.**

- Сквозной цикл целиком через интерфейс: создать объект в списке (серверный поиск подтверждает
  запись) → добавить этаж → загрузить план файлом (`POST /api/floors/:id/plan` уходит в
  file-service) → нарисовать три помещения **протягиванием рамки** по плану → собрать маршрут из
  этих помещений → переставить точку кнопкой «Ниже» → сохранить порядок. Порядок и
  `totalEstimatedTimeMin` дополнительно сверяются запросом к API, а `orderIndex` проверяется на
  плотность (0,1,2) — так тест ловит и «сохранилось не то», и «сохранилось не до конца».
- Редактор операций техкарты: создание техкарты, две операции, сумма времени, переупорядочивание
  с немедленным сохранением (у техкарт нет отдельной кнопки сохранения порядка, в отличие от маршрутов).
- Защита маршрутов: `/objects`, `/routes`, `/tech-cards` без входа уводят на `/login`.
- RBAC: у оператора нет пунктов «Маршруты» и «Техкарды» в меню, а прямой заход на `/routes`
  возвращает на дашборд.

**Две ловушки интерфейса, на которые опирается тест** (обе выяснились прогоном):

1. Помещение создаётся **рамкой**, а не кликом, и после каждого создания экран сбрасывает режим
   рисования — перед новой рамкой режим включается повторно, а открытая карточка помещения
   закрывается (иначе следующий drag попадает по панели, а не по плану).
2. Кнопки «↑/↓» у сортируемых строк — соседи содержимого строки внутри `<li>`, а не его потомки:
   искать их нужно в `[data-testid^="sortable-row-"]`, а не в `operation-row-<id>`.

Фикстуры: `fixtures/files/floor-plan.png` (1200×800) и `photo-ok.png` (1600×900), генерируются
`node scripts/fixtures/make-file-fixtures.cjs <каталог>` (нужен `sharp` из `backend/file-service`).

### Проверка rate limiting

Механизм 429 проверяется отдельным тестом, который по умолчанию пропускается (набор делает
больше 5 логинов). Нужен сервис с **боевым** лимитом:

```bash
(cd backend/auth-service && PORT=3002 node dist/main.js)      # без THROTTLE_* переменных
(cd test && E2E_RATE_LIMIT=1 E2E_API_URL=http://localhost:3002 \
   node node_modules/@playwright/test/cli.js test --project=api --grep "rate limiting")
```

## e2e «оперативки» М3.8 (gps + tickets + notifications + SOS)

Набор из четырёх файлов в `e2e/api/` проверяет оперативный контур М3 целиком: приём
GPS-треков и геозоны, заявки со state machine, in-app уведомления и сквозную
SOS-вертикаль через RabbitMQ.

| Файл | Что проверяет | Тестов |
|---|---|---|
| `e2e/api/gps.api.spec.ts` | batch-приём точек (`accepted`), создание/список/фильтр геозон, `check` внутри/вне, `employees/nearby` (свежий трек найден, старый — нет), выход из геозоны (`geofenceExits` + `GEOFENCE_EXIT` в уведомлениях), история треков, роли, уборка | 10 |
| `e2e/api/tickets.api.spec.ts` | плановая/внеплановая заявка, фильтры и пагинация списка, деталь со связями, state machine `new → assigned → in_progress → completed → verified → closed`, `Invalid status transition`, назначение и комментарии, идемпотентность операций, RBAC по фактическим `@Roles` контроллера | 12 |
| `e2e/api/notifications.api.spec.ts` | upsert устройства, пагинация и лимит 100, `unreadOnly`/`unreadCount`, `PATCH /:id/read` идемпотентно, 404 на чужой id, изоляция по `userId` из JWT, настройки подписок (400 на недопустимый тип) | 7 |
| `e2e/api/operations.api.spec.ts` | **SOS-вертикаль М3**: `POST /api/tickets/emergency` → RabbitMQ → in-app `EMERGENCY` у получателя; проверяются тип/приоритет/таймер реакции, содержимое уведомления, отметка прочтения, 401 без токена | 2 |

**Итого 31 тест.**

### Требования к стенду

- auth `:3001`, core `:3003` (не обязателен для этих файлов), file `:3002` (не нужен),
  gps `:3004`, tickets `:3005`, notifications `:3006`;
- **RabbitMQ `:5672`** — обязателен: без него `ticket.emergency` и `geofence.exit` не дойдут
  до notification-service, и два теста (SOS и выход из геозоны) честно упадут. Это и есть
  проверка вертикали, а не флак;
- PostgreSQL (`docker` контейнер `cleaning-ops-postgres`) — нужен для уборки: у gps/ticket/
  notification нет DELETE-эндпоинтов, поэтому набор сносит РОВНО свои строки через `psql`
  (`test/helpers/operations.ts`). Если docker недоступен, `sqlAvailable()` возвращает false:
  тесты уборки скипаются, остальные продолжают работать, но данные остаются на стенде;
- `THROTTLE_LOGIN_LIMIT` лучше поднять: набор делает 4 логина ролей + по одному логину на
  каждого свежего оператора (эти пользователи удаляются в уборке).

```bash
# сервисы (каждый со своим окружением; порядок не важен)
(cd backend/gps-service && node dist/main.js)           # PORT=3004
(cd backend/ticket-service && node dist/main.js)        # PORT=3005
(cd backend/notification-service && node dist/main.js)  # PORT=3006

# прогон (фильтр пути — только forward slash; из каталога test)
cd test
node node_modules/@playwright/test/cli.js test --project=api e2e/api/gps.api.spec.ts \
  e2e/api/tickets.api.spec.ts e2e/api/notifications.api.spec.ts e2e/api/operations.api.spec.ts
```

Переменные окружения (все необязательные, дефолты — локальный стенд):

| Переменная | Дефолт | Назначение |
|---|---|---|
| `E2E_API_URL` | `http://localhost:3001` | auth-service: access-токены |
| `E2E_GPS_URL` | `http://localhost:3004` | gps-service: треки, геозоны, nearby, история |
| `E2E_TICKET_URL` | `http://localhost:3005` | ticket-service: заявки, статусы, SOS |
| `E2E_NOTIFICATION_URL` | `http://localhost:3006` | notification-service: устройства и in-app |
| `E2E_MATERIAL_URL` | `http://localhost:3007` | material-service: справочник, склады, движения, отчёт |
| `E2E_SCHEDULE_URL` | `http://localhost:3008` | schedule-service: графики, смены, check-in/check-out |
| `E2E_BASE_URL` | `http://localhost:5173` | web-admin: UI-проект Playwright |
| `E2E_POSTGRES_CONTAINER` | `cleaning-ops-postgres` | контейнер для уборки через `psql` |

## e2e «планирования» М4.7

Набор замыкает цепочку «план → заявка → списание»: график в schedule-service порождает смены и
плановые заявки в ticket-service, оператор отмечается по геозоне, а завершение операции техкарты
списывает материалы в material-service и шлёт `material.low` при остатке ниже порога.

| Файл | Что проверяет | Тестов |
|---|---|---|
| `e2e/api/planning.api.spec.ts` | графики и валидация recurrence (400 на `weekly` без дней и мусорную частоту); `generate` → смены + плановые заявки со сверкой через ticket-service и идемпотентностью повтора; фильтры смен дня; check-in по геозоне (201 внутри, 403 с серверным текстом снаружи, 404, повтор идемпотентен); check-out (400 без check-in); неявка → `MISSED` + in-app `SCHEDULE_MISSED` без повторной публикации; права OPERATOR/CLIENT/SUPERVISOR/аноним; CRUD справочника и поиск; движения `IN`/`OUT`/`TRANSFER` и отказ при нехватке; отчёт `OUT`+`WRITE_OFF` со сверкой с движениями; сквозное автосписание → `system:auto-consumption` и порог → `MATERIAL_LOW`; удаление материала уносит его `ConsumedOperation` и не трогает строки соседнего материала; история движений с фильтрами | 16 |
| `e2e/web/materials.ui.spec.ts` | вкладки и `tab` в query-строке (в том числе после перезагрузки), создание материала через модалку и поиск по справочнику, движение `IN` → `movement-notice` и остаток на вкладке «Остатки», расход больше остатка → серверный текст «Недостаточно материала», отчёт, история с фильтрами | 6 |
| `e2e/web/schedule.ui.spec.ts` | deep-link вкладок, создание графика через модалку, клиентская валидация `weekly` без дней (запрос не уходит), видимость ADMIN-триггеров и генерация на дату ≠ сегодня, модалка отметки, удаление графика через ConfirmDialog | 7 |
| `e2e/web/m43-integration.ui.spec.ts` | выбор материала операции **из справочника** (серверный поиск: материал вне текущей выдачи отсутствует в списке; подстановка единицы и нормы, незатирание вручную введённого расхода, сохранение в core), legacy-`materialId` сохраняется без подмены, поле «Заявка» есть только у расходных типов (`OUT` пишет `ticketId`, `IN` — нет), уборка | 4 |

**Итого 33 теста** (16 API + 17 UI). Полная регрессия: `--project=api` 84 passed / 1 skipped,
`--project=web` 29 passed.

### Требования к стенду (М4.7)

- auth `:3001`, core `:3003`, gps `:3004`, tickets `:3005`, notifications `:3006`,
  material `:3007`, schedule `:3008`, web-admin `:5173`;
- **RabbitMQ обязателен**: без него `ticket.operation.completed` не дойдёт до автосписания,
  а `schedule.missed_checkin` и `material.low` — до уведомлений;
- **`SCHEDULE_CRON_ENABLED=false`**: набор проверяет неявки и генерацию ручными триггерами
  (`POST /api/schedule/generate`, `POST /api/schedule/check-missed`), а фоновый проход раз в
  5 минут менял бы смены прямо во время прогона. Тем же флагом поднимается CI;
- **auth с поднятыми лимитами логина** (`THROTTLE_LOGIN_LIMIT=1000`, `THROTTLE_GLOBAL_LIMIT=10000`):
  иначе набор упирается в боевой лимит 5 логинов/мин;
- **PostgreSQL через `docker exec`** нужен для уборки и SQL-проверок: без него зависимые тесты
  скипаются, а не «зеленеют» на грязных данных.

### Что важно знать про эти тесты

**UUID только v4.** DTO gps-service требуют `@IsUUID('4')`: «нулевой» id вида
`00000000-0000-0000-0000-...` не проходит валидацию и даёт **400**, а не 404. В наборах
используются v4-идентификаторы (`00000000-0000-4000-8000-...`).

**Своя площадка на каждый тест.** gps-service ищет БЛИЖАЙШУЮ геозону в радиусе 1000 м,
поэтому две геозоны в одной точке сделали бы `check` недетерминированным. Тесты строят
геозону через `uniqueGeofenceCell(index)` — квадрат ~66×66 м со сдвигом от «шумных»
координат стенда, а тесты внутри файла разведены по `index`.

**Уведомления приходят асинхронно.** События идут через RabbitMQ, поэтому набор нигде не
«спит» фиксированно: он опрашивает `GET /api/notifications` с таймаутом
(`waitForNotification`, до 15–20 с). Создание заявки сразу с исполнителем эмитит ДВА события
(`ticket.created` и `ticket.assigned`) — это две in-app записи `NEW_TICKET`, поэтому
проверки считают прирост, а не абсолютное «ровно одно».

**Уборка и её границы.** `helpers/operations.ts` помнит созданное (геозоны, треки вместе с
их явными timestamp, устройства, уведомления, заявки, свежих пользователей) и сносит это в
`afterEach`; один раз на процесс `sweepOrphanNotifications()` чистит осиротевшие уведомления
(записи пользователей, которых больше нет в auth). Засеянные роли (`admin@`, `operator@`,
`supervisor@`, `client@`), объекты ядра и чужие геозоны набор не трогает. Два теста
(`GPS: уборка`) проверяют саму уборку: до неё строки прогона есть в БД, после — нет.

**RBAC берётся из контроллера**, а не из предположений: `POST /api/tickets` — ADMIN,
SUPERVISOR, CLIENT (OPERATOR → 403); `POST /api/tickets/emergency` — любая
аутентифицированная роль; `PATCH /:id/status` — ADMIN, SUPERVISOR, OPERATOR;
`POST /:id/assign` — ADMIN, SUPERVISOR; комментарии — без `@Roles`.

## Нагрузка

```bash
k6 run test/performance/k6/tickets.js   # требуется k6
```
