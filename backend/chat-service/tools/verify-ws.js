/**
 * Живая проверка WebSocket-контракта chat-service (namespace /chat).
 *
 * Запуск при поднятом сервисе на :3009 и auth-service на :3001:
 *   node tools/verify-ws.js [chatId [messageId]]
 *
 * Без аргументов скрипт создаёт direct-чат ADMIN ↔ OPERATOR сам через REST.
 * Проверяет: авторизацию handshake, message:send → message:new у второго
 * участника и ack отправителю, message:read → message:read у автора.
 */
const { io } = require('socket.io-client');

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3001';
const CHAT_URL = process.env.CHAT_SERVICE_URL ?? 'http://127.0.0.1:3009';

const results = [];
function check(name, passed, details) {
  results.push({ name, passed });
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
}

async function login(email, password) {
  const response = await fetch(`${AUTH_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`login ${email}: ${response.status}`);
  }
  return payload.accessToken;
}

async function me(token) {
  const response = await fetch(`${AUTH_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  if (!response.ok || !payload?.id) {
    throw new Error(`me: ${response.status}`);
  }
  return payload.id;
}

async function api(method, path, token, body) {
  const response = await fetch(`${CHAT_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

/**
 * Подключение с ожиданием результата авторизации.
 *
 * Важно: сервер сначала принимает handshake, а затем отклоняет соединение
 * (handleConnection асинхронный), поэтому недостаточно дождаться события connect —
 * надо убедиться, что соединение не было разорвано сразу после установления.
 */
async function connect(token) {
  const socket = io(`${CHAT_URL}/chat`, {
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 5000,
  });
  const connected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.on('disconnect', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  if (!connected) {
    socket.close();
    return null;
  }
  // Пауза на «догоняющий» disconnect от сервера (неавторизованное соединение).
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!socket.connected) {
    socket.close();
    return null;
  }
  return socket;
}

function waitFor(socket, event, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Ждёт первое непрочитанное сообщение из буфера (без гонки слушателей). */
async function waitBuffered(buffer, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (buffer.length > 0) {
      return buffer.shift();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function main() {
  const adminToken = await login('admin', 'admin123');
  const operatorToken = await login('operator', 'oper123');
  const adminId = await me(adminToken);
  const operatorId = await me(operatorToken);

  let chatId = process.argv[2];
  if (!chatId) {
    const created = await api('POST', '/api/chat/chats', adminToken, {
      type: 'direct',
      participantIds: [operatorId],
    });
    chatId = created.payload?.id;
  }
  if (!chatId) {
    throw new Error('не удалось получить chatId');
  }
  console.log(`chatId=${chatId} admin=${adminId} operator=${operatorId}`);

  // 1. Соединение без токена отклоняется сервером.
  const anonymous = await connect('');
  check('соединение без токена отклонено', anonymous === null);

  // 2. Оба участника подключаются с валидным токеном.
  const adminSocket = await connect(adminToken);
  const operatorSocket = await connect(operatorToken);
  check('ADMIN подключился по auth.token', adminSocket !== null);
  check('OPERATOR подключился по auth.token', operatorSocket !== null);
  if (!adminSocket || !operatorSocket) {
    throw new Error('без двух соединений проверять нечего');
  }

  // Буферы message:new вместо once(): за время проверки сокет получает несколько
  // сообщений, и одиночный once() перехватывал бы «не то» событие.
  const adminInbox = [];
  const operatorInbox = [];
  adminSocket.on('message:new', (payload) => adminInbox.push(payload));
  operatorSocket.on('message:new', (payload) => operatorInbox.push(payload));

  // 3. message:send от ADMIN → ack автору, message:new у OPERATOR.
  const ack = await adminSocket.timeout(6000).emitWithAck('message:send', {
    chatId,
    text: 'WS: сообщение от ADMIN',
  });
  check('ack отправителю: ok=true', ack?.ok === true, JSON.stringify(ack)?.slice(0, 120));
  const delivered = await waitBuffered(operatorInbox);
  check(
    'message:new пришёл OPERATOR-у',
    delivered?.id === ack?.message?.id && delivered?.chatId === chatId,
    `id=${delivered?.id}`,
  );

  // 4. Ответ OPERATOR доставляет ADMIN-у, отправитель не получает своё сообщение.
  const operatorAck = await operatorSocket.timeout(6000).emitWithAck('message:send', {
    chatId,
    text: 'WS: ответ OPERATOR',
  });
  const reply = await waitBuffered(adminInbox);
  check('ответ OPERATOR доставлен ADMIN-у', reply?.id === operatorAck?.message?.id);
  check(
    'отправитель не получает эхо своего сообщения',
    adminInbox.length === 0 && operatorInbox.length === 0,
    `adminInbox=${adminInbox.length} operatorInbox=${operatorInbox.length}`,
  );

  // 5. message:read от ADMIN по сообщению OPERATOR → message:read у автора.
  const readAtOperator = waitFor(operatorSocket, 'message:read');
  const readAck = await adminSocket.timeout(6000).emitWithAck('message:read', {
    chatId,
    lastMessageId: operatorAck.message.id,
  });
  check('ack отметки прочтения: ok=true', readAck?.ok === true);
  const readEvent = await readAtOperator;
  check(
    'message:read пришёл автору (OPERATOR)',
    readEvent?.messageId === operatorAck.message.id && readEvent?.readBy === adminId,
    `readBy=${readEvent?.readBy}`,
  );

  // 6. Событие от не-участника отклоняется (403 в ack).
  const foreignChat = await api('POST', '/api/chat/chats', adminToken, {
    type: 'system',
    title: 'WS-проверка доступа',
  });
  const systemChatId = foreignChat.payload?.id;
  if (systemChatId) {
    const denied = await operatorSocket.timeout(6000).emitWithAck('message:send', {
      chatId: systemChatId,
      text: 'чужая отправка',
    });
    check(
      'message:send в чужой чат → ok=false, status=403',
      denied?.ok === false && denied?.status === 403,
      JSON.stringify(denied),
    );
  }

  adminSocket.close();
  operatorSocket.close();
  console.log(`\nСозданные чаты: ${chatId}${process.argv[2] ? '' : ''}${foreignChat?.payload?.id ? `, ${foreignChat.payload.id}` : ''}`);

  const failed = results.filter((item) => !item.passed);
  console.log(`Итог: ${results.length - failed.length}/${results.length} проверок пройдено`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
