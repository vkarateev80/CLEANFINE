# 🗄 Схема БД CLEANFINE (реестр)

> Каркас создан в М0.3. Наполняется по мере миграций (М1–М6): после каждой миграции владелец сервиса обновляет соответствующий раздел. Канонические схемы Prisma/SQL — в УСТАВ.md (разделы агентов) и в `prisma/schema.prisma` каждого сервиса.

## 1. auth-service (М1) — реализовано (БД `cleaning_ops`, миграция `init_auth`)

- `User` — id, email (unique), phone (unique), passwordHash, fullName, role (OPERATOR/SUPERVISOR/ADMIN/CLIENT), pinCode, biometricKey, avatarUrl, isActive, timestamps.
- `RefreshToken` — token (unique), userId, expiresAt, revokedAt.
- Источник: УСТАВ.md → Агент Backend Auth, Prisma-схема.

## 2. file-service (М2) — реализовано (БД `cleaning_ops_files`, миграция `init_files`)

- `StoredFile` → таблица `stored_files`: id, bucket (PHOTOS/PLANS/AVATARS/DOCUMENTS), objectKey,
  url, thumbnailUrl, thumbnailKey, originalName, mimeType, sizeBytes, **width/height**, watermarked,
  uploadedById/uploadedByName, takenAt, lat/lng, createdAt.
- `FileAttachment` → таблица `file_attachments`: fileId, entityType (FLOOR_PLAN/TICKET/CHAT_MESSAGE/
  AVATAR/DOCUMENT), entityId, createdAt; @@unique(fileId, entityType, entityId).
- Файлы — в MinIO (buckets: photos, plans, avatars, documents).

## 3. core-service (М2) — реализовано (БД `cleaning_ops_core`, миграции `init_core`, `add_plan_dimensions`)

- `Object` → `objects`; `Floor` → `floors` (planImageUrl, planScale, **planWidth/planHeight** —
  реальные размеры плана для валидации координат); `Room` → `rooms` (coordsX/Y/Width/Height, zone,
  techCardId).
- `Route` → `routes` (status DRAFT/ACTIVE/ARCHIVED); `RoutePoint` → `route_points`
  (@@unique(routeId, orderIndex)).
- `TechCard` → `tech_cards`; `TechOperation` → `tech_operations` (equipment Json?,
  @@unique(techCardId, orderIndex)); `TechOperationMaterial` → `tech_operation_materials`
  (materialId — без FK: справочник появится в material-service, М4).
- Источник: УСТАВ.md → Агент Backend Core; `prisma/schema.prisma` сервиса.

## 4. gps-service (М3) — реализовано (БД `cleaning_ops_gps`, миграция `init_gps`)

- `gps_tracks` → `gps_tracks`: user_id, location GEOMETRY(Point,4326), accuracy, speed,
  battery_level, timestamp; GIST-индекс по location + (user_id, timestamp DESC).
- `geofences` → `geofences`: object_id (без FK — другая БД), name, boundary GEOMETRY(Polygon,4326),
  radius_meters; GIST-индекс по boundary.
- Геометрия объявлена в Prisma как `Unsupported(...)`, запросы — через `$queryRaw` (ST_Contains,
  ST_DWithin, ST_Distance, ST_AsGeoJSON).

## 5. ticket-service (М3) — реализовано (БД `cleaning_ops_tickets`, миграция `init_tickets`)

- `tickets`: type (planned/unscheduled/emergency), priority, status (state machine из
  `shared/types/tickets.ts`), objectId, roomId?, assigneeId?, createdBy, lat/lng?, тайминги и
  дедлайны (reaction/arrival/completion).
- `ticket_assignments`: история назначений (ticketId, assigneeId, assignedBy, assignedAt).
- `ticket_comments`: комментарии (ticketId, authorId, text).
- `ticket_operation_completions`: отметки выполнения операций — идемпотентность по
  (ticketId, operationId).

## 6. material-service (М4) — реализовано (БД `cleaning_ops_materials`, миграция `init_materials`)

Таблицы названы по моделям Prisma (PascalCase, без `@@map`), колонки — camelCase.

- `Material`: name, unit, defaultConsumption, minStockThreshold, costPerUnit, supplier?.
- `MaterialStock`: materialId, objectId, quantity, `@@unique([materialId, objectId])`.
- `MaterialMovement`: materialId, objectId, type (IN/OUT/TRANSFER/WRITE_OFF), quantity,
  ticketId?, userId, targetObjectId? (аддитивно — приход при TRANSFER), createdAt.
- `ConsumedOperation`: operationId, materialId, ticketId, objectId, quantity, movementId? —
  `@@unique([operationId, materialId])` для идемпотентности автосписания.

## 7. schedule-service (М4) — реализовано (БД `cleaning_ops_schedule`, миграция `init_schedule`)

- `Schedule`: objectId?, routeId?, name, recurrence JSON (frequency daily/weekly/monthly + days/dayOfMonth
  + time), assignees String[], isActive.
- `ScheduleEvent` (смена): scheduleId, objectId, date, plannedStart,
  status (PLANNED/CHECKED_IN/CHECKED_OUT/MISSED), userId?, checkIn/checkOutAt + координаты,
  ticketId? (автосозданная плановая заявка), checkOutReason?, `@@unique([scheduleId, date, userId])`.
- Время трактуется в UTC (таймзона объекта/графика не хранится — дефер).

## 8. chat-service (М5)

- `Chat` (type: OBJECT/TICKET/DIRECT/SYSTEM, участники), `Message` (автор, вложение, прочитано/кем/когда).
- Идемпотентность создания: `@@unique([objectId])` — один чат на объект, `@@unique([ticketId])` —
  один чат на заявку. **Инвариант (М7.3):** `objectId` заполнен ТОЛЬКО у `type=object`; `ticket`-чат
  ссылается на заявку через `ticketId` (объект заявки доступен через ticket-service) и `objectId`
  не пишет. Раньше ticket-чат писал туда объект заявки — вторая заявка того же объекта получала
  `P2002` на `Chat_objectId_key`, ветка обработки гонки искала чат по `ticketId`, не находила и
  отдавала 500 «No Chat found» (публичный `POST /api/chat/chats`, им пользуется и мобильное
  приложение). Инвариант закреплён CHECK-ограничением `Chat_objectId_only_object_check`; миграция
  `20261002090000_m73_chat_objectid_only_object` чистит и legacy-строки (`objectId=NULL` у не-object чатов).

## 9. notification-service (М3) — реализовано (БД `cleaning_ops_notifications`, миграция `init_notifications`)

- `devices`: userId, token UNIQUE, platform, isActive, lastSeenAt (индексы userId, (userId,isActive));
  невалидный токен FCM → `isActive=false`.
- `notifications`: userId, type (NEW_TICKET/EMERGENCY/TICKET_OVERDUE/GEOFENCE_EXIT/MATERIAL_LOW),
  title, body, payload JSONB, readAt, createdAt (индексы userId, (userId,readAt)).
- `notification_preferences`: userId UNIQUE, disabledTypes TEXT[] — отключённые типы уведомлений.

## 10. Read-модели отчётов М7.1 (SQL views)

Паттерн CQRS в «облегчённой» форме (решение архитектора №4): отчёты читают не таблицы, а
SQL-представления, созданные миграцией в БД сервиса-владельца данных. Единого view сквозь
сервисы нет — у каждого сервиса своя БД, поэтому сводная доска действий админки складывает ответы
read-эндпоинтов.

| БД | Миграция | View |
|---|---|---|
| `cleaning_ops_materials` | `20261001120000_m71_material_report_views`, `20261001120500_m71_report_views_int_counts` | `report_material_consumption`, `report_material_consumption_daily`, `report_material_consumption_totals` |
| `cleaning_ops_tickets` | `20261001130000_m71_ticket_report_views` | `ticket_execution`, `ticket_execution_daily`, `ticket_execution_totals` |
| `cleaning_ops_schedule` | `20261001140000_m71_staff_control_views` | `staff_shift_fact`, `staff_control`, `staff_control_totals` |
| `cleaning_ops_gps` | `20261001150000_m71_staff_geofence_views` | `staff_geofence_sessions`, `staff_geofence_control`, `staff_route_activity`, `staff_geofence_totals` |

Правила read-моделей:

- счётчики приводятся к `int` (`COUNT(*)::int`): `bigint` доходит до JS как `BigInt` и роняет
  `JSON.stringify` в ответе API;
- денежные величины в view не хранятся: `cost = quantity × costPerUnit` считает сервис по
  актуальной цене справочника (иначе правка цены задним числом меняла бы прошлые отчёты);
- период применим только к представлениям с дневной зернистостью; агрегаты «за всё время»
  период не принимают (см. комментарии в `reports.repository.ts` соответствующих сервисов);
- представления не входят в Prisma-схему (Prisma их не интроспектирует) — они созданы
  миграциями и читаются через `$queryRaw`.

## 11. Ограничения целостности (общие)

- UUID идентификаторы по умолчанию.
- Геоданные — PostGIS (SRID 4326).
- Кросс-сервисные ссылки — по UUID; FK только внутри сервиса (границы микросервисов).
