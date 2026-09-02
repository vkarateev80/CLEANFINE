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

## 2. file-service `/api/files` (М2)

- Загрузка/метаданные; buckets: photos/plans/avatars/documents; фото: водяной знак + миниатюра; лимиты: JPEG/PNG/MP4, ≤10 МБ, фото ≥1280×720.

## 3. core-service `/api` (М2)

- CRUD `objects`, `floors` (+ `POST /api/floors/:id/plan` — загрузка плана), `rooms` (экспликация), `routes` (+ `POST /api/routes/:id/reorder`), `route-points`, `tech-cards`, операции техкарт.

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
