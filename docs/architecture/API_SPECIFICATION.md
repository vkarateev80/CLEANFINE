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

## 4. gps-service `/api/gps` (М3) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| POST `/api/gps/track` | batch до 1000 точек; проверка геозон, эмиссия `geofence.exit` | auth (userId из токена; подмена — ADMIN/SUPERVISOR) |
| GET `/api/gps/geofences` | список геозон (GeoJSON), фильтр `?objectId=` | auth |
| POST `/api/gps/geofences` | создание геозоны объекта | ADMIN, SUPERVISOR |
| GET `/api/gps/geofences/:userId/check?lat&lng` | вхождение в геозону (ST_Distance/ST_Contains) | auth |
| GET `/api/gps/employees/nearby?lat&lng&radius` | ближние сотрудники (последняя точка ≤5 мин) | auth |
| GET `/api/gps/tracks?userId&from&to&limit` | история перемещений | auth |

## 5. ticket-service `/api/tickets` (М3) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| POST `/api/tickets` | плановая/внеплановая заявка | ADMIN, SUPERVISOR, CLIENT |
| POST `/api/tickets/emergency` | аварийная (SOS): CRITICAL, ближние операторы, `ticket.emergency` | ADMIN, SUPERVISOR, CLIENT |
| GET `/api/tickets` | список с фильтрами (status/type/priority/objectId/assigneeId) и пагинацией | auth |
| GET `/api/tickets/:id` | деталь: назначения, комментарии, операции | auth |
| PATCH `/api/tickets/:id/status` | смена статуса; невалидный переход → 400 `Invalid status transition` | auth (по правилам контроллера) |
| POST `/api/tickets/:id/assign` | назначение исполнителя → `ticket.assigned` | ADMIN, SUPERVISOR |
| POST `/api/tickets/:id/comments` | комментарий | auth |
| POST `/api/tickets/:id/operations/:operationId/complete` | выполнение операции; идемпотентно (`alreadyCompleted`), эмиссия `ticket.operation.completed` | auth |

## 6. material-service `/api/materials` (М4) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| CRUD `/api/materials` | справочник материалов | запись — ADMIN/SUPERVISOR, чтение — auth |
| GET `/api/materials/stocks?objectId&onlyLow` | остатки по объектам с признаком «ниже порога» | auth |
| POST `/api/materials/movements` | приход/расход/перемещение/списание; транзакционный пересчёт, минус → 400; TRANSFER требует `targetObjectId` | ADMIN, SUPERVISOR, OPERATOR |
| GET `/api/materials/:id/movements?objectId&from&to&limit` | история движений | auth |
| GET `/api/materials/report?objectId&from&to` | отчёт по расходу (агрегаты + стоимость) | auth |

- Консьюмер `ticket.operation.completed` (очередь `material.ticket.operation.completed`):
  материалы операции через core API → автосписание `OUT` по объекту заявки → при остатке
  ниже порога эмиссия `material.low`.

## 7. schedule-service `/api/schedule` (М4) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| CRUD `/api/schedule` | графики с recurrence (daily/weekly/monthly) | запись — ADMIN/SUPERVISOR |
| GET `/api/schedule/events?date&objectId&userId` | смены на дату | auth |
| GET `/api/schedule/events/:id` | смена по id | auth |
| GET `/api/schedule/my` | смены текущего пользователя | auth |
| POST `/api/schedule/check-in` | check-in с проверкой геозоны (gps-service); вне зоны → 403; идемпотентно | OPERATOR, SUPERVISOR, ADMIN |
| POST `/api/schedule/check-out` | закрытие смены; без check-in → 400 | OPERATOR, SUPERVISOR, ADMIN |
| POST `/api/schedule/generate?date=` | детерминированная генерация смен и плановых заявок (для e2e/cron) | ADMIN |
| POST `/api/schedule/check-missed?date=` | прогон неявок и авто check-out вне cron | ADMIN |
| GET `/api/schedule/scheduler/state` | состояние планировщика | ADMIN |

- Неявка → статус `MISSED` + событие `schedule.missed_checkin`; авто check-out после
  `SCHEDULE_AUTO_CHECKOUT_MINUTES` от `plannedStart`.

## 8. chat-service (WebSocket `/chat`, М5)

- События: `message:send`, `message:new`, `message:read`; чаты OBJECT/TICKET/DIRECT/SYSTEM; история с пагинацией; файлы.

## 9. notification-service `/api/notifications` (М3) — реализовано

| Метод/путь | Назначение | Доступ |
|---|---|---|
| POST `/api/notifications/device` | регистрация/обновление FCM-токена устройства (upsert) | auth |
| GET `/api/notifications?page&limit&unreadOnly` | in-app список: `{items,total,page,limit,unreadCount}` | auth |
| PATCH `/api/notifications/:id/read` | отметка прочитанного (идемпотентно, 404 на чужое) | auth |
| GET `/api/notifications/settings` | настройки подписок: `{disabledTypes, availableTypes}` | auth |
| PATCH `/api/notifications/settings` | изменить подписки (недопустимый тип → 400) | auth |

- RabbitMQ-консьюмер слушает 6 очередей `notification.*` (`shared/constants/events.ts`):
  `ticket.created`, `ticket.assigned`, `ticket.emergency`, `ticket.overdue`, `geofence.exit`,
  `material.low`. Получатели — из payload (`assigneeId`/`userIds`), иначе broadcast по активным
  устройствам. Push в dev — MockPushSender (FCM включается при заполненных `FIREBASE_*`).
