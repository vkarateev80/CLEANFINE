import { expect, test, type APIRequestContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import {
  AUTH_URL,
  authHeader,
  bodyText,
  createObject,
  deleteObject,
  loginAs,
  runTag,
} from '../../helpers/core';
import {
  CHAT_URL,
  CHAT_WS_URL,
  chatHealth,
  chatTableTotals,
  chatTracker,
  countChatDependants,
  countChats,
  countMessages,
  createSystemChat,
  flushChatData,
  getChatOrFail,
  getChatRaw,
  listMessagesRaw,
  listMyChats,
  markRead,
  messagesPage,
  postChat,
  postMessage,
  searchMessages,
  searchMessagesRaw,
  sendMessage,
  trackDirectChat,
  trackObjectChat,
  trackSystemChat,
  trackTicketChat,
  unreadCountOf,
  type ChatMessage,
} from '../../helpers/chat';
import {
  NOTIFICATIONS_URL,
  errorMessage,
  expectStatus,
  flushOperationsData,
  loginIdAs,
  notificationsPage,
  operationsTracker,
  sqlAvailable,
  sweepOrphanNotifications,
  trackTicket,
} from '../../helpers/operations';

/**
 * М5.6 — e2e чата (chat-service :3009, REST /api/chat + WebSocket namespace /chat).
 *
 * Требует запущенного стенда: auth :3001 (access-токены), chat :3009,
 * tickets :3005 (нужен для TICKET-чата: chat-service берёт участников заявки через
 * ticket-service), notifications :3006 (проверка фактического контракта push),
 * PostgreSQL (`cleaning-ops-postgres`) — для точечной SQL-уборки.
 *
 * ЧТО ПРОВЕРЯЕТСЯ (не «ручка отвечает 200», а контракт М5.1–М5.2):
 *  1) изоляция участников: direct-чат видят ровно двое, третий получает 403 с текстом
 *     контракта «Вы не участник этого чата» и не находит чат в своём списке;
 *  2) TICKET-чат идемпотентен по ticketId, участник заявки (assignee) имеет доступ,
 *     посторонний (CLIENT) — нет;
 *  3) история: порядок от старых к новым и курсорная пагинация before/limit;
 *  4) отметка прочтения: unreadCount уменьшается и НЕ откатывается назад;
 *  5) поиск: подстрока находится только в своих чатах (чужой chatId → 403);
 *  6) права: 401 без токена, 403 на чужой чат, 404 на несуществующий;
 *  7) WebSocket: ack отправителю, message:new второму (и не отправителю), message:read
 *     автору, отказ соединению без токена и отправке в чужой чат;
 *  8) push оффлайн-получателю — ФАКТИЧЕСКИЙ контракт (см. ниже про дефект).
 *
 * ДЕФЕКТ, который фиксирует набор (не маскируется). Chat-service шлёт push оффлайн-получателям
 * REST-вызовом в notification-service (`POST /api/notifications/internal/chat-message`, тип
 * `CHAT_MESSAGE`), но такого эндпоинта и такого типа уведомления в notification-service нет:
 * вызов отвечает 404, chat-service пишет один warning и продолжает. Доставка сообщения в чат
 * от этого не страдает, но оффлайн-пользователь НЕ получает ни push, ни in-app записи.
 * Тест проверяет именно это (404 на внутреннем эндпоинте + отсутствие записи у получателя),
 * а не ожидаемое поведение «push работает».
 *
 * УБОРКА. У chat-service нет DELETE ни для чата, ни для сообщения, поэтому набор помнит
 * созданные чаты и сообщения и сносит ровно их через SQL (`docker exec ... psql -f`,
 * helpers/chat.ts). Заявки и свежие пользователи снимаются существующими хелперами
 * `helpers/operations.ts`. Засеянные роли и чаты других наборов не трогаются: чат удаляется
 * целиком только если создан этим прогоном, свои сообщения — по id.
 */

test.describe.configure({ timeout: 180_000 });

/** Нижняя граница для уборки и проверок: всё, что появилось после, — заслуга этого набора. */
const runStartedAt = new Date();

/**
 * Объекты core, созданные набором под OBJECT-чаты. У объектов нет трекера-уборщика
 * в `helpers/operations.ts` (там `object()` помечает лишь ОБЛАСТЬ уборки заявок),
 * поэтому снимаются явно — как в наборах М4.7 и портала.
 */
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  // Сокеты закрываем до уборки: иначе пользователь остался бы «онлайн» в карте шлюза.
  await closeAllSockets();

  // Копии уведомлений засеянным ролям (создание заявки эмитит NEW_TICKET) снимаются
  // «по области» (userId + время прогона) — так же, как в наборе планирования М4.7.
  for (const role of ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const) {
    operationsTracker.notificationSince(await loginIdAs(request, role), runStartedAt);
  }

  flushChatData();
  flushOperationsData();

  // Объекты — после чатов и заявок: чат по несуществующему объекту остался бы
  // висеть строкой в БД чатов (у неё нет FK на core), а заявка мешала бы DELETE.
  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdObjectIds.clear();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений (гонка с RabbitMQ) — один раз на процесс.
  sweepOrphanNotifications();
  // Числа для отчёта: сколько строк чата осталось на стенде после уборки набора.
  if (sqlAvailable()) {
    const totals = chatTableTotals();
    console.log(
      `[chat] итог уборки cleaning_ops_chat: Chat=${totals.chats}, ChatMember=${totals.members}, Message=${totals.messages}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Общие приёмы
// ---------------------------------------------------------------------------

/** Случайный UUID v4: на неизвестный id сервис обязан ответить 404, а не 400. */
function randomUuid(): string {
  const hex = runTag()
    .replace(/[^0-9a-f]/g, '')
    .slice(-12)
    .padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Свой объект core на тест object-чата: чат по `objectId` идемпотентен, поэтому на
 * засеянном (чужом) объекте повторный вызов вернул бы чат предыдущего прогона, и
 * проверки «наш чат» ничего не доказывали бы. Объект ставится на уборку трекером М3.
 */
async function trackOwnObject(request: APIRequestContext, name: string) {
  const object = await createObject(request, { name });
  createdObjectIds.add(object.id);
  operationsTracker.object(object.id);
  return object;
}

/**
 * Свежий OPERATOR через auth-service: нужен там, где получатель обязан быть
 * ГАРАНТИРОВАННО оффлайн (push-тест) — у нового пользователя нет ни одного сокета,
 * в отличие от засеянной роли, которую параллельно может держать другой набор.
 * Уборка (пользователь, его устройства и уведомления) — существующими хелперами.
 */
async function createFreshOperator(
  request: APIRequestContext,
): Promise<{ id: string; token: string; email: string }> {
  const admin = await loginAs(request, 'ADMIN');
  const email = `e2e-m56-${runTag()}@cleaning-ops.com`;
  const password = 'e2e-m56-pass';

  const created = await request.post(`${AUTH_URL}/api/users`, {
    headers: authHeader(admin),
    data: { email, password, fullName: `E2E М5.6 ${email}`, role: 'OPERATOR' },
  });
  expect(created.status(), `создание оператора М5.6: ${await bodyText(created)}`).toBe(201);
  const { id } = (await created.json()) as { id: string };
  operationsTracker.userRow(id);

  const login = await request.post(`${AUTH_URL}/api/auth/login`, { data: { email, password } });
  expect(login.status(), `логин оператора М5.6: ${await bodyText(login)}`).toBe(201);
  const { accessToken } = (await login.json()) as { accessToken: string };

  return { id, token: accessToken, email };
}

/** Общий список «наши сообщения в порядке отправки» — для сверки порядка истории. */
function textsOf(messages: ChatMessage[]): string[] {
  return messages.map((message) => message.text);
}

// ---------------------------------------------------------------------------
// WebSocket: подключение, ожидания и буферы событий
// ---------------------------------------------------------------------------

/**
 * Открытые сокеты процесса: закрываются в afterEach. Сокет, переживший тест,
 * оставил бы пользователя в онлайн-карте шлюза и испортил бы следующий тест.
 */
const openSockets: Socket[] = [];

async function closeAllSockets(): Promise<void> {
  const sockets = openSockets.splice(0, openSockets.length);
  for (const socket of sockets) {
    try {
      socket.removeAllListeners();
      socket.close();
    } catch {
      // сокет мог быть уже закрыт сервером — закрытие идемпотентно
    }
  }
  if (sockets.length > 0) {
    // Даём серверу обработать disconnect: иначе следующий тест увидит пользователя онлайн.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Создаёт сокет namespace /chat (без ожидания connect) и берёт его под уборку. */
function newSocket(token: string | null, timeoutMs = 8_000): Socket {
  const socket = io(CHAT_WS_URL, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    timeout: timeoutMs,
    forceNew: true,
  });
  openSockets.push(socket);
  return socket;
}

/** Универсальное ожидание условия с понятной ошибкой (без фиксированных sleep). */
async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message} (таймаут ${timeoutMs} мс)`);
}

/**
 * Соединение с валидным токеном: ждём не только `connect`, но и появления пользователя
 * в онлайн-карте шлюза (health). Это принципиально: неавторизованное соединение сервер
 * тоже сначала принимает, а затем рвёт в асинхронном handleConnection, поэтому одного
 * события `connect` для «соединение установлено» недостаточно.
 */
async function connectAuthorized(
  request: APIRequestContext,
  token: string,
  userId: string,
  label: string,
): Promise<Socket> {
  const before = (await chatHealth(request)).online[userId] ?? 0;
  const socket = newSocket(token);
  let connected = false;
  socket.once('connect', () => {
    connected = true;
  });
  await waitFor(
    async () => connected && ((await chatHealth(request)).online[userId] ?? 0) > before,
    8_000,
    `${label}: соединение не подтвердилось онлайн-картой шлюза`,
  );
  expect(socket.connected, `${label}: сокет разорван сразу после авторизации`).toBe(true);
  return socket;
}

/**
 * Соединение БЕЗ токена: сервер обязан прислать `error` и разорвать соединение.
 * Возвращает полученный payload ошибки, чтобы тест сверил текст контракта.
 */
async function connectUnauthorized(
  timeoutMs = 8_000,
): Promise<{ error?: unknown; connected: boolean }> {
  const socket = newSocket(null, timeoutMs);
  let errorPayload: unknown;
  let sawConnect = false;
  socket.on('error', (payload: unknown) => {
    errorPayload = payload;
  });
  socket.once('connect', () => {
    sawConnect = true;
  });
  await waitFor(
    () => sawConnect && !socket.connected,
    timeoutMs,
    'соединение без токена не было разорвано сервером',
  );
  return { error: errorPayload, connected: socket.connected };
}

/** Буфер message:new: события могли прийти до того, как тест начал их ждать. */
function messageInbox(socket: Socket): ChatMessage[] {
  const inbox: ChatMessage[] = [];
  socket.on('message:new', (message: ChatMessage) => inbox.push(message));
  return inbox;
}

/** Ждёт конкретное сообщение в буфере с пояснительной ошибкой. */
async function waitForMessage(
  inbox: ChatMessage[],
  messageId: string,
  description: string,
  timeoutMs = 8_000,
): Promise<ChatMessage> {
  let found: ChatMessage | undefined;
  await waitFor(
    () => {
      found = inbox.find((message) => message.id === messageId);
      return found !== undefined;
    },
    timeoutMs,
    `message:new (${description}) не пришёл`,
  );
  return found as ChatMessage;
}

interface WsReadEvent {
  chatId: string;
  messageId: string;
  readBy: string;
  readAt: string;
}

/** Буфер message:read (уведомление автора прочитанного сообщения). */
function readInbox(socket: Socket): WsReadEvent[] {
  const inbox: WsReadEvent[] = [];
  socket.on('message:read', (event: WsReadEvent) => inbox.push(event));
  return inbox;
}

async function waitForRead(
  inbox: WsReadEvent[],
  messageId: string,
  description: string,
  timeoutMs = 8_000,
): Promise<WsReadEvent> {
  let found: WsReadEvent | undefined;
  await waitFor(
    () => {
      found = inbox.find((event) => event.messageId === messageId);
      return found !== undefined;
    },
    timeoutMs,
    `message:read (${description}) не пришёл`,
  );
  return found as WsReadEvent;
}

/** Ack WS-события: контракт шлюза — `{ ok: true, ... }` либо `{ ok: false, error, status? }`. */
interface WsAck {
  ok: boolean;
  error?: string;
  status?: number;
  message?: ChatMessage;
  readAt?: string;
}

async function emitAck(
  socket: Socket,
  event: 'message:send' | 'message:read',
  payload: unknown,
  timeoutMs = 8_000,
): Promise<WsAck> {
  try {
    return (await socket.timeout(timeoutMs).emitWithAck(event, payload)) as WsAck;
  } catch (error) {
    throw new Error(
      `ack на ${event} не получен за ${timeoutMs} мс (сокет ${socket.connected ? 'жив' : 'закрыт'}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Изоляция участников
// ---------------------------------------------------------------------------

test.describe('Чаты: изоляция участников', () => {
  test('direct-чат видят только двое: третий получает 403 и не находит чат в списке', async ({
    request,
  }) => {
    const adminId = await loginIdAs(request, 'ADMIN');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const chat = await trackDirectChat(request, operatorId);

    expect(chat.type).toBe('direct');
    expect(
      chat.members.map((member) => member.userId).sort(),
      'в direct-чате ровно создатель и второй участник',
    ).toEqual([adminId, operatorId].sort());

    // Участник видит чат и его деталь.
    const operatorChats = await listMyChats(request, { role: 'OPERATOR' });
    expect(
      operatorChats.map((item) => item.id),
      'чат есть в списке участника',
    ).toContain(chat.id);
    const detail = await getChatOrFail(request, chat.id, { role: 'OPERATOR' });
    expect(detail.members.map((member) => member.userId).sort()).toEqual(
      [adminId, operatorId].sort(),
    );

    // ADMIN (создатель) тоже видит чат.
    expect((await listMyChats(request, { role: 'ADMIN' })).map((item) => item.id)).toContain(
      chat.id,
    );

    // SUPERVISOR — посторонний для direct-чата: роли ADMIN/SUPERVISOR дают доступ только
    // к чатам object/ticket, поэтому здесь работает базовое правило «участие в ChatMember».
    const supervisorChats = await listMyChats(request, { role: 'SUPERVISOR' });
    expect(
      supervisorChats.map((item) => item.id),
      'чужой чат не появляется в списке',
    ).not.toContain(chat.id);

    const supervisorGet = await getChatRaw(request, chat.id, { role: 'SUPERVISOR' });
    await expectStatus(supervisorGet, 403, 'деталь чужого чата');
    expect(await errorMessage(supervisorGet), 'текст 403 зафиксирован контрактом М5.1').toContain(
      'Вы не участник этого чата',
    );

    // Чтение истории, отправка и отметка прочтения в чужом чате — тоже 403.
    await expectStatus(
      await listMessagesRaw(request, chat.id, {}, { role: 'SUPERVISOR' }),
      403,
      'история чужого чата',
    );
    await expectStatus(
      await postMessage(request, chat.id, { text: 'чужое сообщение' }, { role: 'SUPERVISOR' }),
      403,
      'отправка в чужой чат',
    );
    await expectStatus(
      await markRead(request, chat.id, randomUuid(), { role: 'SUPERVISOR' }),
      403,
      'отметка прочтения в чужом чате',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. TICKET-чат
// ---------------------------------------------------------------------------

test.describe('Чаты: TICKET', () => {
  test('чат по ticketId идемпотентен, assignee имеет доступ, посторонний — нет', async ({
    request,
  }) => {
    const adminId = await loginIdAs(request, 'ADMIN');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const ticket = await trackTicket(request, {
      assigneeId: operatorId,
      description: `E2E-M56 заявка для чата ${runTag()}`,
    });

    const first = await trackTicketChat(request, ticket.id, { title: 'Чат по заявке' });
    expect(first.type).toBe('ticket');
    expect(first.ticketId, 'чат связан с заявкой').toBe(ticket.id);

    // Идемпотентность: повторный POST по тому же ticketId возвращает ТОТ ЖЕ чат,
    // а не создаёт второй (в схеме ticketId уникален, гонка закрыта и на P2002).
    const second = await trackTicketChat(request, ticket.id);
    expect(second.id, 'повторное создание возвращает существующий чат').toBe(first.id);

    // Участник заявки (assignee) имеет доступ: chat-service берёт участников из
    // ticket-service, поэтому проверяется именно эта связка, а не только ChatMember.
    const assigneeView = await getChatOrFail(request, first.id, { role: 'OPERATOR' });
    expect(assigneeView.members.map((member) => member.userId)).toContain(operatorId);
    expect(assigneeView.members.map((member) => member.userId)).toContain(adminId);
    expect(
      (await listMyChats(request, { role: 'OPERATOR' })).map((item) => item.id),
      'чат заявки виден исполнителю',
    ).toContain(first.id);

    // Посторонний: CLIENT не участник чата и не участник заявки — 403 (staff-исключение
    // в assertCanView распространяется только на ADMIN/SUPERVISOR).
    const client = await getChatRaw(request, first.id, { role: 'CLIENT' });
    await expectStatus(client, 403, 'деталь ticket-чата посторонним');
    expect(await errorMessage(client)).toContain('Вы не участник этого чата');
    expect(
      (await listMyChats(request, { role: 'CLIENT' })).map((item) => item.id),
      'чужой ticket-чат не попадает в список',
    ).not.toContain(first.id);
    await expectStatus(
      await listMessagesRaw(request, first.id, {}, { role: 'CLIENT' }),
      403,
      'история ticket-чата посторонним',
    );
    await expectStatus(
      await searchMessagesRaw(request, { q: 'заявка', chatId: first.id }, { role: 'CLIENT' }),
      403,
      'поиск по чужому ticket-чату',
    );

    // Отправка в чат заявки доступна исполнителю — чат не «только для чтения».
    const message = await sendMessage(
      request,
      first.id,
      `E2E-M56 сообщение по заявке ${runTag()}`,
      {
        role: 'OPERATOR',
      },
    );
    expect(message.authorId, 'автор сообщения — исполнитель').toBe(operatorId);
  });
});

// ---------------------------------------------------------------------------
// 2b. OBJECT-чат
// ---------------------------------------------------------------------------

test.describe('Чаты: OBJECT', () => {
  test('чат по objectId идемпотентен, objectId заполнен, посторонний (CLIENT) — 403', async ({
    request,
  }) => {
    // Свой объект на тест: чат по objectId идемпотентен, и на чужом (засеянном)
    // объекте повторный вызов вернул бы чат предыдущего прогона.
    const object = await trackOwnObject(request, `E2E-M56 объект чата ${runTag()}`);

    const first = await trackObjectChat(request, object.id, { title: 'Чат объекта' });
    expect(first.type).toBe('object');
    expect(first.objectId, 'object-чат связан с объектом').toBe(object.id);

    // Идемпотентность по objectId: второй POST возвращает ТОТ ЖЕ чат (в схеме
    // `Chat.objectId` уникален; гонка закрыта обработкой P2002).
    const second = await trackObjectChat(request, object.id);
    expect(second.id, 'повторное создание возвращает существующий чат').toBe(first.id);

    // Регрессия дефекта М7.3: objectId — поле ТОЛЬКО object-чатов, и уникальный
    // индекс не должен мешать созданию ticket-чатов на том же объекте.
    const adminId = await loginIdAs(request, 'ADMIN');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const ticket = await trackTicket(request, {
      objectId: object.id,
      assigneeId: operatorId,
      description: `E2E-M56 заявка на объекте чата ${runTag()}`,
    });
    const ticketChat = await trackTicketChat(request, ticket.id);
    expect(ticketChat.type).toBe('ticket');
    expect(ticketChat.objectId, 'ticket-чат не занимает objectId').toBeNull();
    expect(ticketChat.id, 'чат заявки — не object-чат').not.toBe(first.id);

    // Участник (создатель) видит чат; staff-исключение действует для ADMIN/SUPERVISOR...
    const creatorView = await getChatOrFail(request, first.id);
    expect(creatorView.members.map((member) => member.userId)).toContain(adminId);
    expect((await listMyChats(request)).map((item) => item.id)).toContain(first.id);

    // ...а посторонний CLIENT не видит ни деталь, ни историю, ни в списке.
    await expectStatus(await getChatRaw(request, first.id, { role: 'CLIENT' }), 403, 'деталь');
    await expectStatus(
      await listMessagesRaw(request, first.id, {}, { role: 'CLIENT' }),
      403,
      'история object-чата посторонним',
    );
    expect(
      (await listMyChats(request, { role: 'CLIENT' })).map((item) => item.id),
      'чужой object-чат не попадает в список',
    ).not.toContain(first.id);
  });

  test('object-чат создаёт только staff: OPERATOR и CLIENT → 403, несуществующий объект → 400', async ({
    request,
  }) => {
    const object = await trackOwnObject(request, `E2E-M56 права объекта ${runTag()}`);

    await expectStatus(
      await postChat(request, { type: 'object', objectId: object.id }, { role: 'OPERATOR' }),
      403,
      'object-чат от OPERATOR',
    );
    await expectStatus(
      await postChat(request, { type: 'object', objectId: object.id }, { role: 'CLIENT' }),
      403,
      'object-чат от CLIENT',
    );

    // «Чужого объекта» в буквальном смысле у портала нет (скоуп объектов клиента
    // ведёт UI по clientName), но недоступный объект обязан отсекаться: чат по
    // несуществующему objectId — 400 от core-service, а не «чат в пустоту».
    await expectStatus(
      await postChat(request, { type: 'object', objectId: randomUuid() }),
      400,
      'object-чат по несуществующему объекту',
    );

    // Ни один из запрещённых вызовов не создал чат: у объекта чата нет.
    expect(
      (await listMyChats(request)).filter((chat) => chat.objectId === object.id),
      'после 403 и 400 чата по объекту не появилось',
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. История и пагинация
// ---------------------------------------------------------------------------

test.describe('Чаты: история и пагинация', () => {
  test('порядок от старых к новым и курсор before/limit разбивают историю на страницы', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const chat = await trackDirectChat(request, operatorId);
    const tag = runTag();
    const texts = [1, 2, 3, 4, 5].map((number) => `E2E-M56 история ${tag} #${number}`);

    const sent: ChatMessage[] = [];
    for (const text of texts) {
      sent.push(await sendMessage(request, chat.id, text));
    }
    expect(new Set(sent.map((message) => message.id)).size, 'у каждого сообщения свой id').toBe(5);

    // Полная страница: наши сообщения идут от старых к новым (внутри страницы время не убывает).
    const full = await messagesPage(request, chat.id, { limit: 50 });
    expect(full.limit, 'limit по умолчанию — 50').toBe(50);
    expect(
      textsOf(full.items).filter((text) => text.startsWith(`E2E-M56 история ${tag}`)),
      'наши сообщения вернулись в порядке отправки',
    ).toEqual(texts);
    const times = full.items.map((message) => Date.parse(message.createdAt));
    expect(times, 'внутри страницы createdAt не убывает').toEqual([...times].sort((a, b) => a - b));

    // Страница 1: две самые свежие; hasMore=true, nextBefore — createdAt самого старого
    // сообщения страницы (курсор для подгрузки вверх).
    const page1 = await messagesPage(request, chat.id, { limit: 2 });
    expect(textsOf(page1.items), 'первая страница — два последних сообщения').toEqual([
      texts[3],
      texts[4],
    ]);
    expect(page1.hasMore, 'выше есть ещё сообщения').toBe(true);
    expect(page1.nextBefore, 'курсор — createdAt самого старого в странице').toBe(
      page1.items[0].createdAt,
    );

    // Страница 2: строго старше курсора, без пересечений с первой.
    const page2 = await messagesPage(request, chat.id, {
      before: page1.nextBefore as string,
      limit: 2,
    });
    expect(textsOf(page2.items), 'вторая страница — предыдущие два сообщения').toEqual([
      texts[1],
      texts[2],
    ]);
    expect(page2.hasMore).toBe(true);
    expect(Date.parse(page2.items[1].createdAt), 'страницы не пересекаются').toBeLessThan(
      Date.parse(page1.items[0].createdAt),
    );

    // Страница 3 доходит до самого старого нашего сообщения; всё её содержимое строго
    // старше второй страницы (фильтр createdAt < before строгий).
    const page3 = await messagesPage(request, chat.id, {
      before: page2.nextBefore as string,
      limit: 2,
    });
    expect(page3.items.at(-1)?.text, 'третья страница закрывает нашу историю').toBe(texts[0]);
    for (const item of page3.items) {
      expect(Date.parse(item.createdAt)).toBeLessThan(Date.parse(page2.items[0].createdAt));
    }

    // Границы DTO: limit > 100 и limit < 1 — 400 от валидатора, мусорная дата — тоже 400.
    await expectStatus(
      await listMessagesRaw(request, chat.id, { limit: 101 }),
      400,
      'limit больше 100',
    );
    await expectStatus(await listMessagesRaw(request, chat.id, { limit: 0 }), 400, 'limit = 0');
    await expectStatus(
      await listMessagesRaw(request, chat.id, { before: 'не-дата' }),
      400,
      'before не ISO 8601',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Отметка прочтения
// ---------------------------------------------------------------------------

test.describe('Чаты: отметка прочтения', () => {
  test('unreadCount уменьшается после read и не откатывается назад', async ({ request }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const chat = await trackDirectChat(request, operatorId);
    const tag = runTag();

    // Выравниваем состояние: читаем самое свежее сообщение чата (в нём могли быть
    // сообщения прошлых прогонов) — иначе unreadCount содержал бы их.
    const baseline = await sendMessage(request, chat.id, `E2E-M56 read baseline ${tag}`);
    await expectStatus(
      await markRead(request, chat.id, baseline.id, { role: 'OPERATOR' }),
      200,
      'read baseline',
    );
    expect(
      await unreadCountOf(request, chat.id, { role: 'OPERATOR' }),
      'после чтения непрочитанных нет',
    ).toBe(0);

    // Два новых сообщения от ADMIN — оба непрочитанные для OPERATOR.
    const first = await sendMessage(request, chat.id, `E2E-M56 read #1 ${tag}`);
    const second = await sendMessage(request, chat.id, `E2E-M56 read #2 ${tag}`);
    expect(
      await unreadCountOf(request, chat.id, { role: 'OPERATOR' }),
      'оба новых сообщения непрочитаны',
    ).toBe(2);

    // Отметка прочтения возвращает lastReadAt = createdAt указанного сообщения.
    const read = await markRead(request, chat.id, second.id, { role: 'OPERATOR' });
    await expectStatus(read, 200, 'отметка прочтения');
    const readBody = (await read.json()) as {
      chatId: string;
      userId: string;
      lastMessageId: string;
      readAt: string;
    };
    expect(readBody.chatId).toBe(chat.id);
    expect(readBody.userId).toBe(operatorId);
    expect(readBody.lastMessageId).toBe(second.id);
    expect(readBody.readAt, 'readAt = createdAt прочитанного сообщения').toBe(second.createdAt);
    expect(
      await unreadCountOf(request, chat.id, { role: 'OPERATOR' }),
      'unreadCount обнулился',
    ).toBe(0);

    // Отметка назад не откатывается: новое сообщение остаётся непрочитанным, даже если
    // следом «прочитать» более старое (иначе клиент терял бы свежие сообщения).
    const third = await sendMessage(request, chat.id, `E2E-M56 read #3 ${tag}`);
    expect(await unreadCountOf(request, chat.id, { role: 'OPERATOR' })).toBe(1);
    await expectStatus(
      await markRead(request, chat.id, first.id, { role: 'OPERATOR' }),
      200,
      'чтение старого',
    );
    expect(
      await unreadCountOf(request, chat.id, { role: 'OPERATOR' }),
      'чтение старого сообщения не скрывает новое',
    ).toBe(1);

    // Читаем свежее — снова ноль; повторная отметка идемпотентна.
    await expectStatus(
      await markRead(request, chat.id, third.id, { role: 'OPERATOR' }),
      200,
      'чтение свежего',
    );
    await expectStatus(
      await markRead(request, chat.id, third.id, { role: 'OPERATOR' }),
      200,
      'повтор отметки',
    );
    expect(await unreadCountOf(request, chat.id, { role: 'OPERATOR' })).toBe(0);

    // Несуществующее сообщение в своём чате — 404, а не «отметили что попало».
    const unknownMessage = await markRead(request, chat.id, randomUuid(), { role: 'OPERATOR' });
    await expectStatus(unknownMessage, 404, 'отметка несуществующего сообщения');
    expect(await errorMessage(unknownMessage)).toContain('Сообщение не найдено');
  });
});

// ---------------------------------------------------------------------------
// 5. Поиск
// ---------------------------------------------------------------------------

test.describe('Чаты: поиск', () => {
  test('подстрока ищется только в своих чатах, чужой chatId → 403', async ({ request }) => {
    const adminId = await loginIdAs(request, 'ADMIN');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const clientId = await loginIdAs(request, 'CLIENT');
    const tag = runTag();
    const needle = `M56-поиск-${tag}`;
    const text = `E2E ${needle} сообщение`;

    // Свой чат (ADMIN ↔ OPERATOR): два сообщения с искомой подстрокой.
    const ownChat = await trackDirectChat(request, operatorId);
    const ownFirst = await sendMessage(request, ownChat.id, `${text} первое`);
    const ownSecond = await sendMessage(request, ownChat.id, `${text} второе`);
    expect(ownFirst.authorId, 'автор своих сообщений — ADMIN').toBe(adminId);

    // Чужой для OPERATOR чат (ADMIN ↔ CLIENT) с ТОЙ ЖЕ подстрокой: поиск не должен
    // его вернуть — это и есть проверка «только по своим чатам», а не пустой ответ.
    const foreignChat = await trackDirectChat(request, clientId);
    const foreignMessage = await sendMessage(request, foreignChat.id, `${text} чужой чат`, {
      role: 'CLIENT',
    });
    expect(foreignMessage.authorId).toBe(clientId);

    // Поиск по ПОДСТРОКЕ (не по полному тексту) находит только сообщения своих чатов.
    const found = await searchMessages(request, { q: needle }, { role: 'OPERATOR' });
    expect(found.total, 'найдены оба своих сообщения').toBe(2);
    expect(found.items.map((item) => item.id).sort()).toEqual([ownFirst.id, ownSecond.id].sort());
    expect(new Set(found.items.map((item) => item.chatId))).toEqual(new Set([ownChat.id]));

    // Регистронезависимость (ILIKE) и ограничение одним своим чатом.
    const lower = await searchMessages(request, { q: needle.toLowerCase() }, { role: 'OPERATOR' });
    expect(lower.total, 'поиск не зависит от регистра').toBe(2);

    const scoped = await searchMessages(
      request,
      { q: needle, chatId: ownChat.id, limit: 1 },
      { role: 'OPERATOR' },
    );
    expect(scoped.total, 'total считает все совпадения, а не размер страницы').toBe(2);
    expect(scoped.items, 'limit режет выдачу').toHaveLength(1);

    // ADMIN — создатель ОБОИХ direct-чатов, поэтому его область поиска шире:
    // три совпадения, включая чужое для OPERATOR сообщение.
    const adminFound = await searchMessages(request, { q: needle }, { role: 'ADMIN' });
    expect(adminFound.total, 'ADMIN видит совпадения во всех своих чатах').toBe(3);
    expect(adminFound.items.map((item) => item.chatId)).toContain(foreignChat.id);

    // Чужой чат в области поиска — 403 (фронт должен знать, что поиск запрещён,
    // а не что «ничего не найдено»).
    await expectStatus(
      await searchMessagesRaw(request, { q: needle, chatId: foreignChat.id }, { role: 'OPERATOR' }),
      403,
      'поиск по чужому chatId',
    );

    // SUPERVISOR не участник ни одного из этих direct-чатов: находок нет.
    const outsider = await searchMessages(request, { q: needle }, { role: 'SUPERVISOR' });
    expect(outsider.items, 'чужие чаты в поиск не попадают').toEqual([]);
    expect(outsider.total).toBe(0);

    // Владелец второго чата находит СВОЁ сообщение той же подстрокой.
    const clientFound = await searchMessages(
      request,
      { q: needle, chatId: foreignChat.id },
      { role: 'CLIENT' },
    );
    expect(clientFound.items.map((item) => item.id)).toEqual([foreignMessage.id]);

    // Пустой q — 400: поиск по пустой строке вернул бы весь чат.
    await expectStatus(await searchMessagesRaw(request, { q: '' }), 400, 'пустой q');
    await expectStatus(
      await searchMessagesRaw(request, { q: `нет-такого-${tag}` }),
      200,
      'запрос без совпадений',
    );
    const noMatch = await searchMessages(request, { q: `нет-такого-${tag}` });
    expect(noMatch.items).toHaveLength(0);
    expect(noMatch.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Права и валидация
// ---------------------------------------------------------------------------

test.describe('Чаты: права', () => {
  test('401 без токена, 403 на чужой чат, 404 на несуществующий', async ({ request }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const chat = await trackDirectChat(request, operatorId);
    const foreign = randomUuid();

    // 401 — до всякой валидации: охрана аутентификации стоит перед ролями.
    await expectStatus(
      await request.get(`${CHAT_URL}/api/chat/chats`),
      401,
      'список чатов без токена',
    );
    await expectStatus(
      await request.post(`${CHAT_URL}/api/chat/chats`, {
        data: { type: 'system', title: 'аноним' },
      }),
      401,
      'создание чата без токена',
    );
    await expectStatus(
      await request.get(`${CHAT_URL}/api/chat/chats/${chat.id}`),
      401,
      'деталь чата без токена',
    );
    await expectStatus(
      await request.get(`${CHAT_URL}/api/chat/chats/${chat.id}/messages`),
      401,
      'история без токена',
    );
    await expectStatus(
      await request.get(`${CHAT_URL}/api/chat/messages/search?q=test`),
      401,
      'поиск без токена',
    );

    // 403 на чужой chatId — во всех эндпоинтах чата (SUPERVISOR не участник direct-чата).
    await expectStatus(await getChatRaw(request, chat.id, { role: 'SUPERVISOR' }), 403, 'деталь');
    await expectStatus(
      await listMessagesRaw(request, chat.id, {}, { role: 'SUPERVISOR' }),
      403,
      'история',
    );
    await expectStatus(
      await postMessage(request, chat.id, { text: 'чужое' }, { role: 'SUPERVISOR' }),
      403,
      'отправка',
    );
    await expectStatus(
      await markRead(request, chat.id, randomUuid(), { role: 'SUPERVISOR' }),
      403,
      'прочтение',
    );

    // 404 на несуществующий чат: сначала «нет чата», потом «нет прав» — порядок контракта.
    const missingChat = await getChatRaw(request, foreign);
    await expectStatus(missingChat, 404, 'деталь несуществующего чата');
    expect(await errorMessage(missingChat)).toContain('Чат не найден');
    await expectStatus(
      await listMessagesRaw(request, foreign),
      404,
      'история несуществующего чата',
    );
    await expectStatus(
      await postMessage(request, foreign, { text: 'нет чата' }),
      404,
      'отправка в несуществующий чат',
    );
    await expectStatus(
      await markRead(request, foreign, randomUuid()),
      404,
      'прочтение в несуществующем чате',
    );

    // 400 — валидация DTO создания чата.
    await expectStatus(
      await postChat(request, { type: 'direct' }),
      400,
      'direct без второго участника',
    );
    await expectStatus(
      await postChat(request, { type: 'direct', participantIds: [operatorId, foreign] }),
      400,
      'direct с двумя вторыми участниками',
    );
    await expectStatus(await postChat(request, { type: 'ticket' }), 400, 'ticket без ticketId');
    await expectStatus(await postChat(request, { type: 'object' }), 400, 'object без objectId');
    await expectStatus(
      await postChat(request, { type: 'unknown' as never }),
      400,
      'неизвестный тип чата',
    );

    // Роли создания: ticket/object — ADMIN/SUPERVISOR, system — только ADMIN.
    await expectStatus(
      await postChat(request, { type: 'system', title: 'не админ' }, { role: 'OPERATOR' }),
      403,
      'system-чат от OPERATOR',
    );
    await expectStatus(
      await postChat(request, { type: 'ticket', ticketId: foreign }, { role: 'OPERATOR' }),
      403,
      'ticket-чат от OPERATOR',
    );

    // Сообщение: пустое и слишком длинное — 400 (ограничения DTO, а не 500).
    await expectStatus(
      await postMessage(request, chat.id, { text: '   ' }),
      400,
      'пустое сообщение',
    );
    await expectStatus(
      await postMessage(request, chat.id, { text: 'а'.repeat(4001) }),
      400,
      'сообщение длиннее 4000 символов',
    );
  });
});

// ---------------------------------------------------------------------------
// 7. WebSocket
// ---------------------------------------------------------------------------

test.describe('Чаты: WebSocket', () => {
  test('ack отправителю, message:new второму, message:read автору, отказ без токена и в чужой чат', async ({
    request,
  }) => {
    const adminId = await loginIdAs(request, 'ADMIN');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const adminToken = await loginAs(request, 'ADMIN');
    const operatorToken = await loginAs(request, 'OPERATOR');
    const chat = await trackDirectChat(request, operatorId);
    const tag = runTag();

    // 1. Соединение без токена: сервер принимает handshake и сразу рвёт его,
    //    присылая error с текстом контракта.
    const anonymous = await connectUnauthorized();
    expect(anonymous.connected, 'неавторизованное соединение не остаётся живым').toBe(false);
    expect(anonymous.error, 'сервер обязан объяснить отказ').toMatchObject({
      message: expect.stringContaining('Неавторизованное соединение'),
    });

    // 2. Два авторизованных соединения участников чата; авторизация подтверждается
    //    онлайн-картой шлюза (health), а не только событием connect.
    const adminSocket = await connectAuthorized(request, adminToken, adminId, 'ADMIN');
    const operatorSocket = await connectAuthorized(request, operatorToken, operatorId, 'OPERATOR');
    const adminInbox = messageInbox(adminSocket);
    const operatorInbox = messageInbox(operatorSocket);
    const adminReads = readInbox(adminSocket);

    // 3. message:send от ADMIN → ack автору и message:new второму участнику.
    const firstAck = await emitAck(adminSocket, 'message:send', {
      chatId: chat.id,
      text: `WS первое ${tag}`,
    });
    expect(firstAck.ok, `ack отправителю: ${JSON.stringify(firstAck)}`).toBe(true);
    const firstMessage = firstAck.message as ChatMessage;
    expect(firstMessage.id).toBeTruthy();
    expect(firstMessage.authorId).toBe(adminId);
    expect(firstMessage.chatId).toBe(chat.id);
    chatTracker.message(firstMessage.id);

    const delivered = await waitForMessage(operatorInbox, firstMessage.id, 'OPERATOR');
    expect(delivered.text).toBe(`WS первое ${tag}`);
    expect(delivered.authorId).toBe(adminId);
    expect(
      adminInbox.map((message) => message.id),
      'отправитель не получает эхо своего сообщения (он получает ack)',
    ).not.toContain(firstMessage.id);

    // 4. Ответ OPERATOR → ack ему и message:new ADMIN-у. Тот факт, что ADMIN получил
    //    ответ, доказывает, что и рассылка первого сообщения уже обработана сервером:
    //    поэтому отсутствие эха проверяется без фиксированных пауз.
    const replyAck = await emitAck(operatorSocket, 'message:send', {
      chatId: chat.id,
      text: `WS ответ ${tag}`,
    });
    expect(replyAck.ok, `ack второго участника: ${JSON.stringify(replyAck)}`).toBe(true);
    const replyMessage = replyAck.message as ChatMessage;
    chatTracker.message(replyMessage.id);
    await waitForMessage(adminInbox, replyMessage.id, 'ADMIN');
    expect(
      adminInbox.map((message) => message.id),
      'ADMIN не получил собственное сообщение',
    ).not.toContain(firstMessage.id);
    expect(
      operatorInbox.map((message) => message.id),
      'OPERATOR не получил собственное сообщение',
    ).not.toContain(replyMessage.id);

    // 5. message:read → событие message:read автору прочитанного сообщения.
    const readAck = await emitAck(operatorSocket, 'message:read', {
      chatId: chat.id,
      lastMessageId: firstMessage.id,
    });
    expect(readAck.ok, `ack отметки прочтения: ${JSON.stringify(readAck)}`).toBe(true);
    expect(readAck.readAt, 'ack содержит readAt').toBe(firstMessage.createdAt);
    const readEvent = await waitForRead(adminReads, firstMessage.id, 'автору ADMIN');
    expect(readEvent.chatId).toBe(chat.id);
    expect(readEvent.readBy).toBe(operatorId);

    // 6. Чужой чат: system-чат создан ADMIN, OPERATOR в нём не участник.
    const foreign = await trackSystemChat(request, { title: `E2E-M56 чужой WS-чат ${tag}` });
    const denied = await emitAck(operatorSocket, 'message:send', {
      chatId: foreign.id,
      text: 'отправка в чужой чат',
    });
    expect(denied.ok, 'отправка в чужой чат отклонена').toBe(false);
    expect(denied.status, 'в ack приходит HTTP-статус причины').toBe(403);
    expect(denied.error).toContain('Вы не участник этого чата');

    // 7. Валидация WS-payload та же, что у REST: пустой текст и несуществующий чат
    //    отклоняются в ack, а не превращаются в 500.
    const empty = await emitAck(operatorSocket, 'message:send', { chatId: chat.id, text: '   ' });
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain('пустым');

    const unknown = await emitAck(operatorSocket, 'message:send', {
      chatId: randomUuid(),
      text: 'нет такого чата',
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.status).toBe(404);

    // Соединения закрываются в afterEach (closeAllSockets) — здесь только проверяем,
    // что после закрытия участники уходят из онлайн-карты, чтобы не влиять на push-тест.
    await closeAllSockets();
    await waitFor(
      async () => {
        const health = await chatHealth(request);
        return (health.online[adminId] ?? 0) === 0 && (health.online[operatorId] ?? 0) === 0;
      },
      5_000,
      'после закрытия сокетов участники остались в онлайн-карте шлюза',
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Push оффлайн-получателю (фактический контракт)
// ---------------------------------------------------------------------------

test.describe('Чаты: push оффлайн-получателю', () => {
  test('фактический контракт: notification-service не принимает chat-message, in-app записи нет', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, 'ADMIN');
    // Свежий OPERATOR: его токен не использовался ни одним сокетом, поэтому он
    // гарантированно оффлайн — именно такой получатель и нужен для проверки push.
    const fresh = await createFreshOperator(request);
    const chat = await trackDirectChat(request, fresh.id);

    const health = await chatHealth(request);
    expect(health.online[fresh.id] ?? 0, 'получатель не держит WebSocket-соединение').toBe(0);

    // Корень дефекта: внутреннего эндпоинта push в notification-service нет.
    // Именно его и вызывает chat-service (`notification-push.client.ts`), поэтому
    // реальная доставка push невозможна — фиксируем это как контракт стенда.
    const internalPush = await request.post(
      `${NOTIFICATIONS_URL}/api/notifications/internal/chat-message`,
      {
        headers: authHeader(adminToken),
        data: {
          userIds: [fresh.id],
          type: 'CHAT_MESSAGE',
          title: 'Новое сообщение',
          body: 'E2E-M56 push',
          data: { chatId: chat.id },
        },
      },
    );
    // Эндпоинт push существует (М5): сервисный токен — админ, ответ несёт сводку доставки.
    expect(
      internalPush.status(),
      'внутренний push оффлайн-получателям должен доставляться, а не отвечать 404',
    ).toBe(200);
    const delivered = (await internalPush.json()) as { delivered?: number };
    expect(delivered.delivered, 'push доставлен хотя бы одному получателю').toBeGreaterThan(0);

    // Отправка оффлайн-получателю. ChatService вызывает notifyOffline ВНУТРИ запроса
    // (до ответа), поэтому к моменту 201 попытка push уже завершилась — запись
    // проверяется сразу, без ожиданий.
    const message = await sendMessage(request, chat.id, `E2E-M56 push ${runTag()}`, {
      token: adminToken,
    });
    expect(message.chatId).toBe(chat.id);

    // Контракт М5: сообщение оффлайн-получателю создаёт уведомление типа CHAT_MESSAGE
    // с нашим chatId в payload. Раньше эндпоинта не было и записи не появлялись —
    // теперь отсутствие записи это регресс, а не ожидаемое поведение.
    const page = await notificationsPage(request, { limit: 100 }, { token: fresh.token });
    const chatRelated = page.items.filter(
      (item) => (item.type as string) === 'CHAT_MESSAGE' || item.payload?.['chatId'] === chat.id,
    );
    expect(
      chatRelated.length,
      'push оффлайн-получателю создаёт уведомление CHAT_MESSAGE',
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Уборка
// ---------------------------------------------------------------------------

test.describe('Чаты: уборка', () => {
  test('flush сносит чат, сообщения и участников прогона, не трогая чужие чаты', async ({
    request,
  }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    const operatorId = await loginIdAs(request, 'OPERATOR');
    // Чат на уборке — ticket-чат: он гарантированно новый (ticketId уникален),
    // поэтому проверка «до/после» не зависит от чатов других наборов.
    const ticket = await trackTicket(request, {
      assigneeId: operatorId,
      description: `E2E-M56 уборка ${runTag()}`,
    });
    const own = await trackTicketChat(request, ticket.id);
    await sendMessage(request, own.id, `E2E-M56 уборка #1 ${runTag()}`);
    await sendMessage(request, own.id, `E2E-M56 уборка #2 ${runTag()}`);

    // «Чужой» чат: создан, но НЕ поставлен на уборку — он должен пережить flush.
    const foreign = await createSystemChat(request, { title: `E2E-M56 не наш ${runTag()}` });

    const before = chatTracker.snapshot();
    // «До»: строки прогона реально лежат в БД — иначе проверка «после» ничего не значит.
    expect(before.chatIds, 'наш чат поставлен на уборку').toContain(own.id);
    expect(countChats(before.chatIds), 'чат прогона есть в БД').toBe(1);
    expect(countMessages(before.messageIds), 'сообщения прогона есть в БД').toBe(
      before.messageIds.length,
    );
    expect(countChatDependants([own.id]), 'участники чата на месте').toEqual({
      messages: 2,
      members: 2,
    });

    const removed = chatTracker.flush();
    expect(removed.chats, 'удалён ровно наш чат').toBe(1);
    expect(removed.messages, 'удалены сообщения чата').toBeGreaterThanOrEqual(2);
    expect(removed.members, 'удалены участники чата').toBe(2);

    // «После»: ни чата, ни его сообщений, ни участников; чужой чат не тронут.
    expect(countChats(before.chatIds), 'чат прогона удалён').toBe(0);
    expect(countMessages(before.messageIds), 'сообщения прогона удалены').toBe(0);
    expect(countChatDependants([own.id]), 'за чатом не осталось строк').toEqual({
      messages: 0,
      members: 0,
    });
    expect(countChats([foreign.id]), 'чат, не поставленный на уборку, остался').toBe(1);

    // Чужой чат снимается уже после проверки — иначе он остался бы на стенде.
    chatTracker.chat(foreign.id);
  });
});
