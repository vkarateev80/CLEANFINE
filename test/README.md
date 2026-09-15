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

## Нагрузка

```bash
k6 run test/performance/k6/tickets.js   # требуется k6
```
