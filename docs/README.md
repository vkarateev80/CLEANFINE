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
Design System	🟡 Токены DS-001 + экраны DS-003	~40%
Backend Services	🟢 auth, files, core	~35% (3 из 9 сервисов)
Web Admin	🟡 Экраны входа и ядра	~30%
Mobile App	🔴 Не начат (М6)	0%
DevOps	🟡 Docker + CI (не прогнан на GitHub)	~40%
QA	🟢 Unit 100% (core), e2e: auth + ядро	~30%

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
