# 📚 API спецификация Cleaning Ops (реестр)

> Каркас создан в М0.3. Полные описания endpoint'ов появляются по фазам; у каждого сервиса включается Swagger (`/api/docs`), который и является актуальной спецификацией. Группы endpoint'ов ниже соответствуют уставу (разделы агентов).

## Соглашения

- Базовый префикс: `/api`. Авторизация: `Authorization: Bearer <accessToken>` (JWT), refresh — отдельный endpoint.
- Ошибки: 400 (валидация), 401, 403 (RBAC), 404, 409, 413 (файлы), 429 (rate limit).
- Rate limiting: login — 5 попыток/мин (auth-service).
- Время: ISO 8601 / unix; координаты: WGS-84.

## 1. auth-service `/api/auth` (М1)

| Метод/путь | Назначение | Доступ |
|---|---|---|
| POST `/api/auth/login` | email+пароль → access+refresh | public |
| POST `/api/auth/pin` | PIN → токены | public |
| POST `/api/auth/biometric` | биометрический ключ → токены | public |
| POST `/api/auth/refresh` | refresh → новый access | public |
| POST `/api/auth/logout` | отзыв refresh | auth |
| GET `/api/auth/me` | текущий пользователь | auth |
| POST `/api/auth/change-password` | смена пароля | auth |
| POST `/api/auth/change-pin` | смена PIN | auth |
| CRUD `/api/users` | управление сотрудниками | ADMIN |

## 2. file-service `/api/files` (М2) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| POST `/api/files/upload` | multipart `file` + `kind` (photo/plan/avatar/document); фото — водяной знак + миниатюра | auth |
| GET `/api/files` | список с фильтрами (bucket, entityType/entityId, uploadedById), пагинация | auth |
| GET `/api/files/:id` | метаданные (url, thumbnailUrl, width/height, size) | auth |
| POST `/api/files/:id/attach` | привязка к сущности (FLOOR_PLAN/TICKET/CHAT_MESSAGE/AVATAR/DOCUMENT) | auth |
| GET `/api/files/attachments/:entityType/:entityId` | вложения сущности | auth |
| DELETE `/api/files/:id` | удаление из MinIO и БД | ADMIN, SUPERVISOR |
| GET `/api/files/health/ping` | статус сервиса и MinIO | public |

- Buckets: photos/plans/avatars/documents; лимиты: JPEG/PNG/MP4, ≤10 МБ, фото ≥1280×720.

## 3. core-service `/api` (М2) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| CRUD `/api/objects` (+ `/:id/detail`, фильтры статус/тип/поиск) | объекты; удаление запрещено при активном маршруте | чтение — auth, запись — ADMIN/SUPERVISOR |
| CRUD `/api/objects/:objectId/floors`, `/api/floors/:id` | этажи; номер уникален в объекте (409) | запись — ADMIN/SUPERVISOR |
| POST `/api/floors/:id/plan` | multipart-план → file-service (проброс токена); сохраняет URL, масштаб, размеры | ADMIN, SUPERVISOR |
| POST `/api/floors/:id/plan-url` | привязка уже загруженного плана (URL + масштаб + размеры) | ADMIN, SUPERVISOR |
| CRUD `/api/floors/:floorId/rooms`, `/api/rooms/:id` | экспликация; координаты валидируются по реальному размеру плана | запись — ADMIN/SUPERVISOR |
| CRUD `/api/floors/:floorId/routes`, `/api/routes/:id` | маршруты, статусы DRAFT/ACTIVE/ARCHIVED | запись — ADMIN/SUPERVISOR |
| POST `/api/routes/:id/points`, PATCH/DELETE `/api/route-points/:id` | точки маршрута (порядок пересобирается плотно) | ADMIN, SUPERVISOR |
| PATCH `/api/routes/:id/reorder` | полный список `pointIds` в новом порядке | ADMIN, SUPERVISOR |
| CRUD `/api/tech-cards`, `/api/tech-operations` | техкарты, операции и материалы | запись — ADMIN/SUPERVISOR |
| PATCH `/api/tech-cards/:id/reorder` | полный список `operationIds` | ADMIN, SUPERVISOR |

- Архивный маршрут (`ARCHIVED`) неизменяем: мутации точек → 400.

## 4. gps-service `/api/gps` (М3)

- `POST /api/gps/track` — batch-координаты; проверка геозоны; поиск ближних сотрудников (`employees/nearby`); история перемещений.

## 5. ticket-service `/api/tickets` (М3)

- CRUD заявок (плановые/внеплановые/аварийные), смена статусов (state machine), назначение, комментарии, `POST /api/tickets/:id/operations/:operationId/complete` (эмиссия `ticket.operation.completed`), аварийные (SOS).

## 6. material-service `/api/materials` (М4)

- CRUD материалов, склады по объектам, движения (IN/OUT/TRANSFER/WRITE_OFF), отчёты по расходу.

## 7. schedule-service `/api/schedule` (М4)

- CRUD графиков (recurrence), события дня, `check-in` / `check-out` (геолокация), статусы неявок.

## 8. chat-service (WebSocket `/chat`, М5)

- События: `message:send`, `message:new`, `message:read`; чаты OBJECT/TICKET/DIRECT/SYSTEM; история с пагинацией; файлы.

## 9. notification-service `/api/notifications` (М3)

- Регистрация устройств, in-app список, настройки подписок.
