import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  AUTH_URL,
  deviceToken,
  expectStatus,
  flushOperationsData,
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  NOTIFICATIONS_URL,
  notifications,
  notificationsPage,
  operationsTracker,
  registerDevice,
  registerDeviceOrFail,
  sweepOrphanNotifications,
  TICKETS_URL,
  trackDevice,
  updateNotificationSettings,
  waitForNotification,
  type AppNotification,
  type Device,
  type NotificationSettings,
  type NotificationsPage,
} from '../../helpers/operations';
import { authHeader, bodyText, loginAs, runTag } from '../../helpers/core';

/**
 * М3.8 — e2e notification-service (устройства и in-app уведомления).
 *
 * Требует запущенного стенда:
 *  - auth-service         :3001 (E2E_API_URL)          — access-токены;
 *  - notification-service :3006 (E2E_NOTIFICATION_URL) — устройства, in-app, настройки;
 *  - ticket-service       :3005 (E2E_TICKET_URL)       — нужен только чтобы создать
 *    настоящее уведомление (событие ticket.assigned/ticket.emergency идёт через RabbitMQ);
 *  - RabbitMQ :5672 + PostgreSQL (cleaning-ops-postgres, только уборка).
 *
 * ПОЧЕМУ у каждого теста свой пользователь. `GET /api/notifications` отдаёт личные
 * уведомления, а на стенде у ролей-фикстур их накопилось много (эскалации, выходы из
 * геозон прошлых прогонов). Чтобы проверки «первое уведомление — прочитано», «unreadCount
 * уменьшился», «unreadOnly не содержит прочитанное» были точными, тесты создают нового
 * оператора через auth-service (`POST /api/users`, ADMIN) и работают только с его данными.
 * Пользователь остаётся на стенде (auth-набор М1.8 делает так же) — это не мешает
 * оперативным проверкам, потому что у него нет устройств после уборки.
 *
 * Идемпотентность: устройства удаляются по токену, уведомления — по id, заявки — по id
 * (SQL там, где API удаления нет) в afterEach через operationsTracker.
 */

test.describe.configure({ timeout: 180_000 });

/** Объект core для аварийных заявок: уникален на прогон, уборка идёт по нему. */
const objectId = `00000000-0000-4000-8000-${runTag()
  .replace(/[^0-9a-f]/g, '')
  .slice(-12)
  .padStart(12, '0')}`;

test.afterEach(() => {
  flushOperationsData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений: выполняется один раз на процесс
  // и безопасна, если docker недоступен.
  sweepOrphanNotifications();
});

interface FreshUser {
  id: string;
  token: string;
  email: string;
}

/**
 * Новый активный OPERATOR через auth-service: у него заведомо нет уведомлений,
 * устройств и настроек, поэтому все счётчики детерминированы.
 * Пользователь ставится на уборку — его устройства и уведомления сносит afterEach,
 * и он не остаётся «подписчиком» broadcast-рассылок для других наборов.
 */
async function createFreshOperator(request: APIRequestContext): Promise<FreshUser> {
  const admin = await loginAs(request, 'ADMIN');
  const email = `e2e-m38-${runTag()}@cleaning-ops.com`;
  const password = 'e2e-m38-pass';

  const created = await request.post(`${AUTH_URL}/api/users`, {
    headers: authHeader(admin),
    data: { email, password, fullName: `E2E М3.8 ${email}`, role: 'OPERATOR' },
  });
  expect(created.status(), `создание тестового оператора: ${await bodyText(created)}`).toBe(201);
  const user = (await created.json()) as { id: string };
  expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  operationsTracker.userRow(user.id);

  const login = await request.post(`${AUTH_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(login.status(), `логин тестового оператора: ${await bodyText(login)}`).toBe(201);
  const token = ((await login.json()) as { accessToken: string }).accessToken;

  return { id: user.id, token, email };
}

/** Все id уведомлений пользователя в пределах первой страницы (свежие — первыми). */
async function notificationIds(request: APIRequestContext, token: string): Promise<string[]> {
  const page = await notificationsPage(request, { limit: 100 }, { token });
  return page.items.map((item) => item.id);
}

/** Регистрирует устройство теста и возвращает токен (уборка — в afterEach). */
async function withDevice(
  request: APIRequestContext,
  user: FreshUser,
  label: string,
): Promise<string> {
  const token = deviceToken(label);
  await trackDevice(request, { token, platform: 'android' }, { token: user.token });
  return token;
}

/**
 * Настоящее уведомление без SOS-рассылки: ADMIN создаёт заявку сразу с исполнителем —
 * ticket-service публикует ticket.assigned, и notification-service адресно уведомляет
 * этого оператора (шаблон NEW_TICKET). Так свежий пользователь получает ровно одно
 * уведомление, и все счётчики детерминированы.
 */
async function trackFreshAssignment(
  request: APIRequestContext,
  user: FreshUser,
): Promise<{ id: string }> {
  const admin = await loginAs(request, 'ADMIN');
  const res = await request.post(`${TICKETS_URL}/api/tickets`, {
    headers: authHeader(admin),
    data: {
      type: 'planned',
      objectId,
      assigneeId: user.id,
      description: `E2E уведомление ${runTag()}`,
    },
  });
  expect(res.status(), `заявка для уведомления: ${await bodyText(res)}`).toBe(201);
  const ticket = (await res.json()) as { id: string; objectId: string };
  operationsTracker.ticket(ticket.id);
  operationsTracker.object(ticket.objectId);
  return ticket;
}

/**
 * Базовая линия пользователя (total/unread) — «до» для проверок «прирост ровно +1».
 * Посторонние записи (broadcast SOS прошлых прогонов) учтены в линии, поэтому
 * проверки остаются точными и не зависят от состояния стенда.
 */
async function notificationBaseline(
  request: APIRequestContext,
  token: string,
): Promise<{ total: number; unread: number }> {
  const page = await notificationsPage(request, { limit: 100 }, { token });
  return { total: page.total, unread: page.unreadCount };
}

// ---------------------------------------------------------------------------
// Устройства
// ---------------------------------------------------------------------------

test.describe('Notifications: регистрация устройства', () => {
  test('upsert по токену: повторная регистрация не плодит дубликаты', async ({ request }) => {
    const user = await createFreshOperator(request);
    const token = deviceToken('upsert');

    const first = await trackDevice(request, { token, platform: 'android' }, { token: user.token });
    expect(first.userId).toBe(user.id);
    expect(first.isActive).toBe(true);
    expect(first.platform).toBe('android');

    // Тот же токен с другой платформой — та же запись (upsert), а не вторая.
    const second = await registerDeviceOrFail(
      request,
      { token, platform: 'ios' },
      { token: user.token },
    );
    expect(second.id).toBe(first.id);
    expect(second.platform).toBe('ios');

    // У каждого пользователя своя запись: чужой токен не подменяет устройство теста.
    const admin = await loginAs(request, 'ADMIN');
    const adminDevice = await trackDevice(
      request,
      { token: deviceToken('upsert-admin') },
      { token: admin },
    );
    expect(adminDevice.id).not.toBe(first.id);
  });

  test('невалидная платформа → 400, без токена → 401', async ({ request }) => {
    const user = await createFreshOperator(request);

    const badToken = deviceToken('bad');
    operationsTracker.device(badToken);
    const badPlatform = await registerDevice(
      request,
      { token: badToken, platform: 'symbian' as Device['platform'] },
      { token: user.token },
    );
    await expectStatus(badPlatform, 400, 'недопустимая платформа');
    expect(await bodyText(badPlatform)).toContain('Недопустимая платформа');

    // Без токена — «голый» запрос: хелпер registerDevice по умолчанию подставляет токен ADMIN.
    // Токен всё равно ставим на уборку: сервис под 401 ничего не создаёт, но страховка дешевле.
    const anonToken = deviceToken('anon');
    operationsTracker.device(anonToken);
    const noToken = await request.post(`${NOTIFICATIONS_URL}/api/notifications/device`, {
      data: { token: anonToken, platform: 'android' },
    });
    await expectStatus(noToken, 401, 'регистрация без токена');

    const empty = await registerDevice(request, { token: '' }, { token: user.token });
    await expectStatus(empty, 400, 'пустой токен устройства');
  });
});

// ---------------------------------------------------------------------------
// In-app список и отметка прочитанного
// ---------------------------------------------------------------------------

test.describe('Notifications: in-app список', () => {
  test('пагинация: page/limit, лимит 100, невалидные параметры → 400', async ({ request }) => {
    const user = await createFreshOperator(request);

    // Базовая линия: у свежего пользователя записей нет. Если на стенде в этот момент
    // осталось чужое broadcast-уведомление от прошлого прогона, тест всё равно проверяет
    // прирост, а не абсолютный ноль.
    const baseline = await notificationsPage(request, { limit: 10 }, { token: user.token });
    expect(baseline.total).toBe(0);
    expect(baseline.items).toEqual([]);
    expect(baseline.unreadCount).toBe(0);
    expect(baseline.page).toBe(1);
    expect(baseline.limit).toBe(10);

    // Создаём настоящие уведомления: ADMIN создаёт заявку сразу с исполнителем, и
    // ticket-service публикует ДВА события — ticket.created и ticket.assigned; каждое
    // превращается в in-app запись NEW_TICKET (устройство не нужно: in-app пишется
    // всегда, push — только при активном токене). Поэтому считаем записи «свои» —
    // по userId из ответа, а не абсолютный total.
    const ticket = await trackFreshAssignment(request, user);
    await waitForNotification(
      request,
      { type: 'NEW_TICKET', payloadKey: 'ticketId', payloadValue: ticket.id },
      { token: user.token, timeout: 20_000 },
    );

    const mine = (page: NotificationsPage): AppNotification[] =>
      page.items.filter((item) => item.userId === user.id);
    const all = await notificationsPage(request, { limit: 100 }, { token: user.token });

    // Пагинация: при limit=1 первая страница — свежая запись, вторая (если записей две) — другая.
    const single = await notificationsPage(request, { limit: 1, page: 1 }, { token: user.token });
    expect(single.items).toHaveLength(1);
    expect(single.items[0].userId).toBe(user.id);
    expect(single.total).toBe(mine(all).length);
    expect(single.unreadCount).toBe(single.total);

    const beyond = await notificationsPage(request, { limit: 1, page: 2 }, { token: user.token });
    if (single.total > 1) {
      expect(beyond.items).toHaveLength(1);
      expect(beyond.items[0].id).not.toBe(single.items[0].id);
    } else {
      expect(beyond.items).toEqual([]);
    }

    // Значения по умолчанию (page=1, limit=20) проверяем на роли-фикстуре, где записей больше.
    const operator = await loginAs(request, 'OPERATOR');
    const operatorPage = await notificationsPage(request, { page: 1 }, { token: operator });
    expect(operatorPage.page).toBe(1);
    expect(operatorPage.limit).toBe(20);
    expect(operatorPage.items.length).toBeLessThanOrEqual(20);
    expect(operatorPage.unreadCount).toBeLessThanOrEqual(operatorPage.total);

    await expectStatus(
      await listNotifications(request, { limit: 1000 }, { token: operator }),
      400,
      'limit больше 100',
    );
    await expectStatus(
      await listNotifications(request, { page: 0 }, { token: operator }),
      400,
      'page меньше 1',
    );
    // Без токена — «голый» запрос: хелпер по умолчанию подставляет токен ADMIN.
    await expectStatus(
      await request.get(`${NOTIFICATIONS_URL}/api/notifications`),
      401,
      'список без токена',
    );
  });

  test('unreadOnly и unreadCount: прочитанное уходит из непрочитанных', async ({ request }) => {
    const user = await createFreshOperator(request);
    await withDevice(request, user, 'unread');
    const baseline = await notificationBaseline(request, user.token);

    // Настоящие уведомления через RabbitMQ: ADMIN создаёт заявку с исполнителем, поэтому
    // приходят И ticket.created, И ticket.assigned (две записи NEW_TICKET).
    const ticket = await trackFreshAssignment(request, user);

    const notification = await waitForNotification(
      request,
      { type: 'NEW_TICKET', payloadKey: 'ticketId', payloadValue: ticket.id },
      { token: user.token, timeout: 20_000 },
    );
    expect(notification.userId).toBe(user.id);
    expect(notification.readAt).toBeNull();
    expect(notification.title).toContain('Новая задача');
    expect(notification.body).toContain('Вам назначена задача');

    const mineAll = (page: NotificationsPage): AppNotification[] =>
      page.items.filter((item) => item.userId === user.id);

    const allPage = await notificationsPage(request, { limit: 100 }, { token: user.token });
    const assignedToMe = mineAll(allPage);
    expect(assignedToMe.length).toBeGreaterThanOrEqual(1);
    expect(assignedToMe.length, 'прирост ровно на уведомления этой заявки').toBe(
      allPage.total - baseline.total,
    );
    // Каждая запись этой заявки принадлежит нашему пользователю и непрочитана.
    for (const item of assignedToMe) {
      expect(item.readAt).toBeNull();
      expect(item.payload.ticketId).toBe(ticket.id);
    }
    const unreadBefore = allPage.unreadCount;

    const unreadPage = await notificationsPage(
      request,
      { unreadOnly: true, limit: 100 },
      { token: user.token },
    );
    expect(unreadPage.unreadCount).toBe(unreadBefore);
    expect(unreadPage.items.map((item) => item.id)).toContain(notification.id);
    // unreadOnly=true не отдаёт прочитанные: все записи страницы непрочитаны.
    expect(unreadPage.items.every((item) => item.readAt === null)).toBe(true);

    // Отмечаем одну запись прочитанной: unreadCount падает на единицу, total не меняется.
    const read = await markNotificationRead(request, notification.id, { token: user.token });
    expect(read.status(), await bodyText(read)).toBe(200);
    expect(((await read.json()) as { readAt: string | null }).readAt).toBeTruthy();

    const afterRead = await notificationsPage(request, { limit: 100 }, { token: user.token });
    expect(afterRead.unreadCount).toBe(unreadBefore - 1);
    expect(afterRead.total, 'прочитанное остаётся в общем списке').toBe(allPage.total);
    expect(await notificationIds(request, user.token)).toContain(notification.id);

    const unreadAfter = await notificationsPage(
      request,
      { unreadOnly: true, limit: 100 },
      { token: user.token },
    );
    expect(unreadAfter.items.map((item) => item.id)).not.toContain(notification.id);
    expect(unreadAfter.items.every((item) => item.readAt === null)).toBe(true);
  });

  test('PATCH /:id/read идемпотентен; чужой id → 404', async ({ request }) => {
    const user = await createFreshOperator(request);
    await withDevice(request, user, 'read');

    const ticket = await trackFreshAssignment(request, user);

    const notification = await waitForNotification(
      request,
      { type: 'NEW_TICKET', payloadKey: 'ticketId', payloadValue: ticket.id },
      { token: user.token, timeout: 20_000 },
    );

    const first = await markNotificationRead(request, notification.id, { token: user.token });
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as { readAt: string | null };
    expect(firstBody.readAt).toBeTruthy();

    // Повтор возвращает ту же запись с тем же readAt — идемпотентно.
    const second = await markNotificationRead(request, notification.id, { token: user.token });
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { readAt: string | null };
    expect(secondBody.readAt).toBe(firstBody.readAt);

    // Чужое уведомление: 404 (а не 403) — сервис не подтверждает существование записи.
    const other = await createFreshOperator(request);
    const foreign = await markNotificationRead(request, notification.id, { token: other.token });
    await expectStatus(foreign, 404, 'отметка чужого уведомления');
    expect(await bodyText(foreign)).toContain('Уведомление не найдено');

    // Несуществующий id — тоже 404; без токена — 401.
    await expectStatus(
      await markNotificationRead(request, '00000000-0000-4000-8000-0000000000ff', {
        token: user.token,
      }),
      404,
      'отметка несуществующего уведомления',
    );
    const anonymous = await request.patch(
      `${NOTIFICATIONS_URL}/api/notifications/${notification.id}/read`,
      {},
    );
    await expectStatus(anonymous, 401, 'отметка без токена');
  });

  test('изоляция: список всегда про своего пользователя (userId из JWT)', async ({ request }) => {
    const first = await createFreshOperator(request);
    const second = await createFreshOperator(request);
    const baseline = await notificationBaseline(request, second.token);

    // Свежий пользователь получает уведомление — проверяем, что его не видит чужой токен.
    await withDevice(request, first, 'isolation');
    const ticket = await trackFreshAssignment(request, first);
    const notification = await waitForNotification(
      request,
      { type: 'NEW_TICKET', payloadKey: 'ticketId', payloadValue: ticket.id },
      { token: first.token, timeout: 20_000 },
    );

    const firstPage = await notificationsPage(request, { limit: 100 }, { token: first.token });
    expect(firstPage.items.map((item) => item.id)).toContain(notification.id);
    expect(firstPage.items.every((item) => item.userId === first.id)).toBe(true);

    // Второй пользователь не видит чужое уведомление ни в списке, ни по прямому id.
    const secondPage = await notificationsPage(request, { limit: 100 }, { token: second.token });
    expect(secondPage.items.map((item) => item.id)).not.toContain(notification.id);
    expect(secondPage.total).toBe(baseline.total);
    await expectStatus(
      await markNotificationRead(request, notification.id, { token: second.token }),
      404,
      'чужое уведомление по прямому id',
    );

    // Роль-фикстура тоже видит только свои записи, даже если у других их много.
    const operator = await loginAs(request, 'OPERATOR');
    const operatorPage = await notificationsPage(request, { limit: 100 }, { token: operator });
    expect(new Set(operatorPage.items.map((item) => item.userId)).size).toBeLessThanOrEqual(1);
    expect(operatorPage.items.map((item) => item.id)).not.toContain(notification.id);
  });
});

// ---------------------------------------------------------------------------
// Настройки подписок
// ---------------------------------------------------------------------------

test.describe('Notifications: настройки', () => {
  test('доступные типы, 400 на недопустимый тип, сброс на пустой список', async ({ request }) => {
    const user = await createFreshOperator(request);

    const initial = await getNotificationSettings(request, { token: user.token });
    expect(initial.userId).toBe(user.id);
    expect(initial.disabledTypes).toEqual([]);
    expect(initial.availableTypes).toEqual([
      'NEW_TICKET',
      'EMERGENCY',
      'TICKET_OVERDUE',
      'GEOFENCE_EXIT',
      'MATERIAL_LOW',
      // SCHEDULE_MISSED добавлен в NOTIFICATION_TYPES вместе с М4.5
      // (schedule.missed_checkin → шаблон «Неявка на смену»), CHAT_MESSAGE — вместе
      // с М5 (push оффлайн-получателям сообщений чата). Список в спеке отставал от
      // словаря сервиса, из-за чего набор падал раньше, чем обнаруживался дефект;
      // проверка «доступны ВСЕ типы» сохранена.
      'SCHEDULE_MISSED',
      'CHAT_MESSAGE',
    ]);

    const updated = await updateNotificationSettings(request, ['MATERIAL_LOW'], {
      token: user.token,
    });
    expect(updated.status(), await bodyText(updated)).toBe(200);
    const updatedBody = (await updated.json()) as NotificationSettings;
    expect(updatedBody.disabledTypes).toEqual(['MATERIAL_LOW']);

    // Значение читается из БД, а не только из ответа.
    expect((await getNotificationSettings(request, { token: user.token })).disabledTypes).toEqual([
      'MATERIAL_LOW',
    ]);

    // Дубликаты схлопываются.
    const duplicates = await updateNotificationSettings(request, ['MATERIAL_LOW', 'MATERIAL_LOW'], {
      token: user.token,
    });
    expect(((await duplicates.json()) as NotificationSettings).disabledTypes).toEqual([
      'MATERIAL_LOW',
    ]);

    const invalid = await updateNotificationSettings(request, ['NOT_A_TYPE'], {
      token: user.token,
    });
    await expectStatus(invalid, 400, 'недопустимый тип уведомления');
    expect(await bodyText(invalid)).toContain('Недопустимый тип уведомления');

    const notArray = await notifications(request, 'patch', '/api/notifications/settings', {
      token: user.token,
      data: { disabledTypes: 'MATERIAL_LOW' },
    });
    await expectStatus(notArray, 400, 'disabledTypes не массив');

    // Возвращаем пустой список — тест не оставляет пользователя без подписок.
    const reset = await updateNotificationSettings(request, [], { token: user.token });
    expect(((await reset.json()) as NotificationSettings).disabledTypes).toEqual([]);

    // Без токена — «голый» запрос: хелпер по умолчанию подставляет токен ADMIN.
    await expectStatus(
      await request.get(`${NOTIFICATIONS_URL}/api/notifications/settings`),
      401,
      'настройки без токена',
    );
  });
});
