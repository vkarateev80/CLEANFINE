<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

ГЛАВНЫЙ README (ORCHESTRATOR)
# 🧹 Cleaning Ops — Система управления клинингом

> Мультиплатформенное приложение для управления клининговыми работами
> Толстый клиент: Flutter (iOS/Android) + React (Web Admin)
> Тонкий клиент: Web Portal для заказчиков

---

## 📁 Структура репозитория
cleaning-ops/
├── .github/
│ └── workflows/ # CI/CD pipelines
├── backend/
│ ├── auth-service/ # 🔐 Аутентификация
│ ├── core-service/ # 🏢 Объекты, маршруты, техкарты
│ ├── ticket-service/ # 📋 Заявки
│ ├── gps-service/ # 📍 GPS-трекинг
│ ├── file-service/ # 📸 Фото/видео
│ ├── material-service/ # 📦 Материалы
│ ├── schedule-service/ # 📅 Графики
│ ├── chat-service/ # 💬 Чат
│ └── notification-service/ # 🔔 Уведомления
├── frontend/
│ ├── web-admin/ # 🖥 Админ-панель (React)
│ └── web-client/ # 🌐 Портал клиента (React)
├── mobile/
│ └── cleaning-ops-app/ # 📱 Мобильное приложение (Flutter)
├── shared/
│ ├── types/ # 📝 Общие TypeScript типы
│ ├── constants/ # 🔢 Константы
│ └── utils/ # 🛠 Утилиты
├── infra/
│ ├── docker/ # 🐳 Docker конфигурации
│ ├── k8s/ # ☸️ Kubernetes манифесты
│ └── terraform/ # 🏗 Инфраструктура
├── docs/
│ ├── api/ # 📚 API документация
│ ├── architecture/ # 🏛 Архитектура
│ └── agents/ # 🤖 Спецификации агентов
└── scripts/
├── setup/ # ⚙️ Скрипты настройки
└── seed/ # 🌱 Seed-данные

text

---

## 🏛 Архитектура

### Многослойная архитектура
┌─────────────────────────────────────────────────────────────┐
│ CLIENT LAYER (Толстый клиент) │
│ │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│ │ Flutter App │ │ React Admin │ │ React Client │ │
│ │ (iOS/Android│ │ (Web) │ │ Portal (Тонкий) │ │
│ │ Offline-first│ │ Full access │ │ Limited access │ │
│ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘ │
│ │ │ │ │
│ └─────────────────┼───────────────────┘ │
│ │ HTTPS/REST/WebSocket │
└───────────────────────────┼─────────────────────────────────┘
│
┌───────────────────────────▼─────────────────────────────────┐
│ API GATEWAY │
│ (Traefik / Kong) │
│ • Rate Limiting • Load Balancing • SSL • Auth Proxy │
└───────────────────────────┬─────────────────────────────────┘
│
┌───────────────────────────▼─────────────────────────────────┐
│ SERVICE LAYER (Микросервисы) │
│ │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│ │ Auth │ │ Core │ │ Ticket │ │ GPS │ │
│ │ Service │ │ Service │ │ Service │ │ Service │ │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│ │ │ │ │ │
│ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌──────▼───────┐ │
│ │ File │ │ Material│ │ Schedule│ │ Chat │ │
│ │ Service │ │ Service │ │ Service │ │ Service │ │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│ │ │ │ │ │
│ ┌────▼────────────▼────────────▼──────────────▼───────┐ │
│ │ Notification Service │ │
│ └────────────────────────┬────────────────────────────┘ │
│ │ │
└───────────────────────────┼────────────────────────────────┘
│
┌───────────────────────────▼────────────────────────────────┐
│ DATA LAYER │
│ │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│ │ PostgreSQL │ │ Redis │ │ S3 (MinIO) │ │
│ │ + PostGIS │ │ Cache/PubSub│ │ File Storage │ │
│ └──────────────┘ └──────────────┘ └──────────────────┘ │
│ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Message Broker (RabbitMQ / NATS) │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

text

### Паттерны

| Паттерн | Применение |
|---------|------------|
| **Microservices** | Разделение бизнес-логики на сервисы |
| **Event-Driven** | События между сервисами (RabbitMQ) |
| **CQRS** | Разделение чтения/записи для отчетов |
| **Repository** | Абстракция над БД |
| **Dependency Injection** | IoC контейнер в NestJS |
| **Observer** | Уведомления, WebSocket |
| **State Machine** | Статусы заявок |
| **Strategy** | Типы уборки, типы заявок |
| **Factory** | Создание заявок разных типов |

---

## 🚀 Быстрый старт

### Предварительные требования

```bash
# Базовые инструменты
node >= 18
pnpm >= 8
docker >= 24
docker-compose >= 2
flutter >= 3.16
dart >= 3.2
postgres >= 15
redis >= 7
kubectl (опционально)
Установка
bash
# 1. Клонировать репозиторий
git clone https://github.com/cleaning-ops/cleaning-ops.git
cd cleaning-ops

# 2. Установить зависимости
pnpm install

# 3. Настроить окружение
cp .env.example .env
# Отредактировать .env

# 4. Запустить инфраструктуру
docker-compose up -d

# 5. Запустить миграции
pnpm migrate

# 6. Заполнить seed-данными
pnpm seed

# 7. Запустить backend (development)
pnpm dev:backend

# 8. Запустить frontend (development)
pnpm dev:web

# 9. Запустить mobile
cd mobile/cleaning-ops-app
flutter run
🔧 Технологический стек
Backend
Технология	Версия	Назначение
Node.js	20 LTS	Runtime
NestJS	10	Backend framework
TypeScript	5.4	Язык
PostgreSQL	16	Основная БД
PostGIS	3.4	Геоданные
Redis	7.2	Cache, Pub/Sub
RabbitMQ	3.13	Message broker
Prisma	5	ORM
Socket.io	4	WebSocket
Firebase Admin	12	Push-уведомления
MinIO	2024	S3-совместимое хранилище
Jest	29	Тестирование
Frontend (Web)
Технология	Версия	Назначение
React	18	UI библиотека
TypeScript	5.4	Язык
Vite	5	Build tool
React Router	6	Роутинг
Zustand	4	State management
TanStack Query	5	Server state
Tailwind CSS	3	Стили
Mapbox GL	3	Карты
Recharts	2	Графики
Storybook	8	Документация компонентов
Mobile (Flutter)
Технология	Версия	Назначение
Flutter	3.19	Framework
Dart	3.3	Язык
Riverpod	2.5	State management
go_router	14	Навигация
dio	5	HTTP клиент
drift	2	Локальная БД (SQLite)
flutter_map	7	Карты
geolocator	11	Геолокация
camera	0.10	Камера
local_auth	2	Биометрия
📚 Документация агентов
Каждый агент имеет свой MD-файл со спецификацией:

Агент: Design System

Агент: Backend Auth

Агент: Backend Core

Агент: Backend Tickets

Агент: Backend GPS

Агент: Backend Files

Агент: Backend Materials

Агент: Backend Schedule

Агент: Backend Chat

Агент: Backend Notifications

Агент: Frontend Web

Агент: Frontend Mobile

Агент: DevOps

Агент: QA

🤝 Правила работы в команде
Каждый агент работает только в своей директории

Изменения в shared/ требуют review от архитектора

Все PR должны проходить CI

Code review обязателен для merge в main

Тесты должны проходить перед merge

📊 Статус проекта
Компонент	Статус	Прогресс
Design System	🟡 Токены DS-001 + экраны DS-003, DS-004	~55%
Backend Services	🟢 auth, files, core, gps, tickets, notifications, materials, schedule, chat	~85% (9 из 9 сервисов)
Web Admin	🟢 Вход, ядро, заявки, карта, in-app, материалы, графики, сообщения	~85%
Web Client (портал)	🟡 Вход, объект, заявки, отчёт, чат (М5.4)	~50%
Mobile App	🟡 М6 реализуется частично (М6.0–М6.7, часть 1)	—
DevOps	🟢 Docker + зелёный CI на GitHub + изолированный VPS-стенд `prj-cleanfine`	—
QA	🟢 Unit: core 100 %, сервисы М3–М5 97–100 %; e2e: вход + ядро + оперативка + планирование + чат; UAT М7.4, k6	—

> **Обновление: изолированный VPS-стенд `prj-cleanfine` и deploy-kit в репозитории (2026-09-21, см. КОНТЕКСТ.md, раздел 0.13):**
> - **Deploy-kit вернулся в git** — `deploy/vps/` (прод-compose `name: prj-cleanfine`, `Dockerfile.web` для фронтендов, nginx-конфиги, `.env.vps.example`, `gen-env.sh`, `bootstrap.sh`, `redeploy.sh`, `seed.sh`, `build-vps.sh`, `verify-images.sh`, `pack.sh`, `README.md`). Полный runbook — `deploy/vps/README.md`.
> - **Стенд поднят из актуального `develop`** (вершина `5443a80`): 15 контейнеров, публикация только в tailnet `100.109.185.14` (web-admin `8090`, портал `8091`, сервисы `8111–8119`, MinIO `8120`/`8121`), миграции 9/9, seed 4 пользователя, 731 МиБ при потолке лимитов ≈ 4.5 ГиБ по составу `mem_limit` (postgres 768m, redis 96m, rabbitmq 320m, minio 320m, девять backend по 320m, два фронтенда по 96m — сходится с `docs/FACTS.md` §1 и `deploy/vps/README.md` §9). Демо-стенд `cleaning-ops-vps` (`:80`/`:8080`/`:3001–3009`) не изменён, AC-1…AC-8 пройдены.
> - **Найден и исправлен дефект сборки:** контракты `@cleaning-ops/shared` не резолвились в рантайме образов (`tsc` не переписывает `paths`; в `exports` не было `require`/`default`) — 23 рантайм-импорта в семи сервисах. Коммит `d746ee0` (`shared/package.json` + 9 `backend/*/Dockerfile`), коммит `5443a80` — kit и демо-наполнение (`scripts/seed/seed-demo-object.mjs`).
> - **М7.5 (Terraform/K8s/ingress/API-gateway, домен и TLS) и М7.6 (релиз v1.0.0, merge `develop` → `main`) — не начаты**; мобильное приложение, мониторинг и бэкапы в стенд не входят.
> - Таблица выше отражает проверенные компоненты; проценты прогресса оставлены как историческая оценка, потому что автор раздела их не подтверждал.

> **Обновление: пуш в GitHub и первый зелёный CI (2026-09-16, см. КОНТЕКСТ.md, раздел 0.11):**
> - Репозиторий запушен: `origin` = `vkarateev80/CLEANFINE` (private, до 21.09.2026 назывался `DOMKLIR`), ветка по умолчанию — `develop`.
> - Первые живые прогоны CI вскрыли три дефекта, каждый закрыт: дедупликация Prisma-клиента в pnpm
>   (auth-service собирался с моделями ticket-service) → `scripts/ci/prisma-clients.mjs`;
>   необъявленные зависимости `@types/passport`, `jsonwebtoken`, `socket.io-client`; жёсткое имя
>   auth-базы в e2e-уборке → имя выводится из URL сервиса (`test/helpers/db-name.ts`).
> - Устранён флейк пагинации уведомлений: к сортировке добавлен tie-breaker по `id`.
> - Зелёный прогон: `quality` (lint/build/typecheck/unit девяти сервисов + сборка web-admin и
>   портала) и `e2e` — **137 passed / 1 skipped / 0 failed**, полный прогон ~10.5 мин.

> **Обновление М5 (2026-09-15, см. ПЛАН.md + КОНТЕКСТ.md, раздел 0.10):**
> - **М5 «Коммуникации» реализована:** chat-service (:3009, БД `cleaning_ops_chat`) — REST для чатов,
>   истории с курсором, поиска и отметки прочтения плюс WebSocket-шлюз на `/chat` с JWT-авторизацией
>   handshake, онлайн-картой и событиями `message:send`/`message:new`/`message:read`; оффлайн-получателям
>   уходит push типом `CHAT_MESSAGE` через notification-service.
> - **Web-admin:** страница «Сообщения» (Inbox с фильтром по типу, подгрузкой истории и отметкой
>   прочтения), чат заявки в карточке заявки и чат объекта на странице объекта; реальное время через
>   socket.io-client с REST-фолбэком при обрыве.
> - **Портал заказчика `frontend/web-client`** (:5174): вход CLIENT, статус своего объекта, заявки с
>   созданием, отчёт по расходу, чат с менеджером, мобильный каркас с нижним таб-баром — по
>   спецификациям DS-004.
> - **QA М5:** unit chat 150 тестов (97 %+); e2e `chat.api.spec.ts` — 9 тестов, включая два реальных
>   WebSocket-соединения, изоляцию участников и push оффлайн; полная регрессия `--project=api`
>   99 passed / 1 skipped / 0 failed.
> - **Инфраструктура:** восьмая БД, порт 3009, прокси админки и портала, CI собирает и запускает
>   chat-service и портал, а quality-джоба впервые проверяет фронтенды (typecheck + build).

> **Обновление М4 (2026-09-15, см. ПЛАН.md + КОНТЕКСТ.md, раздел 0.9):**
> - **М4 «Планирование и учёт» реализована:** material-service (:3007, справочник, склады,
>   движения с транзакционным пересчётом, автосписание по завершённой операции с идемпотентностью
>   и порогом `material.low`) и schedule-service (:3008, графики с recurrence, генерация смен и
>   плановых заявок, check-in по геозоне, неявки → `SCHEDULE_MISSED`, авто check-out).
> - **Web-admin:** экраны «Материалы» (справочник, остатки, движения, история, отчёт) и
>   «Графики и смены» (графики, смены дня, свои смены с отметкой по геолокации). Закрыта
>   интеграционная точка М2.6: материал операции техкарты выбирается из справочника, списание
>   можно привязать к заявке.
> - **QA М4:** unit material 105 / schedule 172 теста (покрытие 97–99 %); e2e-набор планирования —
>   16 API-тестов + 17 UI (включая сквозное автосписание, удаление материала вместе со строками
>   идемпотентности и выбор материала техкарты из справочника); полная регрессия
>   `--project=api` 84 passed / 1 skipped, `--project=web` 29 passed.
> - **Инфраструктура:** седьмая БД, порты 3007/3008, Vite-прокси, CI-джоба с восемью сервисами;
>   в e2e выключен cron schedule-service и в SQL-проверки передаётся id service-контейнера postgres.
> - Статусы компонентов: Backend Services 🟢 (8 из 9 сервисов), Web Admin 🟡 (вход, ядро,
>   оперативка, планирование), QA 🟢 по покрытию unit и e2e.

> **Обновление М3 (2026-09-15, см. ПЛАН.md + КОНТЕКСТ.md, раздел 0.8):**
> - **М3 «Оперативка» реализована:** gps-service (:3004, PostGIS-треки и геозоны, ближние
>   сотрудники, `geofence.exit`), notification-service (:3006, push-мок/FCM, 5 шаблонов, in-app,
>   консьюмер на 6 очередей), ticket-service (:3005, state machine из `shared`, эскалация,
>   SOS-вертикаль, идемпотентное завершение операций).
> - **Web-admin:** экраны «Заявки» (фильтры, SOS, карточка с переходами и операциями) и «Карта»
>   (Mapbox GL: геозоны, сотрудники, трек; при пустом `VITE_MAPBOX_TOKEN` — заглушка + данные
>   списком), in-app уведомления (колокольчик, polling 30 с, настройки подписок).
> - **QA М3:** unit gps 112 / tickets 140 / notifications 167 тестов (покрытие 99–100 %);
>   e2e-набор оперативки (tickets/gps/notifications + SOS-вертикаль).
> - **Инфраструктура:** три БД на сервис, initdb-скрипт в compose, Vite-прокси, CI e2e-джоба
>   с RabbitMQ и всеми шестью сервисами, Dockerfile для gps/ticket/notification.
> - Статусы компонентов: Backend Services 🟢 (6 из 9 сервисов), Web Admin 🟡 (вход + ядро +
>   оперативка), QA 🟢 по покрытию unit и e2e.

> **Обновление М2 (2026-09-15, см. ПЛАН.md + КОНТЕКСТ.md):**
> - **М0 и М1 завершены:** Docker заработал (контейнеры `healthy`), миграции/seed/смоук логина выполнены,
>   auth покрыт юнит-тестами на 100 %, e2e вертикали входа зелёные.
> - **М2 завершена:** file-service (MinIO, водяные знаки, миниатюры, привязки) и core-service
>   (объекты → этажи → помещения → маршруты → техкарты; 274 unit-теста, покрытие 100 %);
>   экраны web-admin (Objects/Floors/Routes/TechCards); e2e ядра 19 тестов + UI-сценарий М2.7
>   (4 теста); Dockerfile для file/core и CI-джобы quality/e2e. 8 дефектов, найденных QA, исправлены.
> - Статусы компонентов: Design System 🟡 (токены + DS-003), Backend Services 🟢 (auth/files/core,
>   остальные сервисы — М3+), Web Admin 🟡 (вход + ядро, дальше заявки/карта), Mobile/DevOps/QA —
>   см. таблицу.
> - Актуальное состояние, коммиты и обходные пути окружения: [`КОНТЕКСТ.md`](../../КОНТЕКСТ.md) в корне репозитория.
📝 Конвенции
Git
main — production-ready код

develop — интеграционная ветка

feature/{task-id}-{description} — фичи

bugfix/{task-id}-{description} — багфиксы

release/{version} — релизы

Коммиты (Conventional Commits)
text
feat: добавить эндпоинт для создания заявки
fix: исправить валидацию email
docs: обновить документацию API
test: добавить тесты для auth service
refactor: переписать логику геозон
Код-стиль
Backend: ESLint + Prettier (NestJS config)

Web: ESLint + Prettier (React config)

Mobile: dart format + flutter_lints

📞 Контакты
Архитектор: architect@cleaning-ops.com

Tech Lead: techlead@cleaning-ops.com

Поддержка: support@cleaning-ops.com

📄 Лицензия
Проприетарная лицензия. Все права защищены.
