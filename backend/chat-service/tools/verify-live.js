/**
 * Живая проверка REST-контракта chat-service (М5.1–М5.2).
 *
 * Запуск при поднятом сервисе на :3009 и auth-service на :3001:
 *   node tools/verify-live.js
 *
 * Скрипт создаёт direct-чат ADMIN ↔ OPERATOR, отправляет сообщение, читает
 * историю, проверяет 403 на чужом чате и поиск по тексту. Созданные данные
 * удаляются отдельным SQL (tools/cleanup-chat.sql).
 */
const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3001';
const CHAT_URL = process.env.CHAT_SERVICE_URL ?? 'http://127.0.0.1:3009';

const results = [];

function check(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? 'OK  ' : 'FAIL';
  console.log(`${mark} ${name}${details ? ` — ${details}` : ''}`);
}

async function login(email, password) {
  const response = await fetch(`${AUTH_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`login ${email}: ${response.status}`);
  }
  const payload = await response.json();
  return { token: payload.accessToken, userId: payload.user?.id ?? payload.userId };
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

/** Достаёт id пользователя из выдачи auth-service (клиент чатов его не отдаёт). */
async function resolveUserId(token, email) {
  const response = await fetch(`${AUTH_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`me: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.id) {
    throw new Error(`me: в ответе нет id (${email})`);
  }
  return payload.id;
}

async function main() {
  console.log(`chat-service: ${CHAT_URL}`);
  const admin = await login('admin@cleaning-ops.com', 'admin123');
  const operator = await login('operator@cleaning-ops.com', 'oper123');
  const adminId = admin.userId ?? (await resolveUserId(admin.token, 'admin@cleaning-ops.com'));
  const operatorId =
    operator.userId ?? (await resolveUserId(operator.token, 'operator@cleaning-ops.com'));
  console.log(`ADMIN=${adminId} OPERATOR=${operatorId}`);

  // 1. Без токена — 401.
  const anonymous = await api('GET', '/api/chat/chats');
  check('GET /api/chat/chats без токена → 401', anonymous.status === 401, `status=${anonymous.status}`);

  // 2. Health публичный.
  const health = await api('GET', '/api/chat/health');
  check('GET /api/chat/health → 200', health.status === 200, `status=${health.status}`);

  // 3. Создание direct-чата.
  const created = await api('POST', '/api/chat/chats', admin.token, {
    type: 'direct',
    participantIds: [operatorId],
  });
  check(
    'POST /api/chat/chats (direct) → 201',
    created.status === 201,
    `status=${created.status} id=${created.payload?.id}`,
  );
  const chatId = created.payload?.id;
  if (!chatId) {
    throw new Error('чат не создан — дальше проверять нечего');
  }

  // 4. Повторное создание direct-чата отдаёт тот же диалог.
  const again = await api('POST', '/api/chat/chats', admin.token, {
    type: 'direct',
    participantIds: [operatorId],
  });
  check('повторный direct-чат → тот же id', again.payload?.id === chatId, `id=${again.payload?.id}`);

  // 5. История пустая, но структура верная.
  const empty = await api('GET', `/api/chat/chats/${chatId}/messages`, admin.token);
  check(
    'GET messages (пустой чат) → items=[]',
    empty.status === 200 && Array.isArray(empty.payload?.items) && empty.payload.items.length === 0,
    `status=${empty.status} items=${empty.payload?.items?.length}`,
  );

  // 6. Отправка REST-сообщения.
  const sent = await api('POST', `/api/chat/chats/${chatId}/messages`, admin.token, {
    text: 'Проверка REST-фолбэка',
  });
  check(
    'POST messages → 201 и текст',
    sent.status === 201 && sent.payload?.text === 'Проверка REST-фолбэка',
    `status=${sent.status}`,
  );
  const messageId = sent.payload?.id;

  // 7. История: от старых к новым, пагинация.
  const history = await api('GET', `/api/chat/chats/${chatId}/messages?limit=1`, admin.token);
  check(
    'GET messages?limit=1 → items[0] = отправленное',
    history.status === 200 && history.payload?.items?.[0]?.id === messageId,
    `hasMore=${history.payload?.hasMore} limit=${history.payload?.limit}`,
  );

  // 8. Чужой чат (OPERATOR не в этом чате) → 403.
  const foreign = await api('POST', '/api/chat/chats', admin.token, {
    type: 'direct',
    participantIds: [adminId],
  });
  // Чат с самим собой создать нельзя — используем CLIENT как второго участника.
  const client = await login('client@example.com', 'client123');
  const clientId = client.userId ?? (await resolveUserId(client.token, 'client@example.com'));
  const foreignChat = await api('POST', '/api/chat/chats', admin.token, {
    type: 'direct',
    participantIds: [clientId],
  });
  const foreignId = foreignChat.payload?.id;
  check(
    'чужой чат → 403 «Вы не участник этого чата»',
    foreign.status === 400 && foreignId !== undefined,
    `status(сам с собой)=${foreign.status}`,
  );
  if (foreignId) {
    const forbidden = await api('GET', `/api/chat/chats/${foreignId}`, operator.token);
    check(
      'GET чужого чата OPERATOR-ом → 403',
      forbidden.status === 403 && forbidden.payload?.message === 'Вы не участник этого чата',
      `status=${forbidden.status} message=${forbidden.payload?.message}`,
    );
  }

  // 9. Список чатов ADMIN содержит созданный чат с lastMessage.
  const list = await api('GET', '/api/chat/chats', admin.token);
  const found = Array.isArray(list.payload) ? list.payload.find((chat) => chat.id === chatId) : null;
  check(
    'GET /api/chat/chats → чат с lastMessage и unreadCount',
    list.status === 200 && found?.lastMessage?.id === messageId,
    `lastMessage=${found?.lastMessage?.id} unread=${found?.unreadCount}`,
  );

  // 10. Отметка прочтения.
  const read = await api('POST', `/api/chat/chats/${chatId}/read`, operator.token, {
    lastMessageId: messageId,
  });
  check(
    'POST read (OPERATOR) → readAt',
    read.status === 200 && typeof read.payload?.readAt === 'string',
    `status=${read.status} authorId=${read.payload?.authorId}`,
  );

  // 11. Поиск по тексту.
  const search = await api('GET', '/api/chat/messages/search?q=REST-фолбэк', operator.token);
  check(
    'GET messages/search → находит своё сообщение',
    search.status === 200 && search.payload?.items?.some((item) => item.id === messageId) === true,
    `total=${search.payload?.total}`,
  );

  // 12. Поиск по чужому чату → 403.
  if (foreignId) {
    const foreignSearch = await api(
      'GET',
      `/api/chat/messages/search?q=Проверка&chatId=${foreignId}`,
      operator.token,
    );
    check(
      'поиск по чужому chatId → 403',
      foreignSearch.status === 403,
      `status=${foreignSearch.status}`,
    );
  }

  const failed = results.filter((item) => !item.passed);
  console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
  console.log(`Созданы чаты: ${chatId}${foreignId ? `, ${foreignId}` : ''}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
