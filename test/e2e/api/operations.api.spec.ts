import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  AUTH_URL,
  createEmergencyTicket,
  deviceToken,
  expectStatus,
  flushOperationsData,
  GEOFENCE_INSIDE,
  GPS_URL,
  listTickets,
  markNotificationRead,
  notificationsPage,
  operationsTracker,
  sweepOrphanNotifications,
  TICKETS_URL,
  trackDevice,
  waitForNotification,
  type AppNotification,
  type TicketList,
} from '../../helpers/operations';
import { bodyText, loginAs, runTag } from '../../helpers/core';

/**
 * М3.8 — сквозная вертикаль SOS («оперативка»: ticket-service → RabbitMQ → notification-service).
 *
 * Это ключевой сценарий М3: аварийная заявка, созданная оператором, обязана превратиться
 * в in-app уведомление EMERGENCY у получателей. Путь целиком асинхронный:
 *
 *   1. OPERATOR → POST /api/tickets/emergency (ticket-service):
 *      CRITICAL-заявка + поиск ближних операторов через gps-service + публикация
 *      `ticket.emergency` в exchange cleaning-ops.events;
 *   2. notification-service (консьюмер очереди notification.ticket.emergency) читает
 *      событие, рендерит шаблон EMERGENCY и пишет in-app запись получателям:
 *      `userIds`/`assigneeId` из payload, а при их отсутствии — broadcast владельцам
 *      активных устройств (`resolveBroadcastRecipients`);
 *   3. тест ждёт уведомление опросом `GET /api/notifications?limit=100` с таймаутом
 *      (никаких фиксированных sleep) и проверяет его содержимое и отметку прочтения.
 *
 * Требует: auth :3001, ticket :3005, notification :3006, gps :3004, PostgreSQL
 * (уборка), RabbitMQ :5672 (без него событие не дойдёт — тогда тест честно красный,
 * это и есть проверка вертикали).
 *
 * ПОЧЕМУ у теста свой пользователь: broadcast идёт владельцам активных устройств,
 * поэтому «свежий оператор + своё устройство» даёт детерминированного получателя и
 * не зависит от устройств, оставленных другими наборами.
 */

test.describe.configure({ timeout: 180_000 });

/** Свой объект core на прогон: аварийные заявки убираются по нему. */
const objectId = `00000000-0000-4000-8000-${runTag().replace(/[^0-9a-f]/g, '').slice(-12).padStart(12, '0')}`;

test.afterEach(() => {
  flushOperationsData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений: выполняется один раз на процесс
  // и безопасна, если docker недоступен.
  sweepOrphanNotifications();
});

/**
 * Свежий OPERATOR через auth-service: его участие гарантирует, что уведомление
 * EMERGENCY в этом тесте принадлежит именно нам, а не прошлым прогонам.
 */
async function createFreshOperator(request: APIRequestContext): Promise<{ id: string; token: string }> {
  const admin = await loginAs(request, 'ADMIN');
  const email = `e2e-m38-sos-${runTag()}@cleaning-ops.com`;
  const password = 'e2e-m38-sos-pass';

  const created = await request.post(`${AUTH_URL}/api/users`, {
    headers: { Authorization: `Bearer ${admin}` },
    data: { email, password, fullName: `E2E SOS ${email}`, role: 'OPERATOR' },
  });
  expect(created.status(), `создание оператора SOS: ${await bodyText(created)}`).toBe(201);
  const { id } = (await created.json()) as { id: string };
  // Пользователь и всё, что на него прилетит (устройства, EMERGENCY-уведомления),
  // сносится в afterEach — иначе стенд копил бы получателей broadcast-рассылок.
  operationsTracker.userRow(id);

  const login = await request.post(`${AUTH_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(login.status(), `логин оператора SOS: ${await bodyText(login)}`).toBe(201);
  const { accessToken } = (await login.json()) as { accessToken: string };

  return { id, token: accessToken };
}

/** Точка SOS внутри тестового квадрата: gps-service ищет ближних операторов в 500 м. */
const SOS_POINT = GEOFENCE_INSIDE;

test.describe('SOS: аварийная заявка → уведомление EMERGENCY', () => {
  test('ticket-service → RabbitMQ → notification-service, уведомление видно и читается', async ({
    request,
  }) => {
    const operator = await createFreshOperator(request);

    // 1. Устройство оператора делает его получателем broadcast-рассылки.
    const device = deviceToken('sos');
    await trackDevice(request, { token: device, platform: 'android' }, { token: operator.token });

    // 2. Проверяем, что gps-service доступен: ticket-service ищет ближних операторов.
    const search = await request.get(
      `${GPS_URL}/api/gps/employees/nearby?lat=${SOS_POINT.lat}&lng=${SOS_POINT.lng}&radius=500`,
      { headers: { Authorization: `Bearer ${operator.token}` } },
    );
    expect(search.status(), await bodyText(search)).toBe(200);

    // 3. SOS: аварийная заявка от OPERATOR.
    const description = `Прорыв трубы, E2E SOS ${runTag()}`;
    const objectName = `Объект SOS ${runTag()}`;
    const emergency = await createEmergencyTicket(request, {
      objectId,
      description,
      lat: SOS_POINT.lat,
      lng: SOS_POINT.lng,
      objectName,
      floor: '3 этаж, санузел',
      role: 'OPERATOR',
      token: operator.token,
    });
    operationsTracker.ticket(emergency.id);
    operationsTracker.object(emergency.objectId);

    expect(emergency.type, 'SOS создаёт заявку типа emergency').toBe('emergency');
    expect(emergency.priority, 'SOS всегда critical').toBe('critical');
    expect(emergency.status).toBe('new');
    expect(emergency.createdBy).toBe(operator.id);
    expect(emergency.description).toBe(description);
    expect(emergency.lat).toBe(SOS_POINT.lat);
    expect(emergency.reactionDeadline, 'таймер реакции для NEW').toBeTruthy();
    expect(Array.isArray(emergency.nearbyOperators), 'список ближних операторов в ответе').toBe(
      true,
    );

    // Заявка действительно сохранена и фильтруется как emergency.
    const list = await listTickets(request, { objectId, type: 'emergency', take: 100 });
    expect(list.status(), await bodyText(list)).toBe(200);
    const page = (await list.json()) as TicketList;
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(emergency.id);

    // 4. Ждём in-app уведомление EMERGENCY (RabbitMQ + консьюмер — асинхронно).
    const notification: AppNotification = await waitForNotification(
      request,
      { type: 'EMERGENCY', payloadKey: 'ticketId', payloadValue: emergency.id },
      { token: operator.token, timeout: 15_000 },
    );

    expect(notification.userId, 'уведомление адресовано получателю').toBe(operator.id);
    expect(notification.readAt, 'свежее уведомление непрочитано').toBeNull();
    expect(notification.title, 'заголовок шаблона EMERGENCY').toContain('АВАРИЙНАЯ');
    expect(notification.body, 'тело содержит объект и этаж').toContain(objectName);
    expect(notification.body).toContain('санузел');
    expect(notification.payload.ticketId).toBe(emergency.id);
    expect(notification.payload.objectName).toBe(objectName);
    expect(notification.payload.floor).toBe('3 этаж, санузел');
    expect(notification.payload.lat).toBe(SOS_POINT.lat);
    expect(notification.payload.lng).toBe(SOS_POINT.lng);

    // 5. Уведомление видно в списке и учитывается в счётчике непрочитанных.
    const unread = await notificationsPage(
      request,
      { unreadOnly: true, limit: 100 },
      { token: operator.token },
    );
    const ids = unread.items.map((item) => item.id);
    expect(ids, 'уведомление в списке непрочитанных').toContain(notification.id);
    expect(unread.unreadCount).toBeGreaterThan(0);

    // 6. Отмечается прочитанным — и идемпотентно остаётся прочитанным.
    const read = await markNotificationRead(request, notification.id, { token: operator.token });
    expect(read.status(), await bodyText(read)).toBe(200);
    const readBody = (await read.json()) as { readAt: string | null };
    expect(readBody.readAt).toBeTruthy();

    const readAgain = await markNotificationRead(request, notification.id, {
      token: operator.token,
    });
    expect(readAgain.status()).toBe(200);
    expect(((await readAgain.json()) as { readAt: string | null }).readAt).toBe(readBody.readAt);

    const afterRead = await notificationsPage(
      request,
      { unreadOnly: true, limit: 100 },
      { token: operator.token },
    );
    expect(afterRead.items.map((item) => item.id)).not.toContain(notification.id);
  });

  test('SOS без токена → 401, CLIENT может отправить SOS', async ({ request }) => {
    // Негативный кейс: аварийная заявка защищена так же, как остальные эндпоинты.
    const anonymous = await request.post(`${TICKETS_URL}/api/tickets/emergency`, {
      data: {
        objectId,
        description: 'анонимный SOS',
        lat: SOS_POINT.lat,
        lng: SOS_POINT.lng,
      },
    });
    await expectStatus(anonymous, 401, 'SOS без токена');

    // Эндпоинт без @Roles: SOS доступен любой аутентифицированной роли (клиент с портала).
    const client = await loginAs(request, 'CLIENT');
    const res = await request.post(`${TICKETS_URL}/api/tickets/emergency`, {
      headers: { Authorization: `Bearer ${client}` },
      data: {
        objectId,
        description: `SOS от CLIENT ${runTag()}`,
        lat: SOS_POINT.lat,
        lng: SOS_POINT.lng,
      },
    });
    expect(res.status(), await bodyText(res)).toBe(201);
    const emergency = (await res.json()) as { id: string; objectId: string; priority: string };
    operationsTracker.ticket(emergency.id);
    operationsTracker.object(emergency.objectId);
    expect(emergency.priority).toBe('critical');
  });
});
