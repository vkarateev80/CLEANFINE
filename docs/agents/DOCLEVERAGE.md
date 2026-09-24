# DOCLEVERAGE.md — Архитектурный обзор CLEANFINE

> Обзор всех архитектурных спецификаций проекта CLEANFINE.
> Файлы спецификаций по сервисам находятся в `docs/agents/`.

## Backend-сервисы

| Сервис | Файл спецификации | Описание |
|--------|-------------------|----------|
| auth-service | `docs/agents/backend-auth.md` | Аутентификация: JWT, PIN, биометрия, RBAC |
| core-service | `docs/agents/backend-core.md` | Ядро: объекты, этажи, помещения, маршруты, техкарты |
| file-service | `docs/agents/backend-files.md` | Файлы: MinIO, водяные знаки, миниатюры |
| gps-service | `docs/agents/backend-gps.md` | GPS-треки, PostGIS, геозоны, geofence |
| ticket-service | `docs/agents/backend-ticket.md` | Заявки: state machine, эскалация, SOS |
| notification-service | `docs/agents/backend-notification.md` | Уведомления: push/FCM, in-app, очереди |
| material-service | `docs/agents/backend-materials.md` | Материалы: справочник, склады, движения |
| schedule-service | `docs/agents/backend-schedule.md` | Графики: расписания, смены, генерация |
| chat-service | `docs/agents/backend-chat.md` | Чат: REST + WebSocket /chat, история, поиск |

## Frontend-приложения

| Приложение | Файл спецификации | Описание |
|-----------|-------------------|----------|
| web-admin | `docs/agents/frontend-web-admin.md` | Админ-панель React (вход, ядро, заявки, карта, сообщения, материалы, графики) |
| web-client | `docs/agents/frontend-web-client.md` | Портал заказчика React (вход CLIENT, объект, заявки, отчёт, чат) |
| mobile-app | `docs/agents/frontend-mobile.md` | Flutter-приложение (каркас, навигация, таб-бар) |

## DevOps

| Компонент | Файл спецификации | Описание |
|-----------|-------------------|----------|
| CI/CD | `docs/agents/devops.md` | GitHub Actions (quality + e2e), docker-compose, deploy-kit |
| VPS-стенд | `docs/agents/devops.md` | prj-cleanfine@100.109.185.14, 15 контейнеров, nginx |
| QA | `docs/agents/qa.md` | Приёмочные тесты, e2e, QA-процесс |

## Ссылки

- [УСТАВ.md](../../УСТАВ.md) — проектный устав, фазы М0–М7
- [ПЛАН.md](../../ПЛАН.md) — план разработки
- [КОНТЕКСТ.md](../../КОНТЕКСТ.md) — контекст проекта
- [КАРТА_ПРОЕКТА_CLEANFINE.md](../../КАРТА_ПРОЕКТА_CLEANFINE.md) — отчёт-карта проекта
- [RELEASE_NOTES_v1.0.0.md](../../RELEASE_NOTES_v1.0.0.md) — релизные заметки v1.0.0
