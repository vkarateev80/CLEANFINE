# 🗄 Схема БД Cleaning Ops (реестр)

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

## 6. material-service (М4)

- `Material`, `MaterialStock` (@@unique materialId+objectId), `MaterialMovement` (IN/OUT/TRANSFER/WRITE_OFF).
- Источник: УСТАВ.md → Агент Backend Materials, Prisma-схема.

## 7. schedule-service (М4)

- `Schedule` (objectId, routeId, recurrence, assignees), события/смены (check-in/check-out с координатами и геозоной), привязка к автосозданным заявкам.

## 8. chat-service (М5)

- `Chat` (type: OBJECT/TICKET/DIRECT/SYSTEM, участники), `Message` (автор, вложение, прочитано/кем/когда).

## 9. notification-service (М3) — реализовано (БД `cleaning_ops_notifications`, миграция `init_notifications`)

- `devices`: userId, token UNIQUE, platform, isActive, lastSeenAt (индексы userId, (userId,isActive));
  невалидный токен FCM → `isActive=false`.
- `notifications`: userId, type (NEW_TICKET/EMERGENCY/TICKET_OVERDUE/GEOFENCE_EXIT/MATERIAL_LOW),
  title, body, payload JSONB, readAt, createdAt (индексы userId, (userId,readAt)).
- `notification_preferences`: userId UNIQUE, disabledTypes TEXT[] — отключённые типы уведомлений.

## 10. Ограничения целостности (общие)

- UUID идентификаторы по умолчанию.
- Геоданные — PostGIS (SRID 4326).
- Кросс-сервисные ссылки — по UUID; FK только внутри сервиса (границы микросервисов).
