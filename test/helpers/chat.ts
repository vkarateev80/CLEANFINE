import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { authHeader, loginAs, type Role } from './core';
import { expectStatus, sqlAvailable } from './operations';

/**
 * Хелперы chat-service для e2e (М5.6).
 *
 * Границы сервисов (каждый ходит по абсолютному адресу, как core-набор М2.9):
 *  - auth-service   (E2E_API_URL,           :3001) — только access-токены;
 *  - chat-service   (E2E_CHAT_URL,          :3009) — REST /api/chat и WebSocket namespace /chat.
 *
 * Уборка. У chat-service нет DELETE ни для чата, ни для сообщения, поэтому набор помнит
 * созданные чаты и сообщения и сносит РОВНО их через `docker exec ... psql -f`
 * (SQL-файл + `docker cp`: тот же приём, что и в helpers/operations.ts, но там `-c`;
 * здесь выбран `-f`, потому что SQL собирается из десятков id и файл читается psql без
 * интерпретации кавычек оболочкой). Засеянные данные и чаты других наборов не трогаются:
 * удаляются только чаты, СОЗДАННЫЕ этим прогоном, и только свои сообщения по id.
 *
 * Трекер живёт в `globalThis` (тот же приём и та же причина, что в operations.ts):
 * Playwright грузит helper двумя путями импорта, и модуль инстанциируется дважды —
 * обычная переменная модуля разошлась бы между спек-файлом и вызовами внутри хелпера.
 */

export const CHAT_URL = process.env.E2E_CHAT_URL ?? 'http://localhost:3009';

/** Namespace WebSocket-шлюза: socket.io сам добавляет транспортный путь /socket.io. */
export const CHAT_WS_URL = `${CHAT_URL}/chat`;

/** Контейнер и база чатов для точечной уборки (те же имена, что у остальных наборов). */
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? 'cleaning-ops-postgres';
const POSTGRES_USER = process.env.E2E_POSTGRES_USER ?? 'admin';
const CHAT_DB = process.env.E2E_CHAT_DB ?? 'cleaning_ops_chat';

export type ChatType = 'object' | 'ticket' | 'direct' | 'system';

export interface ChatMemberView {
  userId: string;
  role: string | null;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  lastMessage: Omit<ChatMessage, 'chatId'> | null;
  unreadCount: number;
}

export interface ChatDetail {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  members: ChatMemberView[];
}

export interface MessagesPage {
  items: ChatMessage[];
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
}

export interface ChatSearchResult {
  items: ChatMessage[];
  total: number;
}

export interface ChatHealth {
  status: string;
  service: string;
  /** userId → число активных WebSocket-соединений (онлайн-карта шлюза). */
  online: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Обёртки запросов
// ---------------------------------------------------------------------------

export interface ChatApiOptions {
  data?: unknown;
  token?: string;
  role?: Role;
}

/** Запрос к chat-service REST (по умолчанию ADMIN). */
export function chatApi(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return (async () => {
    const token = options.token ?? (await loginAs(request, options.role ?? 'ADMIN'));
    const init = {
      headers: authHeader(token),
      ...(options.data !== undefined ? { data: options.data } : {}),
    };
    return method === 'get'
      ? request.get(`${CHAT_URL}${path}`, init)
      : request.post(`${CHAT_URL}${path}`, init);
  })();
}

/** GET /api/chat/health — публичный: статус сервиса и онлайн-карта шлюза. */
export async function chatHealth(request: APIRequestContext): Promise<ChatHealth> {
  const res = await request.get(`${CHAT_URL}/api/chat/health`);
  expect(res.status(), `health chat-service: ${await res.text()}`).toBe(200);
  return (await res.json()) as ChatHealth;
}

/** GET /api/chat/chats — «мои чаты» (ответ как есть, для негативных кейсов). */
export function listChatsRaw(
  request: APIRequestContext,
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return chatApi(request, 'get', '/api/chat/chats', options);
}

/** GET /api/chat/chats с проверкой 200. */
export async function listMyChats(
  request: APIRequestContext,
  options: ChatApiOptions = {},
): Promise<ChatSummary[]> {
  const res = await listChatsRaw(request, options);
  await expectStatus(res, 200, 'список чатов');
  return (await res.json()) as ChatSummary[];
}

/** POST /api/chat/chats — создание чата (ответ как есть). */
export function postChat(
  request: APIRequestContext,
  data: { type: ChatType; participantIds?: string[]; objectId?: string; ticketId?: string; title?: string },
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return chatApi(request, 'post', '/api/chat/chats', { ...options, data });
}

/**
 * DIRECT-чат: себя добавляет сам создатель, второй участник — `participantId`.
 * Возвращает и сам чат, и признак «создан нами»: при повторном вызове для той же пары
 * chat-service возвращает СУЩЕСТВУЮЩИЙ чат (идемпотентность), а он может принадлежать
 * другому набору — такой чат уборка не трогает (см. trackDirectChat).
 */
export async function createDirectChat(
  request: APIRequestContext,
  participantId: string,
  options: ChatApiOptions = {},
): Promise<ChatDetail> {
  const res = await postChat(request, { type: 'direct', participantIds: [participantId] }, options);
  await expectStatus(res, 201, 'создание direct-чата');
  return (await res.json()) as ChatDetail;
}

/** TICKET-чат по заявке: повторный вызов обязан вернуть тот же чат (идемпотентность). */
export async function createTicketChat(
  request: APIRequestContext,
  ticketId: string,
  options: ChatApiOptions & { participantIds?: string[]; title?: string } = {},
): Promise<ChatDetail> {
  const res = await postChat(
    request,
    {
      type: 'ticket',
      ticketId,
      ...(options.participantIds ? { participantIds: options.participantIds } : {}),
      ...(options.title ? { title: options.title } : {}),
    },
    options,
  );
  await expectStatus(res, 201, `создание ticket-чата по заявке ${ticketId}`);
  return (await res.json()) as ChatDetail;
}

/** SYSTEM-чат: только ADMIN, каждый вызов создаёт НОВЫЙ чат (идемпотентности нет). */
export async function createSystemChat(
  request: APIRequestContext,
  input: { title?: string; participantIds?: string[] } = {},
  options: ChatApiOptions = {},
): Promise<ChatDetail> {
  const res = await postChat(
    request,
    {
      type: 'system',
      ...(input.title ? { title: input.title } : {}),
      ...(input.participantIds ? { participantIds: input.participantIds } : {}),
    },
    options,
  );
  await expectStatus(res, 201, 'создание system-чата');
  return (await res.json()) as ChatDetail;
}

/** GET /api/chat/chats/:id — деталь (ответ как есть, для негативных кейсов). */
export function getChatRaw(
  request: APIRequestContext,
  chatId: string,
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return chatApi(request, 'get', `/api/chat/chats/${chatId}`, options);
}

/** GET /api/chat/chats/:id с проверкой 200. */
export async function getChatOrFail(
  request: APIRequestContext,
  chatId: string,
  options: ChatApiOptions = {},
): Promise<ChatDetail> {
  const res = await getChatRaw(request, chatId, options);
  await expectStatus(res, 200, `деталь чата ${chatId}`);
  return (await res.json()) as ChatDetail;
}

/** GET /api/chat/chats/:id/messages?before=&limit= (ответ как есть). */
export function listMessagesRaw(
  request: APIRequestContext,
  chatId: string,
  query: { before?: string; limit?: number } = {},
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  const params = new URLSearchParams();
  if (query.before !== undefined) params.set('before', query.before);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return chatApi(request, 'get', `/api/chat/chats/${chatId}/messages${suffix}`, options);
}

/** GET /api/chat/chats/:id/messages с проверкой 200. */
export async function messagesPage(
  request: APIRequestContext,
  chatId: string,
  query: { before?: string; limit?: number } = {},
  options: ChatApiOptions = {},
): Promise<MessagesPage> {
  const res = await listMessagesRaw(request, chatId, query, options);
  await expectStatus(res, 200, `история чата ${chatId}`);
  return (await res.json()) as MessagesPage;
}

/** POST /api/chat/chats/:id/messages — REST-фолбэк отправки (ответ как есть). */
export function postMessage(
  request: APIRequestContext,
  chatId: string,
  data: { text: string; attachmentIds?: string[] },
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return chatApi(request, 'post', `/api/chat/chats/${chatId}/messages`, { ...options, data });
}

/**
 * Отправка сообщения с проверкой 201. Сообщение сразу ставится на уборку:
 * даже если чат окажется чужим (созданным другим набором), свои строки набор снимет.
 */
export async function sendMessage(
  request: APIRequestContext,
  chatId: string,
  text: string,
  options: ChatApiOptions = {},
): Promise<ChatMessage> {
  const res = await postMessage(request, chatId, { text }, options);
  await expectStatus(res, 201, `отправка сообщения в чат ${chatId}`);
  const message = (await res.json()) as ChatMessage;
  chatTracker.message(message.id);
  return message;
}

/** POST /api/chat/chats/:id/read — отметка прочтения (200, ответ как есть). */
export function markRead(
  request: APIRequestContext,
  chatId: string,
  lastMessageId: string,
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  return chatApi(request, 'post', `/api/chat/chats/${chatId}/read`, {
    ...options,
    data: { lastMessageId },
  });
}

/** GET /api/chat/messages/search?q=&chatId=&limit= (ответ как есть). */
export function searchMessagesRaw(
  request: APIRequestContext,
  query: { q?: string; chatId?: string; limit?: number },
  options: ChatApiOptions = {},
): Promise<APIResponse> {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set('q', query.q);
  if (query.chatId !== undefined) params.set('chatId', query.chatId);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return chatApi(request, 'get', `/api/chat/messages/search${suffix}`, options);
}

/** GET /api/chat/messages/search с проверкой 200. */
export async function searchMessages(
  request: APIRequestContext,
  query: { q?: string; chatId?: string; limit?: number },
  options: ChatApiOptions = {},
): Promise<ChatSearchResult> {
  const res = await searchMessagesRaw(request, query, options);
  await expectStatus(res, 200, `поиск сообщений «${query.q ?? ''}»`);
  return (await res.json()) as ChatSearchResult;
}

/** unreadCount конкретного чата из списка «мои чаты» (0, если чата нет в списке). */
export async function unreadCountOf(
  request: APIRequestContext,
  chatId: string,
  options: ChatApiOptions = {},
): Promise<number> {
  const chats = await listMyChats(request, options);
  return chats.find((chat) => chat.id === chatId)?.unreadCount ?? 0;
}

/** Есть ли у пользователя активное WebSocket-соединение (по онлайн-карте шлюза). */
export async function isUserOnline(request: APIRequestContext, userId: string): Promise<boolean> {
  const health = await chatHealth(request);
  return (health.online[userId] ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Уборка (SQL через docker: файл + psql -f)
// ---------------------------------------------------------------------------

/**
 * Значение для SQL-литерала: строка в одинарных кавычках, число — как есть.
 * Идентификаторы приходят из ответов сервисов, но проверка набора символов всё равно
 * обязательна: она исключает и подстановку кавычек, и случайный мусор в SQL.
 */
function literal(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Недопустимое число для SQL');
    return String(value);
  }
  if (!/^[0-9a-zA-Z_.:@+\- ]*$/.test(value)) {
    throw new Error(`Недопустимое значение для SQL-литерала: ${value}`);
  }
  return `'${value}'`;
}

/**
 * Выполняет SQL-скрипт в базе чатов: файл → `docker cp` → `psql -f`.
 *
 * Почему `-f`, а не `-c`. Скрипт уборки собирается из десятков id и содержит
 * двойные кавычки (колонки Prisma — PascalCase/camelCase), поэтому его надёжнее
 * передать файлом: psql читает ровно то, что записано, без интерпретации оболочки.
 * Даже при недоступном docker функция не бросает: она возвращает пустую строку,
 * а вызывающий код решает, что делать (спеки уборки скипаются по sqlAvailable()).
 */
function runSqlFile(statements: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-chat-sql-'));
  const localFile = join(dir, 'statements.sql');
  const remoteFile = `/tmp/e2e-chat-${process.pid}-${Date.now()}.sql`;
  writeFileSync(localFile, `${statements}\n`, 'utf8');
  try {
    execFileSync('docker', ['cp', localFile, `${POSTGRES_CONTAINER}:${remoteFile}`], {
      stdio: 'ignore',
    });
    const raw = execFileSync(
      'docker',
      [
        'exec',
        POSTGRES_CONTAINER,
        'psql',
        '-U',
        POSTGRES_USER,
        '-d',
        CHAT_DB,
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-f',
        remoteFile,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // На Windows psql печатает CRLF — убираем их, чтобы значения сравнивались строго.
    return raw.replace(/\r/g, '').trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    try {
      execFileSync('docker', ['exec', POSTGRES_CONTAINER, 'rm', '-f', remoteFile], {
        stdio: 'ignore',
      });
    } catch {
      // Контейнер мог быть остановлен между вызовами — временный файл живёт в /tmp.
    }
  }
}

/** Одно значение из SELECT (первая строка ответа psql). */
export function chatSqlValue(statement: string): string {
  if (!sqlAvailable()) return '';
  return runSqlFile(statement).split('\n')[0]?.trim() ?? '';
}

/** Сколько перечисленных чатов реально лежит в cleaning_ops_chat. */
export function countChats(ids: Iterable<string>): number {
  const list = [...ids];
  if (list.length === 0) return 0;
  const value = chatSqlValue(
    `SELECT COUNT(*)::text FROM "Chat" WHERE id IN (${list.map(literal).join(', ')})`,
  );
  return Number(value) || 0;
}

/** Сколько перечисленных сообщений реально лежит в cleaning_ops_chat. */
export function countMessages(ids: Iterable<string>): number {
  const list = [...ids];
  if (list.length === 0) return 0;
  const value = chatSqlValue(
    `SELECT COUNT(*)::text FROM "Message" WHERE id IN (${list.map(literal).join(', ')})`,
  );
  return Number(value) || 0;
}

/** Сколько сообщений/участников осталось у перечисленных чатов. */
export function countChatDependants(chatIds: Iterable<string>): { messages: number; members: number } {
  const list = [...chatIds];
  if (list.length === 0) return { messages: 0, members: 0 };
  const scope = list.map(literal).join(', ');
  return {
    messages: Number(chatSqlValue(`SELECT COUNT(*)::text FROM "Message" WHERE "chatId" IN (${scope})`)) || 0,
    members: Number(chatSqlValue(`SELECT COUNT(*)::text FROM "ChatMember" WHERE "chatId" IN (${scope})`)) || 0,
  };
}

/** Всего строк в таблицах чата — для отчёта о чистоте базы стенда. */
export function chatTableTotals(): { chats: number; members: number; messages: number } {
  return {
    chats: Number(chatSqlValue('SELECT COUNT(*)::text FROM "Chat"')) || 0,
    members: Number(chatSqlValue('SELECT COUNT(*)::text FROM "ChatMember"')) || 0,
    messages: Number(chatSqlValue('SELECT COUNT(*)::text FROM "Message"')) || 0,
  };
}

/** Числа из строк вида `DELETE 3` (psql печатает их по одной на оператор). */
function deleteCounts(output: string): number[] {
  return output
    .split('\n')
    .map((line) => /^\s*DELETE\s+(\d+)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
}

/**
 * Накопитель созданного за прогон: чаты и сообщения.
 *
 * Разделение принципиальное. Чат удаляется целиком (вместе с сообщениями и участниками)
 * ТОЛЬКО если он создан этим прогоном: direct-чат идемпотентен, и повторный вызов для
 * пары ADMIN↔OPERATOR может вернуть чат, созданный другим набором. Сообщения же
 * снимаются всегда по id — даже присланные в чужой чат.
 */
class ChatTracker {
  private readonly chatIds = new Set<string>();
  private readonly messageIds = new Set<string>();

  chat(id: string): void {
    this.chatIds.add(id);
  }

  message(id: string): void {
    this.messageIds.add(id);
  }

  /** Снимок id «до уборки» — нужен тестам, которые проверяют саму уборку. */
  snapshot(): { chatIds: string[]; messageIds: string[] } {
    return { chatIds: [...this.chatIds], messageIds: [...this.messageIds] };
  }

  /** Сносит накопленное. Возвращает число удалённых строк — для проверок уборки. */
  flush(): { chats: number; messages: number; members: number } {
    const removed = { chats: 0, messages: 0, members: 0 };
    const chatIds = [...this.chatIds];
    const messageIds = [...this.messageIds];
    this.chatIds.clear();
    this.messageIds.clear();

    if (!sqlAvailable() || (chatIds.length === 0 && messageIds.length === 0)) {
      return removed;
    }

    const statements: string[] = [];
    // Позиции операторов нужны, чтобы разложить числа `DELETE n` по счётчикам:
    // набор операторов зависит от того, что именно накопилось за прогон.
    const indexes = { byId: -1, byChat: -1, members: -1, chats: -1 };
    let next = 0;
    if (messageIds.length > 0) {
      indexes.byId = next++;
      statements.push(`DELETE FROM "Message" WHERE id IN (${messageIds.map(literal).join(', ')});`);
    }
    if (chatIds.length > 0) {
      const scope = chatIds.map(literal).join(', ');
      // Порядок важен: сначала зависимые строки, затем сам чат (каскад в схеме есть,
      // но явные DELETE дают точные числа для проверки «до/после»).
      indexes.byChat = next++;
      statements.push(`DELETE FROM "Message" WHERE "chatId" IN (${scope});`);
      indexes.members = next++;
      statements.push(`DELETE FROM "ChatMember" WHERE "chatId" IN (${scope});`);
      indexes.chats = next++;
      statements.push(`DELETE FROM "Chat" WHERE id IN (${scope});`);
    }

    try {
      const counts = deleteCounts(runSqlFile(statements.join('\n')));
      const at = (index: number): number => (index >= 0 ? counts[index] ?? 0 : 0);
      removed.messages = at(indexes.byId) + at(indexes.byChat);
      removed.members = at(indexes.members);
      removed.chats = at(indexes.chats);
    } catch (error) {
      // Уборка не должна превращать падение теста в каскад ошибок: сообщаем и идём дальше.
      console.warn(
        `[chat] уборка не удалась: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }

    return removed;
  }
}

type TrackerGlobal = typeof globalThis & { [CHAT_TRACKER_SLOT]?: ChatTracker };

const CHAT_TRACKER_SLOT = Symbol.for('cleaning-ops.e2e.chatTracker');

/** Единственный на процесс экземпляр трекера (см. комментарий о двух путях импорта). */
function sharedTracker(): ChatTracker {
  const global = globalThis as TrackerGlobal;
  if (!global[CHAT_TRACKER_SLOT]) {
    global[CHAT_TRACKER_SLOT] = new ChatTracker();
  }
  return global[CHAT_TRACKER_SLOT];
}

export const chatTracker: ChatTracker = sharedTracker();

/** Безопасный `flush` для `afterEach`: проблемы уборки печатаются, но не бросаются. */
export function flushChatData(): void {
  sharedTracker().flush();
}

// ---------------------------------------------------------------------------
// Сценарии
// ---------------------------------------------------------------------------

/**
 * Создаёт direct-чат и, если он действительно новый, ставит его на уборку.
 *
 * Почему с проверкой «новизны». `POST /chats` для direct идемпотентен: для пары
 * ADMIN↔OPERATOR он вернёт существующий чат, если такой уже создан другим набором
 * (например, ручным `tools/verify-ws.js` или параллельным UI-прогоном). Удалять чужой
 * чат нельзя, поэтому на уборку идёт только чат, созданный после старта прогона
 * (`createdAt` не старше 10 с — запас на расхождение часов процесса и сервиса).
 */
export async function trackDirectChat(
  request: APIRequestContext,
  participantId: string,
  options: ChatApiOptions = {},
): Promise<ChatDetail> {
  const before = Date.now();
  const chat = await createDirectChat(request, participantId, options);
  const createdAt = Date.parse(chat.createdAt);
  if (Number.isFinite(createdAt) && createdAt >= before - 10_000) {
    chatTracker.chat(chat.id);
  } else {
    console.warn(
      `[chat] direct-чат ${chat.id} существовал до прогона (${chat.createdAt}) — уборка его не тронет`,
    );
  }
  return chat;
}

/** Создаёт system-чат (всегда новый) и сразу ставит его на уборку. */
export async function trackSystemChat(
  request: APIRequestContext,
  input: Parameters<typeof createSystemChat>[1] = {},
  options: ChatApiOptions = {},
): Promise<ChatDetail> {
  const chat = await createSystemChat(request, input, options);
  chatTracker.chat(chat.id);
  return chat;
}

/** Создаёт ticket-чат (всегда новый: ticketId уникален) и ставит его на уборку. */
export async function trackTicketChat(
  request: APIRequestContext,
  ticketId: string,
  options: ChatApiOptions & { participantIds?: string[]; title?: string } = {},
): Promise<ChatDetail> {
  const chat = await createTicketChat(request, ticketId, options);
  chatTracker.chat(chat.id);
  return chat;
}
