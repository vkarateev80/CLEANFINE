# Runbook: изолированный стенд `prj-cleanfine`

Стенд актуального кода ветки `develop` рядом с работающим демо-стендом
`cleaning-ops-vps`. Реализация — System Design v2 (approved) и PRD (approved),
проект оркестра `prj-cleanfine-izolirovannyy-stend-aktualnogo-koda-i-`.

**Коротко:** 15 работающих контейнеров (4 инфраструктура + 9 backend + 2 фронтенда) в
compose-проекте `prj-cleanfine`, публикация только на tailnet-адресе
`100.109.185.14`, у всех контейнеров лимиты ресурсов и ротация логов.
Демо-стенд не затрагивается: свои сеть, тома, имена контейнеров и порты.

---

## 1. Доступы

Сводка по доступам вынесена отдельно: [`deploy/vps/ACCESS.md`](ACCESS.md) — учётные записи, адреса, готовый пример входа и ограничения (ссылка и логин ищутся там, не здесь).

| Что | Адрес |
|---|---|
| web-admin (админ-панель) | http://100.109.185.14:8090 |
| web-client (портал клиента) | http://100.109.185.14:8091 |
| auth-service | http://100.109.185.14:8111 |
| file-service | http://100.109.185.14:8112 |
| core-service | http://100.109.185.14:8113 |
| gps-service | http://100.109.185.14:8114 |
| ticket-service | http://100.109.185.14:8115 |
| notification-service | http://100.109.185.14:8116 |
| material-service | http://100.109.185.14:8117 |
| schedule-service | http://100.109.185.14:8118 |
| chat-service | http://100.109.185.14:8119 |
| MinIO S3 API | http://100.109.185.14:8120 |
| MinIO console | http://100.109.185.14:8121 |

Внутренние порты контейнеров — 3001…3009 в том же порядке (auth 3001 … chat 3009).

### Демо-креды (создаёт `seed.sh`)

| Роль | Email | Пароль | PIN |
|---|---|---|---|
| ADMIN | admin | `admin123` | 1234 |
| SUPERVISOR | supervisor@cleaning-ops.com | `super123` | 2345 |
| OPERATOR | operator | `oper123` | 3456 |
| CLIENT | client | `client123` | 4567 |

> Email-адреса сверены с `test/fixtures/users.json`: у роли CLIENT домен
> `example.com`, а не `cleaning-ops.com`.

Дополнительно стенд наполняется владельцем объекта для портала (см. §5.1):

| Роль | Email | Пароль | Что видит |
|---|---|---|---|
| CLIENT (владелец объекта) | owner@cleanfine.ru | `owner123` | портал `:8091` с объектом «БЦ «Ромашка»» |

---

## 2. Требования

- Docker Engine + Compose v2 (`docker compose version`).
- `openssl` — генерация секретов.
- `pnpm` (сборка `shared/dist`) — шаг build.
- Адрес `100.109.185.14` на интерфейсе (`tailscale0`): публикация идёт только на него.
- Свободны порты `8090`, `8091`, `8111–8119`, `8120–8121`.
- `~95 ГБ` диска на сборку 11 образов; хост 4 vCPU / 7.8 ГиБ делится с демо-стендом.

`bootstrap.sh` проверяет всё это сам и падает до первого изменения (fail-fast).

---

## 3. Развёртывание

Все команды — **из корня репозитория**.

```bash
# 0) Один раз: секреты (создаёт deploy/vps/.env.vps, повторный запуск не перезаписывает)
bash deploy/vps/gen-env.sh

# 1) Проверить итоговую конфигурацию до запуска
docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml config >/dev/null

# 2) Полный прогон: prerequisites → build → инфра → миграции → приложения → seed → смоук
bash deploy/vps/bootstrap.sh
```

Порядок внутри `bootstrap.sh` (System Design §7):

1. **Prerequisites** — docker/compose/openssl, tailnet-адрес, свободные порты,
   фиксация числа контейнеров демо-стенда «до».
2. **Env + build** — `gen-env.sh`, `pnpm install` при необходимости,
   **`pnpm build:shared`**, затем `docker compose build` (11 образов).
3. **Инфраструктура** — `up -d postgres redis rabbitmq minio`, ожидание 4× `healthy`
   (до 300 с). Перед `rabbitmq` поднимается одноразовый `rabbitmq-init`
   (см. §9.1). `infra/docker/initdb/01-create-databases.sql` создаёт 8 БД
   (auth-БД `cleaning_ops` создаёт сам образ) + PostGIS/pg_trgm — **только при
   первом создании тома**.
4. **Миграции** — `prisma migrate deploy` по 9 сервисам, каждый в своём
   одноразовом контейнере со своей `*_DATABASE_URL` (ADR-7: миграции не в `CMD`,
   иначе 9 сервисов стартуют параллельно и гоняются за схему).
5. **Приложения** — `up -d` 9 backend + 2 фронтенда, ожидание ответа auth.
6. **Seed** — `bash deploy/vps/seed.sh` (см. §5).
7. **Смоук** — AC-1…AC-5 + проверка логов на ошибки резолва контрактов.

**Первый прогон:** на живом VPS с работающим демо-стендом — **~1 ч 50 мин**
(замер: 6475 с для 11 образов берегущими группами, см. §3.1). Повторный: минуты
(слои Docker кэшируются; `npm install` переиспользуется, пока не изменился
`package.json` сервиса).

### 3.1. Берегущая сборка образов (обязательно на этом хосте)

Хост делится с демо-стендом `cleaning-ops-vps` (4 vCPU / 7.8 ГиБ всего).
Сборка одной командой `docker compose build` поднимала load average до ~16 и
роняла healthcheck демо-`rabbitmq` в транзиентный `unhealthy`. Поэтому сборка
и образов идёт **группами по 1–2 сервиса** с ожиданием снижения load:

```bash
bash deploy/vps/build-vps.sh          # 6 групп, COMPOSE_PARALLEL_LIMIT=2
# параметры при необходимости:
LOAD_THRESHOLD=4.0 PAUSE_BETWEEN=60 bash deploy/vps/build-vps.sh
```

Скрипт перед каждой группой ждёт `load average < LOAD_THRESHOLD` (по умолчанию
6.0, максимум ожидания 600 с), после группы печатает число `unhealthy`
контейнеров демо-стенда и делает паузу. Демо-стенд не трогается — только
чтение `load average` и статусов.

### 3.2. Проверка собранных образов (DC-1/DC-2)

```bash
bash deploy/vps/verify-images.sh
```

Для каждого из 9 backend-образов проверяется, что `node_modules/@cleaning-ops/
shared` лежит реальной копией (`package.json` + `dist/constants/events.js`),
что в его `exports` есть `require`/`default`/`./package.json`, и что
`require()` каждого **реально используемого** рантайм-спецификатора проходит без
`Cannot find module` и `ERR_PACKAGE_PATH_NOT_EXPORTED`. Для двух фронтендов —
наличие `/usr/share/nginx/html/index.html` и `nginx -t`. Ожидаемый итог:
**14 успешно, 0 провалено** (12 проверок backend + 2 фронтенда).

> Нюанс: `nginx -t` резолвит имена upstream'ов **уже на проверке конфига**.
> Если контейнеры проекта не запущены, проверка падает на
> `host not found in upstream "auth"` — это не дефект образа. Скрипт подаёт
> имена через `--add-host`, поэтому проверяет синтаксис конфига, а не живость
> сервисов (живость — задача смоука, §6).

### Важно: `shared/dist` собирается ДО `docker build`

Контракты `@cleaning-ops/shared` — артефакт сборки, в git их нет.
Все 9 `backend/*/Dockerfile` (единый паттерн, ADR-8) копируют `shared/dist` и
`shared/package.json` из контекста сборки. Если `shared/dist` не собран, сборка
образов падает. Оба скрипта (`bootstrap.sh`, `redeploy.sh`) выполняют
`pnpm build:shared` перед build; при ручной сборке образа — не забыть:

```bash
( unset NODE_ENV; pnpm build:shared )
docker build -f backend/core-service/Dockerfile -t prj-cleanfine-core-check .
```

`NODE_ENV=production` в сессии заставляет `pnpm`/`npm` пропускать
devDependencies (а `shared` собирается `typescript` из devDeps) — поэтому в
скриптах host-шаги идут с `unset NODE_ENV`. Если в вашей среде файловая
песочница запрещает запись в `~/.npm` и `~/.docker/buildx`, задайте кэш внутрь
репозитория:

```bash
export npm_config_cache=$PWD/.cache/npm
export BUILDX_CONFIG=$PWD/.cache/buildx
```

(`.cache/` в `.gitignore`.)

### Быстрый повторный деплой после правки кода

```bash
bash deploy/vps/redeploy.sh     # build:shared → build → migrate (9) → up -d
```

### Изменения схемы применяются шагом миграций (и ловушка `P3005`)

Схему БД меняет **не сборка и не `up -d`**, а шаг «Миграции» — `prisma migrate deploy` по девяти
сервисам (`bootstrap.sh`, шаг 4; `redeploy.sh`, шаг 3). Пересборка (`build-vps.sh`) и выкат
(`redeploy.sh` / `bootstrap.sh`) новых миграций сами не применяют: после правки `schema.prisma`
и добавления каталога миграции нужно прогнать `redeploy.sh` и убедиться, что шаг миграций прошёл.

> **`P3005`: база без `_prisma_migrations`.** Если схема сервиса создана в обход Prisma
> (ручной SQL, восстановление из дампа, когда-то потерянная история миграций), `migrate deploy`
> падает с «The database schema is not empty» и **останавливает выкат** (`redeploy.sh` идёт с
> `set -euo pipefail`). Лечится вручную — **baseline**: пометить уже применённые миграции как
> применённые и только затем накатить новые:
>
> ```bash
> COMPOSE="docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml"
> $COMPOSE run --rm --no-deps core npx prisma migrate status          # что видит Prisma
> $COMPOSE run --rm --no-deps core npx prisma migrate resolve --applied <миграция_1>
> $COMPOSE run --rm --no-deps core npx prisma migrate resolve --applied <миграция_2>
> $COMPOSE run --rm --no-deps core npx prisma migrate deploy          # накатит только новые
> ```
>
> **Автоматизации нет:** в `redeploy.sh` baseline не встроен, его делают руками — на описанной
> базе это уже потребовалось (2026-09-21, `cleaning_ops_core`; подробности — `docs/FACTS.md`,
> раздел 5 «Prisma и миграции»). Не путайте с аддитивными миграциями проекта привязки
> `ownerClientId`: они применяются штатно, если история миграций на месте.

> **Живую базу нельзя передавать в `--shadow-database-url`.** Shadow-цикл Prisma пересоздаёт
> схему в указанной базе и удаляет там `_prisma_migrations`. Опыты с миграциями — только
> одноразовый контейнер postgres или база `cf_*`, с проверкой `select current_database()`
> перед каждой командой; базу стенда руками не трогать.

---

## 4. Ежедневные операции

```bash
COMPOSE="docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml"

$COMPOSE ps                       # состояние 15 контейнеров
$COMPOSE logs -f auth             # логи сервиса
$COMPOSE logs --tail=200 core     # хвост логов
$COMPOSE restart chat             # перезапуск одного сервиса
$COMPOSE up -d --force-recreate web-admin
docker stats --no-stream          # фактическое потребление против лимитов
free -m                           # память хоста
```

Файлы стенда:

| Файл | Назначение |
|---|---|
| `deploy/vps/docker-compose.yml` | прод-compose проекта `prj-cleanfine` (15 сервисов) |
| `deploy/vps/Dockerfile.web` | сборка SPA, build-arg `APP=web-admin\|web-client` |
| `deploy/vps/nginx-web-admin.conf` | маршрутизация админки (из `frontend/web-admin/vite.config.ts`) |
| `deploy/vps/nginx-web-client.conf` | маршрутизация портала (из `frontend/web-client/vite.config.ts`) |
| `deploy/vps/nginx-proxy_params` | общие proxy-заголовки |
| `deploy/vps/.env.vps.example` | шаблон переменных (плейсхолдеры, в git) |
| `deploy/vps/.env.vps` | **секреты, в git НЕ попадает** (`.gitignore`) |
| `deploy/vps/gen-env.sh` | генерация секретов |
| `deploy/vps/bootstrap.sh` | полный прогон |
| `deploy/vps/build-vps.sh` | берегущая сборка образов группами (см. §3.1) |
| `deploy/vps/verify-images.sh` | приёмка образов: DC-1/DC-2 + фронтенды (§3.2) |
| `deploy/vps/redeploy.sh` | быстрый redeploy |
| `deploy/vps/seed.sh` | демо-пользователи |
| `deploy/vps/pack.sh` | архив исходников без секретов и артефактов |
| `scripts/seed/seed-demo-object.mjs` | демо-наполнение портала: владелец + объект (§5.1) |

---

## 5. Seed: как и почему именно так

`seed.sh` запускает **канонический** `scripts/seed/seed-users.mjs` в одноразовом
контейнере на runtime-образе `auth` с bind-mount двух файлов:

```bash
docker compose ... run --rm --no-deps \
  -v "$PWD/scripts/seed/seed-users.mjs:/repo/scripts/seed/seed-users.mjs:ro" \
  -v "$PWD/test/fixtures/users.json:/repo/test/fixtures/users.json:ro" \
  auth node /repo/scripts/seed/seed-users.mjs
```

> **Уточнение к §6 System Design (проверено при развёртывании).** В §6
> предполагалось монтировать в `/app`. Это было верно для старого паттерна
> Dockerfile, где у auth-образа `WORKDIR /app`; по целевому паттерну ADR-8/D-3
> runtime-WORKDIR = `/repo/backend/auth-service`, и **каталога `/app` в образе нет
> вовсе**. При монтировании в `/app` seed падал с
> `Cannot find module '@prisma/client'` (require stack указал на
> `/app/backend/auth-service/package.json`). Монтирование в `/repo` даёт
> `root = /repo`, и `require` находит модули в
> `/repo/backend/auth-service/node_modules` — там лежат `@prisma/client`,
> `bcrypt` и `prisma`.

Работает потому, что скрипт считает `root` от своего пути (`/repo`), а
`createRequire('/repo/backend/auth-service/package.json')` резолвит
`@prisma/client` и `bcrypt` из `/app/node_modules` (auth-образ копирует
`node_modules` целиком). `DATABASE_URL` берётся из окружения контейнера,
`/app/.env` в контейнере нет — `loadEnv()` молча продолжает. Скрипт и фикстуры
в образ НЕ копируются: backend-код не меняется.

Идемпотентность: upsert по email — повторный запуск не создаёт дублей, но
пересоздаёт `passwordHash`/`pinCode`/`biometricKey` (приводит стенд к
документированному состоянию).

Устаревший `/opt/cleaning-ops/deploy/vps/seed-users.js` **не используется**:
в нём нет PIN и биометрии, а поведение — «пропустить, если существует».

---

## 5.1. Демо-наполнение портала: владелец и его объект

**Зачем.** До 21.09.2026 привязки «аккаунт → объект» в БД не было: у `User` нет `objectId`,
а `GET /api/objects` не фильтрует по роли. Портал выводил «свой объект» сопоставлением
`Object.clientName` с идентификаторами сессии (`fullName` и `email` из `GET /api/auth/me`) —
код `frontend/web-client/src/hooks/useObjectScope.ts`. Без совпадения портал показывал
«Объект не подключён», даже если вход прошёл успешно. Поэтому на стенде заводился владелец
с `fullName`, **посимвольно равным** `clientName` объекта.

**Как теперь (с 21.09.2026, проект `prj-cleanfine-yavnaya-privyazka-obekta-k-akkauntu-za`).**
Привязка **явная**: у объекта есть `ownerClientId` (id аккаунта в auth-service), портал
определяет свой объект **только** по `ownerClientId === sessionUser.id` (фильтр
`GET /api/objects?ownerClientId=<id>`), эвристика по имени удалена начисто. Скрипт заводит
владельца и объект и проставляет `ownerClientId` — совпадение `fullName` с `clientName`
больше не является условием доступа (совпадать они могут, но уже как legacy-отображение).

**Запуск** (скрипт идемпотентен, работает через API поднятого стенда):

```bash
node scripts/seed/seed-demo-object.mjs
# другая база: API_BASE_URL=http://100.109.185.14:8091 node scripts/seed/seed-demo-object.mjs
```

`bootstrap.sh` вызывает его автоматически после `seed.sh` (шаг 5).

**Что создаётся** (создание — только если не найдено; повторный прогон не даёт дублей):

| Сущность | Значения |
|---|---|
| Пользователь-владелец | `owner@cleanfine.ru` / `owner123`, роль `CLIENT`, `fullName` = `ООО «Ромашка»`, PIN `5678` |
| Объект | `БЦ «Ромашка»`, `clientName` = `ООО «Ромашка»`, `clientContact` = `owner@cleanfine.ru`, **`ownerClientId` = id владельца**, `type` = `Бизнес-центр`, `address` = `г. Москва, ул. Ленинградская, 15`, `lat`/`lng` = `55.7851`/`37.5582`, `totalArea` = `12500.5`, `floorsCount` = `9` |

Пароль `owner123` — демо-уровня, как `admin123` в фикстурах. PIN `5678`
устанавливается отдельной ручкой `POST /api/auth/change-pin` под токеном самого
владельца (в `RegisterDto` поля PIN нет) и нужен только для мобильного входа —
портал авторизуется парой email + пароль. Проверено: `POST /api/auth/pin` с
`{"email":"owner@cleanfine.ru","pinCode":"5678"}` → 201 и access-токен.

**Квитанция «портал видит объект»** (это же печатает скрипт; запрос повторяет
поведение `useObjectScope` — фильтр по `ownerClientId`):

```bash
TOKEN=$(curl -s -X POST http://100.109.185.14:8091/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@cleanfine.ru","password":"owner123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
ME_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://100.109.185.14:8091/api/auth/me \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://100.109.185.14:8091/api/objects?ownerClientId=$ME_ID&take=100"
# → { "items": [ { "name": "БЦ «Ромашка»", "ownerClientId": "<id владельца>", ... } ], "total": 1 }
```

**Граница доступа — читать буквально.** Серверного scope в этом объёме **нет**:
`GET /api/objects` отдаёт объекты **любому аутентифицированному** пользователю,
`?ownerClientId=` — **фильтр списка, а не авторизация**, а `GET /api/objects/:id`
открыт по id. Клиент может запросить чужой объект напрямую (`?ownerClientId=<чужой id>`
или `/api/objects/<чужой id>`) и увидеть его. Портал — это **UI-механика поверх
существующего API, а не граница доступа**: не принимайте его за разграничение прав.
Прочие ограничения: у клиента с несколькими объектами портал открывает первый по
возрастанию `id` (многообъектный UX — вне объёма), `take ≤ 100`, поэтому выбор идёт по
первой сотне.

Про `type` объекта: в core-service это **свободная строка** (валидатор —
только `@IsString()` + `@IsNotEmpty()`, см. `backend/core-service/src/objects/dto/object.dto.ts`).
Админская форма предлагает справочник подсказок `COMMON_OBJECT_TYPES`
(`frontend/web-admin/src/pages/Objects/utils.ts`) через `<datalist>`, но список не
закрытый; в скрипте взято значение оттуда — `Бизнес-центр`.

---

## 5.2. Привязка объекта к аккаунту: эксплуатация и её зависимость от служебной учётки

**Как привязать.** В админке (`:8090`) → «Объекты» → форма объекта → селект **«Аккаунт заказчика»**
(источник — `GET /api/users?role=CLIENT`, предлагаются только активные аккаунты) → выбрать
`fullName (email)`; выбор подставит `clientName`/`clientContact`, но это лишь legacy-отображение.
Через API: `POST /api/objects` или `PATCH /api/objects/:id` с `ownerClientId: "<id аккаунта>"` —
под ролью ADMIN/SUPERVISOR. Ответ `201`/`200` содержит `ownerClientId`.

**Три состояния поля в `PATCH`** (проверено запуском):

| Тело `PATCH` | Что происходит |
|---|---|
| поля `ownerClientId` нет | привязка **не меняется** (обычная правка названия её не затирает) |
| `"ownerClientId": null` | привязка **снимается** (валидация аккаунта не выполняется) |
| `"ownerClientId": "<id>"` | аккаунт проверяется в auth-service, затем записывается |

**Как снять.** В админке — опция «— Без привязки —» (шлёт `null`); через API — `PATCH` с
`{"ownerClientId": null}`. Объект остаётся в админке с ручным `clientName` и меткой «Без привязки»,
но в портале больше никому не виден, пока его не привяжут снова.

**Массовый backfill объектов-наследия** (объектов без привязки):

```bash
node scripts/seed/backfill-owner-client.mjs            # dry-run: печатает план, ничего не меняет
node scripts/seed/backfill-owner-client.mjs --commit   # применить
# другая база: API_BASE_URL=http://100.109.185.14:8091 node scripts/seed/backfill-owner-client.mjs
```

Скрипт идемпотентен и консервативен: трогает только объекты с `ownerClientId = null`, привязывает
только при **единственном точном** совпадении нормализованного `clientName` с `fullName` или
`email` активного CLIENT-аккаунта, при неоднозначности ничего не меняет и печатает кандидатов,
`clientName`/`clientContact` не переписывает, работает только через API стенда (не INSERT).

**Что делать при `503` «Не удалось проверить аккаунт заказчика».** Это fail-closed: запись не
выполнена, привязка не сохранена (объекты без привязки при этом создаются штатно). Причина всегда
одна из трёх: auth-service недоступен/таймаутит (`AUTH_SERVICE_TIMEOUT_MS`, по умолчанию 5 с);
`SERVICE_AUTH_EMAIL`/`SERVICE_AUTH_PASSWORD` не заданы в окружении core; **служебная учётка
потеряла права или пароль разошёлся**. Порядок проверки:

```bash
COMPOSE="docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml"
$COMPOSE logs --tail=50 core | grep -i 'аккаунт\|auth-service\|SERVICE_AUTH'   # причина в логе core
$COMPOSE exec -T core printenv | grep -E 'AUTH_SERVICE_URL|SERVICE_AUTH'       # переменные доехали
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://100.109.185.14:8111/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SERVICE_AUTH_EMAIL\",\"password\":\"$SERVICE_AUTH_PASSWORD\"}"   # учётка жива?
```

**Зависимость эксплуатации (важно).** Служебная учётка — это `admin` с ролью
**ADMIN** и паролем seed-администратора (`admin123`), решение O4. Привязка объектов работает
только пока эта учётка активна, имеет роль **ADMIN или SUPERVISOR** и её пароль совпадает с
`SERVICE_AUTH_PASSWORD` в `deploy/vps/.env.vps`. **Понижение роли** → `GET /api/users/:id`
вернёт 403 → привязка отказывает с 503; **смена пароля без правки `.env.vps`** (и пересоздания
core) — то же самое. Для прод-эксплуатации нужна отдельная сервисная роль, а не seed-админ.

---

## 6. Проверка работоспособности (AC-1…AC-8)

```bash
COMPOSE="docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml"

# AC-1: 15 контейнеров, 4 инфраструктурных healthy
$COMPOSE ps

# AC-2: фронтенды отвечают 200
curl -s -o /dev/null -w 'web-admin %{http_code}\n' http://100.109.185.14:8090/
curl -s -o /dev/null -w 'web-client %{http_code}\n' http://100.109.185.14:8091/

# AC-3: логин 201 и role=ADMIN
TOKEN=$(curl -s -X POST http://100.109.185.14:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -H "Authorization: Bearer $TOKEN" http://100.109.185.14:8090/api/auth/me

# AC-4: 9 сервисов отвечают (осмысленный HTTP-код 200/401/404, не 000)
probe() { echo "$1 $2 → $(curl -s -o /dev/null -w '%{http_code}' "http://100.109.185.14:$1$2" || echo 000)"; }
probe 8111 /api/auth/me
probe 8112 /api/files/health/ping
probe 8113 /api/objects
probe 8114 /api/gps/tracks
probe 8115 /api/tickets
probe 8116 /api/notifications
probe 8117 /api/materials
probe 8118 /api/schedule
probe 8119 /api/chat/chats

# AC-5: демо-стенд не изменён (число контейнеров и порты :80/:8080/:3001–3009)
docker ps --format '{{.Names}}' | grep -c '^cleaning-ops-vps-'
ss -ltn | grep -E ':(80|8080|300[1-9])\b'

# AC-6: миграции и seed без дублей
for svc in auth files core gps tickets notifications materials schedule chat; do
  $COMPOSE run --rm --no-deps $svc npx prisma migrate status | tail -1
done
$COMPOSE exec -T postgres psql -U admin -d cleaning_ops -tAc 'select count(*) from users'

# AC-7: секретов в git нет
git status --short            # .env.vps не должен появиться

# DC-3: в логах нет ошибок резолва контрактов
$COMPOSE logs 2>&1 | grep -E 'Cannot find module|ERR_PACKAGE_PATH_NOT_EXPORTED' || echo 'чисто'
```

### Проверка резолва `@cleaning-ops/shared` (DC-1/DC-2)

```bash
docker run --rm --entrypoint sh prj-cleanfine-core -c \
  'test -f node_modules/@cleaning-ops/shared/dist/constants/events.js && echo OK'   # DC-1
docker run --rm --entrypoint node prj-cleanfine-core -e \
  "console.log(require('@cleaning-ops/shared/constants/events').EVENTS_EXCHANGE, require('@cleaning-ops/shared/types/core').OBJECT_STATUSES)"
# ожидается: cleaning-ops.events [ 'ACTIVE', 'PAUSED', 'ARCHIVED' ]
```

---

## 7. Доказательство изоляции от демо-стенда

| Ресурс | `prj-cleanfine` | `cleaning-ops-vps` |
|---|---|---|
| compose-проект | `prj-cleanfine` | `cleaning-ops-vps` |
| контейнеры | `prj-cleanfine-*` | `cleaning-ops-vps-*` |
| сеть | `prj-cleanfine-net` | `cleaning-ops-vps_default` |
| тома | `prj-cleanfine-{pg,redis,rabbit,minio}-data` | `cleaning-ops-vps_*` |
| порты | `100.109.185.14:{8090,8091,8111–8119,8120,8121}` | `0.0.0.0:{80,8080,3001–3009}` |

Пересечений нет ни по одному имени. Операции над проектом (`down`, `down -v`,
`up`) не затрагивают демо-стенд: `docker compose` адресует только свой проект.

---

## 8. Откат

```bash
COMPOSE="docker compose --env-file deploy/vps/.env.vps -f deploy/vps/docker-compose.yml"

$COMPOSE down        # стоп + удаление контейнеров и сети, ТОМА СОХРАНЯЮТСЯ
$COMPOSE down -v     # полный снос: удаляются и тома (БД, объекты MinIO, очереди)
```

| Что | `down` | `down -v` |
|---|---|---|
| контейнеры проекта | удаляются | удаляются |
| сеть `prj-cleanfine-net` | удаляется (создаётся заново на `up`) | удаляется |
| тома (данные) | **сохраняются** | **удаляются** |
| собранные образы | сохраняются | сохраняются |
| демо-стенд | не затрагивается | не затрагивается |

> Проверено на стенде (AC-8): после `down` без `-v` контейнеров проекта — 0,
> тома `prj-cleanfine-*` на месте, порты освобождены, демо-стенд продолжает
> отвечать (`:80`/`:8080` → 200). После `up -d` встали все 15 контейнеров с
> первой попытки, а данные уцелели: те же 4 пользователя, миграции
> `up to date`, логин → 201, `role: ADMIN`.

Возврат: `bash deploy/vps/bootstrap.sh` (после `down` — на тех же данных; после
`down -v` — с нуля: initdb пересоздаст БД, миграции и seed применятся заново).

---

## 9. Переменные и решения по стенду

Полный набор — `deploy/vps/.env.vps.example` (матрица: System Design §5).

| Решение | Значение | Почему |
|---|---|---|
| Публикация | только `100.109.185.14` | NFR-2: ничего в публичный интернет |
| MinIO | опубликован на 8120 (S3) и 8121 (console), `MINIO_PUBLIC_URL=http://100.109.185.14:8120` | **отклонение D-1** (решение владельца O2): иначе `file-service` отдаёт URL `http://minio:9000/...`, который из браузера не открывается и планы этажей/фото сломаны. Внутри сети S3-клиент по-прежнему ходит на `minio:9000` |
| `SERVICE_AUTH_PASSWORD` | `admin123` — равен паролю seed-админа | O4: иначе межсервисные вызовы (chat/material/schedule) получают 401/502. С 21.09.2026 тем же паролем пользуется проверка аккаунта заказчика при записи `ownerClientId` (§5.2) — смена пароля без правки `.env.vps` вернёт привязке 503 |
| `AUTH_SERVICE_URL` / `AUTH_SERVICE_TIMEOUT_MS` | из compose-якоря `x-app-env` / дефолт **5 000 мс** | core ходит в auth за фактами об аккаунте (`id`/`role`/`isActive`); короткий таймаут, чтобы недоступность auth не подвешивала создание объекта (fail-closed → 503) |
| `SCHEDULE_CRON_ENABLED` | `true` (прод-подобно) | O5: для прогона e2e поставьте `false` и выполните `redeploy.sh` |
| `VITE_MAPBOX_TOKEN` | пустой | O7: карта показывает заглушку «ключ не настроен» |
| `FIREBASE_*` | пустые | O7: push идёт через мок-адаптер |
| `THROTTLE_LOGIN_LIMIT` / `THROTTLE_GLOBAL_LIMIT` | не задаются | O6: прод-дефолты 5/мин и 100/мин. Прогон e2e против стенда потребует их поднять (вне объёма) |
| `VITE_WS_URL` | не задаётся | WebSocket-upgrade делает nginx (`location /socket.io/` → `chat:3009`) |
| Размер пула Prisma | `connection_limit=8` в каждом `*_DATABASE_URL` | 9 × 8 = 72 соединения при `max_connections=100`; без лимита Prisma берёт `num_cpus*2+1` на сервис |
| `jit=off` для postgres | **не ставим** | в `infra/docker/docker-compose.yml` это обходной путь для Apple Silicon/qemu; VPS — x86 |

### Ресурсные лимиты (System Design §8)

| Сервис | `mem_limit` | `cpus` | `pids_limit` |
|---|---|---|---|
| postgres | 768m | 1.0 | 200 |
| redis | 96m | 0.25 | 50 |
| rabbitmq | 320m | 0.5 | 300 |
| minio | 320m | 0.5 | 100 |
| каждый из 9 backend | 320m | 0.25 | 200 |
| web-admin / web-client | 96m | 0.25 | 100 |
| rabbitmq-init (одноразовый) | 32m | 0.1 | 50 |

Потолок по памяти ≈ **4.5 ГиБ** (+32 МиБ на одноразовый `rabbitmq-init`).
Фактическое потребление после развёртывания — **731 МиБ** суммарно по 15
контейнерам (замер `docker stats --no-stream`), то есть потолок далеко не
достигается. `cpus` — мягкая квота (oversubscribe допустим).
Логи: `json-file`, `max-size=10m`, `max-file=3` — у всех 15 контейнеров.

### 9.1. Отклонения, найденные при развёртывании

| Что | Как сделано | Почему |
|---|---|---|
| Сервис `rabbitmq-init` (16-й, одноразовый) | `alpine:3.20` с `chown`/`chmod` тома и ПРЕДсозданием `.erlang.cookie`; `rabbitmq` зависит от него через `service_completed_successfully` | На **свежем** тома `rabbitmq:3-management-alpine` не стартовал: `Error when reading /var/lib/rabbitmq/.erlang.cookie: eacces` (3 из 3 прогонов, `State=exited`, `ExitCode=1`). `docker-entrypoint.sh` образа делает `find /var/lib/rabbitmq ! -user rabbitmq -exec chown rabbitmq +` **до** того, как Erlang создаст cookie, и файл остаётся недоступным. Если cookie существует заранее — entrypoint успевает его забрать и старт проходит. После правки: 3 из 3 свежих прогонов поднимаются без `eacces` |
| Healthcheck rabbitmq | `nc -z 127.0.0.1 5672` вместо `rabbitmq-diagnostics -q ping` | Любой вызов `rabbitmq-diagnostics` поднимает отдельную Erlang VM и занимает 7–15 с (замеры: 7.3 / 7.3 / 8.0 / 9.5 / 10.2 / 11.5 / 11.5 / 14.3 / 14.7 / 14.9 с), а Docker жёстко ограничивает `timeout` 30 с. При `timeout: 10s` из §3/§8 проверка не сходилась **никогда** — `Health check exceeded timeout (10s)` на живом сервере. `nc` есть в образе и проверяет readiness AMQP-порта |
| Healthcheck MinIO | `mc ready local` (без изменений) | Выбор из §2 подтверждён на живом контейнере: `healthy` за ~30 с |
| Проверка живости сервисов в `bootstrap.sh` | Проба своего эндпоинта каждого из 9 сервисов, при отсутствии ответа — один `up -d --force-recreate` | При первом старте сервис может обратиться к postgres до того, как тот начнёт принимать соединения, и упасть на инициализации Prisma. Наблюдалось: `core` — `P2024` «Timed out fetching a new connection from the connection pool», `schedule` — `P1001` «Can't reach database server at postgres:5432». Контейнеры объявлены без политики `restart`, поэтому без повтора сервис остался бы лежать |
| Пути монтирования seed | `/repo/...` вместо `/app/...` | См. §5 (уточнение к §6 System Design) |

**Если хост начал упираться в память** (ADR-6, пошагово):
1. снизить backend `mem_limit` 320m → 256m;
2. `SCHEDULE_CRON_ENABLED=false` в `.env.vps` + `bash deploy/vps/redeploy.sh`;
3. остановить только свой стенд (`$COMPOSE down`); демо-стенд не трогать;
4. добавить swap.

---

## 10. Известные ограничения

- **Мобильное приложение не входит в стенд** (сборка APK/IPA, доставка, реальный
  Firebase push — вне объёма PRD).
- **TLS/домен, Prometheus/Grafana/Alertmanager, бэкапы и восстановление** — вне
  объёма PRD (М7.5 и прод-эксплуатация). Стенд доступен по HTTP в tailnet.
- **Карта и push** — заглушки (пустые `VITE_MAPBOX_TOKEN`, `FIREBASE_*`).
- **Портал не проксирует `/api/files` и `/api/gps`** — это зеркалит dev-конфиг
  Vite: такие пути уходят в catch-all `auth:3001` и получают 404.
- Redis объявлен в инфраструктуре ради паритета с эталоном, но **ни один сервис
  его не читает** (`REDIS_URL` не используется в коде).
- Стенд использует демо-пароли seed (`admin123`) как пароль сервисной учётки —
  это осознанное решение O4 для работоспособности внутренних вызовов. Для
  прод-эксплуатации нужна отдельная сервисная роль.
- **Серверного scope в API объектов нет** (2026-09-21): `GET /api/objects` и
  `GET /api/objects/:id` доступны любому аутентифицированному пользователю, а фильтр
  `?ownerClientId=` — фильтр списка, а не авторизация. Портал скрывает чужие объекты
  на уровне UI, но **не является границей доступа**; клиент может запросить чужой объект
  напрямую. Подробно — §5.1 и §5.2.
- **Привязка объекта к аккаунту зависит от служебной учётки.** Она идёт под
  `SERVICE_AUTH_EMAIL`/`SERVICE_AUTH_PASSWORD` (seed-админ, роль ADMIN): понижение роли
  или смена пароля без правки `.env.vps` превращают привязку/перепривязку объектов в
  **503** (fail-closed). Диагностика — §5.2.
- **`P3005` и baseline в `redeploy.sh` не автоматизированы** (§4): на базе без
  `_prisma_migrations` шаг миграций падает и останавливает выкат; лечение — вручную
  `prisma migrate resolve --applied`.
- **UI-e2e портала не исполняются в этой среде**: chromium не стартует (нет
  `libatk`/`libXcomposite`/`libgbm`/`libxkbcommon`), установка через apt блокируется
  песочницей. Кейсы закрыты на уровне API и проверкой текста в собранном бандле.
- **Прогон e2e против стенда требует поднять лимиты входа** (`THROTTLE_LOGIN_LIMIT`,
  `THROTTLE_GLOBAL_LIMIT`): разово переменные добавлялись в `.env.vps` и compose и затем
  возвращались побайтово; регулярный прогон нужно решать в `deploy/vps` осознанно.
