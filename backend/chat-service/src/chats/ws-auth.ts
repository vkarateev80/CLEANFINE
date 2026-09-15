import { JwtService } from '@nestjs/jwt';
import type { ChatType } from '@cleaning-ops/shared/types/chat';
import type { Role } from '@cleaning-ops/shared/types/roles';
import type { AuthUser } from '../auth/guards/roles.guard';
import { MAX_ATTACHMENTS, MAX_MESSAGE_LENGTH } from './dto/chat.dto';

/** Имя namespace WebSocket-шлюза. */
export const CHAT_NAMESPACE = 'chat';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

/** Результат проверки токена соединения. */
export interface WsAuthResult {
  user: AuthUser;
}

/**
 * Авторизация WebSocket-handshake.
 *
 * Выбран `auth.token` (а не `?token=` в query):
 *  - query-строка целиком попадает в логи прокси/сервера, а access-токен — это
 *    полноценный доступ к API на время жизни токена;
 *  - Socket.IO передаёт auth-payload в теле handshake-запроса, что и есть
 *    штатное место для секрета.
 * `?token=` поддерживается как запасной путь: мобильный WebView иногда не умеет
 * передать auth-объект — это осознанная совместимость, но основной путь — auth.token.
 */
export async function authenticateSocket(
  jwt: JwtService,
  handshake: { auth?: unknown; query?: Record<string, unknown> },
): Promise<WsAuthResult | null> {
  const token = extractToken(handshake);
  if (!token) {
    return null;
  }
  try {
    const payload = await jwt.verifyAsync<JwtPayload>(token);
    if (!payload?.sub) {
      return null;
    }
    return {
      user: {
        id: payload.sub,
        email: payload.email ?? '',
        role: (payload.role ?? 'OPERATOR') as Role,
        fullName: '',
      },
    };
  } catch {
    // Истёкший/подделанный токен — соединение не устанавливаем.
    return null;
  }
}

function extractToken(handshake: { auth?: unknown; query?: Record<string, unknown> }): string | null {
  if (typeof handshake.auth === 'object' && handshake.auth !== null) {
    const token = (handshake.auth as { token?: unknown }).token;
    if (typeof token === 'string' && token !== '') {
      return token;
    }
  }
  const queryToken = handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken !== '') {
    return queryToken;
  }
  return null;
}

export interface IncomingMessagePayload {
  chatId?: unknown;
  text?: unknown;
  attachmentIds?: unknown;
}

export interface IncomingReadPayload {
  chatId?: unknown;
  lastMessageId?: unknown;
}

export interface ParsedSend {
  chatId: string;
  text: string;
  attachmentIds: string[];
}

export interface ParsedRead {
  chatId: string;
  lastMessageId: string;
}

/**
 * Ручная валидация WS-payload: Nest ValidationPipe работает только в
 * HTTP-конвейере, поэтому те же правила (непустой текст, ограничение длины и
 * числа вложений) проверяются здесь — иначе через сокет можно было бы обойти
 * ограничения REST-фолбэка.
 */
export function parseSendPayload(
  payload: IncomingMessagePayload,
): { ok: true; value: ParsedSend } | { ok: false; error: string } {
  const chatId = typeof payload?.chatId === 'string' ? payload.chatId : '';
  if (chatId === '') {
    return { ok: false, error: 'Укажите chatId' };
  }
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (text === '') {
    return { ok: false, error: 'Сообщение не может быть пустым' };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов` };
  }
  const rawAttachments = payload?.attachmentIds;
  let attachmentIds: string[] = [];
  if (rawAttachments !== undefined && rawAttachments !== null) {
    if (!Array.isArray(rawAttachments) || rawAttachments.some((id) => typeof id !== 'string')) {
      return { ok: false, error: 'attachmentIds должен быть массивом строк' };
    }
    if (rawAttachments.length > MAX_ATTACHMENTS) {
      return { ok: false, error: `Слишком много вложений (максимум ${MAX_ATTACHMENTS})` };
    }
    attachmentIds = rawAttachments as string[];
  }
  return { ok: true, value: { chatId, text, attachmentIds } };
}

export function parseReadPayload(
  payload: IncomingReadPayload,
): { ok: true; value: ParsedRead } | { ok: false; error: string } {
  const chatId = typeof payload?.chatId === 'string' ? payload.chatId : '';
  const lastMessageId =
    typeof payload?.lastMessageId === 'string' ? payload.lastMessageId : '';
  if (chatId === '' || lastMessageId === '') {
    return { ok: false, error: 'Укажите chatId и lastMessageId' };
  }
  return { ok: true, value: { chatId, lastMessageId } };
}

/** Заголовок push/превью для события message:new. */
export interface MessageEventPayload {
  message: {
    id: string;
    chatId: string;
    authorId: string;
    text: string;
    attachmentIds: string[];
    createdAt: string;
  };
  type: ChatType | string;
}

export interface ReadEventPayload {
  chatId: string;
  messageId: string;
  readBy: string;
  readAt: string;
}
