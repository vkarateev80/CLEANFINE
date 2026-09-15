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

## 4. gps-service (М3)

- `gps_tracks` (PostGIS: GEOMETRY(Point,4326), GIST-индексы), `geofences` (GEOMETRY(Polygon,4326), radius_meters, objectId).
- Источник: УСТАВ.md → Агент Backend GPS, SQL.

## 5. ticket-service (М3)

- `Ticket` (тип/приоритет/статус/объект/исполнитель/тайминги), `TicketAssignment`, `TicketComment`; статусы и переходы — State Machine из shared (УСТАВ.md → Агент Backend Tickets).

## 6. material-service (М4)

- `Material`, `MaterialStock` (@@unique materialId+objectId), `MaterialMovement` (IN/OUT/TRANSFER/WRITE_OFF).
- Источник: УСТАВ.md → Агент Backend Materials, Prisma-схема.

## 7. schedule-service (М4)

- `Schedule` (objectId, routeId, recurrence, assignees), события/смены (check-in/check-out с координатами и геозоной), привязка к автосозданным заявкам.

## 8. chat-service (М5)

- `Chat` (type: OBJECT/TICKET/DIRECT/SYSTEM, участники), `Message` (автор, вложение, прочитано/кем/когда).

## 9. notification-service (М3)

- Устройства/токены пользователей, in-app уведомления, настройки подписок пользователя.

## 10. Ограничения целостности (общие)

- UUID идентификаторы по умолчанию.
- Геоданные — PostGIS (SRID 4326).
- Кросс-сервисные ссылки — по UUID; FK только внутри сервиса (границы микросервисов).
