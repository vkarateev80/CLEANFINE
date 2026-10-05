# 🏛 Архитектура системы CLEANFINE

> Создан в М0.3 на основе УСТАВ.md (разделы «Архитектура», «Структура репозитория», «Технологический стек») + решений архитектора (ПЛАН.md, раздел 2, решения №1–4). Канонический источник: `УСТАВ.md` в корне репозитория.

## 1. Ключевые решения (зафиксированы в М0)

| № | Решение | Обоснование |
|---|---------|-------------|
| 1 | В корень монорепо добавлена директория `design/` (рабочая директория агента Design System) | Отсутствует в разделе «Структура репозитория» устава |
| 2 | В Web Admin добавлена страница «Сообщения» (Inbox) для direct-чатов менеджера | Портал «Чат с менеджером» требует собеседника; в уставе страницы чата в админке нет |
| 3 | Firebase в dev-окружении заменяется мок-адаптером (лог + in-app); реальный push — при наличии ключей | Нет Firebase-проекта на этапе разработки |
| 4 | Отчёты (М7) — read-модели поверх PostgreSQL (SQL views + репозитории) | Паттерн CQRS из устава в «облегчённой» форме |

## 2. Многослойная архитектура

```
CLIENT LAYER
  Flutter App (iOS/Android, offline-first) | React Admin (Web) | React Client Portal (тонкий)
        │  HTTPS / REST / WebSocket
        ▼
API GATEWAY (Traefik / Kong): Rate Limiting, Load Balancing, SSL, Auth Proxy
        ▼
SERVICE LAYER (микросервисы NestJS)
  auth │ core │ tickets │ gps │ files │ materials │ schedule │ chat └──► notification
        ▼
DATA LAYER
  PostgreSQL 16 + PostGIS │ Redis 7 (cache/pubsub) │ S3 = MinIO (файлы)
  Message Broker: RabbitMQ (exchange `cleaning-ops.events`)
```

Полная ASCII-схема — в УСТАВ.md → README → «Архитектура».

## 3. Паттерны

| Паттерн | Применение |
|---------|------------|
| Microservices | Разделение бизнес-логики на 9 сервисов |
| Event-Driven | События между сервисами (RabbitMQ) |
| CQRS | Read-модели для отчётов (М7) |
| Repository | Абстракция над БД (Prisma) |
| Dependency Injection | IoC NestJS |
| Observer | Уведомления, WebSocket (chat) |
| State Machine | Статусы заявок (ticket-service) |
| Strategy / Factory | Типы уборки, заявок |

## 4. Контракт событий (RabbitMQ)

Фиксируется в М0.7 (`shared/constants/events.ts`), изменения — только с review архитектора (правило shared/).

- Exchange: `cleaning-ops.events` (topic); DLQ: `cleaning-ops.events.dlq`.

| Routing key | Продюсер | Потребитель |
|---|---|---|
| `ticket.created` | ticket-service | notification-service |
| `ticket.assigned` | ticket-service | notification-service |
| `ticket.emergency` | ticket-service | notification-service |
| `ticket.overdue` | ticket-service | notification-service |
| `ticket.operation.completed` | ticket-service | material-service |
| `geofence.exit` | gps-service | notification-service |
| `material.low` | material-service | notification-service |
| `schedule.missed_checkin` | schedule-service | notification-service |

Поля событий — в `shared/types/events.ts` (М0.7).

## 5. Граф зависимостей сервисов

```
auth ─► (пользователи/роли — всем)
files ─► MinIO (планы→core, фото→tickets/mobile, аватары→auth, вложения→chat)
core ─► files, auth
gps ─► core (объекты→геозоны), auth
tickets ─► core, auth, gps (ближние 500 м), notification
schedule ─► core, auth, gps (геозона), tickets (автозаявки), notification
materials ─► core (техкарты), tickets (operation.completed), notification
chat ─► auth, files, notification
notification ─► RabbitMQ, Firebase(мок), auth
```

## 6. Технологический стек (верхние версии — целевые, G9)

**Backend:** Node.js 20 LTS, NestJS 10, TypeScript 5.4, PostgreSQL 16, PostGIS 3.4, Redis 7.2, RabbitMQ 3.13, Prisma 5, Socket.io 4, Firebase Admin 12, MinIO, Jest 29.

**Web:** React 18, TypeScript 5.4, Vite 5, React Router 6, Zustand 4, TanStack Query 5, Tailwind CSS 3, Mapbox GL 3, Recharts 2, Storybook 8.

**Mobile:** Flutter 3.19, Dart 3.3, Riverpod 2.5, go_router 14, dio 5, drift 2, flutter_map 7, geolocator 11, camera 0.10, local_auth 2.

**Инфра/QA:** Docker ≥24, Kubernetes, Terraform, GitHub Actions, Prometheus/Grafana/Alertmanager, Jest, Playwright, k6.

## 7. Роли и доступ (RBAC)

`OPERATOR` (уборщик, мобильный), `SUPERVISOR` (бригадир), `ADMIN` (админ-панель), `CLIENT` (портал заказчика, только свой объект).

## 8. Известные расхождения устава (трекинг)

1. `design/` в корне — решение №1. Обновить раздел «Структура репозитория» при первой правке устава.
2. Страница «Сообщения» в админке — решение №2.
3. Версии в таблице стека vs «Предварительные требования» (Flutter 3.19 vs ≥3.16 и т.п.) — целевые = верхние (G9).
4. Firebase/Mapbox требуют внешних ключей — dev-моки/fallback (решение №3; Mapbox-fallback: фото-план/OSM).
