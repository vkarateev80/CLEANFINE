# chat-service

Сервис чатов реального времени CLEANFINE (УСТАВ.md → «Агент Backend Chat», ПЛАН М5.1–М5.2).
NestJS 10 + Prisma 5 + PostgreSQL 16 + Socket.io 4. Порт — `CHAT_SERVICE_PORT` (3009).

## Назначение

- чаты четырёх типов (`object`, `ticket`, `direct`, `system` — `shared/types/chat.ts`);
- история сообщений с пагинацией и поиск по тексту (ILIKE);
- вложения сообщения (id из file-service, bucket `documents`);
- статус прочтения (`lastReadAt` участника) и онлайн/оффлайн;
- доставка в реальном времени через WebSocket (`namespace /chat`) и REST-фолбэк;
- push оффлайн-получателям через notification-service.

## Запуск и проверки

```bash
# из backend/chat-service
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --no-package-lock --no-audit --no-fund
# Prisma CLI читает .env только из каталога сервиса и каталога schema,
# корневой ../../.env он не видит — переменную нужно передать в процессе:
$env:CHAT_DATABASE_URL="postgresql://admin:<пароль>@localhost:5432/cleaning_ops_chat?schema=public"
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate
node node_modules/@nestjs/cli/bin/nest.js build
node dist/main.js                                          # http://localhost:3009/api
```

> Nest приложение само читает корневой `../../.env` (`ConfigModule`), поэтому
> запуск `node dist/main.js` без переменных окружения работает; явная передача
> `CHAT_DATABASE_URL` нужна только CLI Prisma.

- Swagger: `http://localhost:3009/api/docs` (скрыт при `NODE_ENV=production`).
- Health: `GET /api/chat/health` — публичный, без JWT.
- Миграция: `prisma/migrations/<ts>_init_chat`.

## Модель доступа

| Тип чата | Кто создаёт | Кто видит |
| --- | --- | --- |
| `direct` | любой авторизованный (себя добавляет сам + ровно один второй участник) | только двое участников |
| `ticket` | `ADMIN`, `SUPERVISOR` (обязателен `ticketId`) | участники чата, участники заявки (исполнитель/автор — проверка через ticket-service), а также `ADMIN`/`SUPERVISOR` |
| `object` | `ADMIN`, `SUPERVISOR` (обязателен `objectId`) | участники чата (сотрудники объекта добавляются явно), а также `ADMIN`/`SUPERVISOR` |
| `system` | только `ADMIN` | участники чата, а также `ADMIN`/`SUPERVISOR` |

Правила и обоснования:

1. Базовое правило — участие в `ChatMember`. Не участник получает **403 «Вы не участник этого чата»** (текст зафиксирован контрактом М5.1), отсутствующий чат — **404**.
2. `ADMIN`/`SUPERVISOR` видят `object`/`ticket`-чаты и при первом обращении закрепляются участником (`role='staff'`), чтобы `unreadCount` и история считались как у обычного участника.
3. Для `ticket`-чата доступ дополнительно получают участники заявки: `assigneeId`, все `assigneeId` из истории назначений и `createdBy`. Источник — `GET /api/tickets/:id` (сервисный токен), ответ кэшируется на 5 секунд: в одном HTTP-запросе заявка запрашивается один раз, а не на каждое сообщение.
4. Для `object`-чата в core-service **нет** справочника «сотрудники объекта» (проверены `objects`, `floors`, `rooms`, `routes`, `tech-cards`), поэтому принадлежность оператора объекту не выводится REST-вызовом: состав чата задаётся явно. Если такой справочник появится, проверку нужно добавить в `ChatsService.assertCanView` (описано в отчёте).
5. Недоступность core-service при создании `object`-чата не блокирует создание (объект проверяется только на явное «не найдено»); недоступность ticket-service не блокирует `ticket`-чат — участники досинхронизируются при следующем создании/обращении.

## REST-контракт (`/api/chat`, все эндпоинты под JWT, кроме health)

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/chat/chats` | чаты пользователя: `id, type, title, objectId, ticketId, createdAt, lastMessage, unreadCount`, сортировка по последнему сообщению |
| `POST` | `/api/chat/chats` | создать чат `{ type, participantIds?, objectId?, ticketId?, title? }`; повтор для `ticket`/`object` возвращает существующий (идемпотентность) |
| `GET` | `/api/chat/chats/:id` | деталь чата с участниками (`members[]`) |
| `GET` | `/api/chat/chats/:id/messages` | история: `?before=<ISO>&limit=` |
| `POST` | `/api/chat/chats/:id/messages` | отправка `{ text, attachmentIds? }` (REST-фолбэк) |
| `POST` | `/api/chat/chats/:id/read` | `{ lastMessageId }` — отметка прочтения |
| `GET` | `/api/chat/messages/search` | `?q=&chatId=&limit=` — поиск только по своим чатам |
| `GET` | `/api/chat/health` | живость сервиса (публичный) |

**Формат истории.** `limit ≤ 100`, по умолчанию 50. Отбор идёт по `createdAt DESC` (взять `limit + 1`, чтобы понять, есть ли ещё страница), а клиенту `items` отдаются **от старых к новым** — так страница рисуется без переворота массива. Ответ:

```json
{
  "items": [ { "id": "...", "chatId": "...", "authorId": "...", "text": "...", "attachmentIds": [], "createdAt": "..." } ],
  "limit": 50,
  "hasMore": true,
  "nextBefore": "2026-01-01T10:00:00.000Z"
}
```

`nextBefore` — `createdAt` самого старого сообщения страницы; его передают в следующий запрос как `before`, чтобы подгрузить ещё выше по истории.

**Прочтение.** `lastReadAt` участника = `createdAt` указанного сообщения (а не `now`): повторное чтение старого сообщения не скрывает новые. Отметка идемпотентна (назад не откатывается).

**Поиск.** `mode: insensitive` → SQL `ILIKE`; область — только чаты, где пользователь участник. Указан чужой `chatId` → 403 (а не пустой результат). В БД включён `pg_trgm`, но индекс на выражение не добавлялся: сначала нужен замер на реальном объёме.

**Push оффлайн-получателям.** Routing key для сообщений чата в `shared/constants/events.ts` отсутствует, а контракт событий меняется только через review архитектора, поэтому использован REST-вызов: `POST {NOTIFICATION_SERVICE_URL}/api/notifications/internal/chat-message` (сервисный JWT, тип `CHAT_MESSAGE`) только для участников без активного WebSocket-соединения. В notification-service такого эндпоинта (и типа `CHAT_MESSAGE`) пока нет — клиент получает 404, пишет один warning и продолжает; доставка сообщения в чат от этого не страдает. Чтобы включить push, достаточно добавить эндпоинт в notification-service — правок в chat-service не требуется. Выключатель на время отладки: `CHAT_PUSH_ENABLED=false`.

## WebSocket-контракт

Namespace: **`/chat`** (`ws://localhost:3009/chat`).

**Аутентификация handshake.** Основной путь — `auth.token` (`io(url, { auth: { token } })`), поскольку query-строка попадает в логи прокси и сервера, а access-токен — полноценный доступ к API. Как запасной путь поддержан `?token=` в query (мобильный WebView умеет не передавать auth-объект). Невалидное/истёкшее соединение получает `error` и `disconnect`.

Секрет подписи берётся из общего `JWT_ACCESS_SECRET`: `JwtModule` в `ChatsModule` регистрируется через `registerAsync` с `ConfigService`. Это принципиально — глобальный `JwtAuthGuard` работает только в HTTP-конвейере, а handshake сокета проверяется в `ChatGateway`, поэтому модуль обязан сам знать секрет (иначе `verifyAsync` не может проверить токен и отклоняет любое соединение).

**Онлайн-карта.** `Map<userId, Set<socketId>>`: у одного человека может быть несколько вкладок/устройств, при одном socketId закрытие второй вкладки ошибочно «выкидывало» бы пользователя из онлайна. При подключении сокет входит в комнату `user:<userId>` — адресная доставка без перебора сокетов. При отключении сокет убирается из карты; когда сокетов не осталось, транслируется оффлайн.

**Клиент → сервер**

| Событие | Payload | Ack |
| --- | --- | --- |
| `message:send` | `{ chatId, text, attachmentIds? }` | `{ ok: true, message }` или `{ ok: false, error, status? }` |
| `message:read` | `{ chatId, lastMessageId }` | `{ ok: true, readAt }` или `{ ok: false, error, status? }` |

**Сервер → клиент**

| Событие | Payload |
| --- | --- |
| `message:new` | `{ id, chatId, authorId, text, attachmentIds, createdAt }` — всем онлайн-участникам, **кроме отправителя** (отправитель получает ack) |
| `message:read` | `{ chatId, messageId, readBy, readAt }` — автору прочитанного сообщения |
| `user:status` | `{ userId, online }` — broadcast при подключении/отключении |

Payload сокета валидируется вручную (`src/chats/ws-auth.ts`): Nest `ValidationPipe` работает только в HTTP-конвейере, поэтому через сокет нельзя обойти ограничения REST (пустой текст, длина > 4000, > 20 вложений).

## Структура

```
src/
  auth/                 JWT-стратегия, guard-ы, декораторы (копия приёмов material-service)
  chats/                домен: сервис, REST-контроллер, WS-шлюз, DTO, ws-auth
  config/               configuration.ts (порт, секрет, адреса сервисов)
  health/               публичный health-чек
  integration/          сервисный токен + клиенты ticket/core/notification
  prisma/               PrismaService/PrismaModule
prisma/schema.prisma    Chat, ChatMember, Message, enum ChatType
tools/                  скрипты живой проверки (REST + WebSocket)
```

## Проверки

```bash
node node_modules/jest/bin/jest.js --runInBand --coverage   # порог покрытия 80 %
node node_modules/typescript/bin/tsc --noEmit
node node_modules/@nestjs/cli/bin/nest.js build
node tools/verify-live.js        # REST-сценарий на запущенном сервисе
node tools/verify-ws.js          # два WS-клиента: message:new и message:read
```

Юнит-тесты проверяют: 403 на чужой чат, идемпотентность `ticket`/`direct`-чатов, пагинацию истории, отметку прочтения, обработку `message:send` (сохранение + рассылка), отсутствие дублей при повторной доставке (P2002 и «назад» по `lastReadAt`), поиск только по своим чатам. Prisma и внешние сервисы мокаются.
