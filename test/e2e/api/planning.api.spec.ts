import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  addOperation,
  bodyText,
  createFloor,
  createObject,
  createRoom,
  createTechCard,
  deleteObject,
  deleteTechCard,
  loginAs,
  runTag,
} from '../../helpers/core';
import {
  AUTH_URL,
  checkGeofence,
  completeTicketOperation,
  deviceToken,
  errorMessage,
  expectStatus,
  flushOperationsData,
  getTicketDetail,
  loginIdAs,
  operationsTracker,
  sqlAvailable,
  sweepOrphanNotifications,
  trackDevice,
  trackGeofence,
  trackTicket,
  uniqueGeofenceCell,
  waitForNotification,
  type CompleteOperationResult,
} from '../../helpers/operations';
import {
  AUTO_CONSUMPTION_USER_ID,
  checkIn,
  checkInOrFail,
  checkMissed,
  checkOut,
  checkOutOrFail,
  cleanupPlanningData,
  createMaterial,
  createMovement,
  deleteMaterial,
  findStock,
  flushPlanningData,
  generateForDate,
  getMaterial,
  getReport,
  getSchedule,
  getScheduleEvent,
  listMaterials,
  listMovements,
  listScheduleEvents,
  listSchedules,
  listStocks,
  materialsApi,
  planningCounts,
  planningTracker,
  postCheckMissed,
  postGenerate,
  postMaterial,
  postMovement,
  postSchedule,
  SCHEDULE_URL,
  scheduleApi,
  trackMaterial,
  trackSchedule,
  updateMaterial,
  utcDate,
  pastUtcTime,
  waitForAutoConsumption,
  type Material,
  type MaterialMovement,
  type ScheduleEventView,
} from '../../helpers/planning';

/**
 * М4.7 — e2e планирования и учёта: schedule-service ↔ ticket-service ↔ notification-service
 * и material-service ↔ ticket-service ↔ core-service.
 *
 * Это эталон вертикальной интеграции М4 (по образцу `operations.api.spec.ts` для М3):
 * проверяется не «ручка отвечает 200», а ЗАМКНУТЫЙ ЦИКЛ:
 *   1) график → `POST /generate` → смены + плановые заявки в ticket-service;
 *   2) check-in по геозоне (gps-service) → CHECKED_IN → check-out;
 *   3) неявка (`/check-missed`) → MISSED + `schedule.missed_checkin` → in-app SCHEDULE_MISSED;
 *   4) завершение операции техкарты → `ticket.operation.completed` → автосписание
 *      материалов (material-service, `system:auto-consumption`) → остаток вниз →
 *      `material.low` → in-app MATERIAL_LOW.
 *
 * Требует поднятого стенда: auth :3001, core :3003, gps :3004, tickets :3005,
 * notifications :3006, materials :3007, schedule :3008, RabbitMQ :5672,
 * PostgreSQL (`cleaning-ops-postgres`) для уборки и SQL-проверок.
 *
 * ДЕТЕРМИНИРОВАННОСТЬ. Стенд прогоняется с `SCHEDULE_CRON_ENABLED=false`: фоновые
 * проходы (генерация и проверка неявок) выключены, поэтому единственный источник
 * переходов статусов — явные вызовы `POST /generate` и `POST /check-missed`.
 * Тесты не ждут таймеров, а вызывают триггеры сами; асинхронным остаётся только
 * путь через RabbitMQ (уведомления и автосписание) — он опрашивается с таймаутом.
 *
 * ВРЕМЯ В UTC. schedule-service хранит день и время смены в UTC (`recurrence.ts`),
 * поэтому «сегодня» здесь — всегда `utcDate()`, а не локальная дата процесса.
 *
 * УБОРКА. afterEach снимает РОВНО созданное: заявки/уведомления/геозоны — существующим
 * `operationsTracker`, графики/смены/материалы/движения/`ConsumedOperation` — трекером
 * `helpers/planning.ts`; объекты и техкарты core удаляются через API. Ни один тест не
 * зависит от данных, оставшихся от прошлых прогонов.
 */

test.describe.configure({ timeout: 180_000 });

/** Нижняя граница для уведомлений: всё, что пришло после, — заслуга этого набора. */
const runStartedAt = new Date();

/** Объекты и техкарты core, созданные набором: удаляются через API (каскад за объект). */
const createdObjectIds = new Set<string>();
const createdTechCardIds = new Set<string>();

test.afterEach(async ({ request }) => {
  // Уведомления ролям-фикстурам снимаются «по области» (userId + время прогона): без этого
  // каждый прогон копил бы копии NEW_TICKET/SCHEDULE_MISSED на стенде.
  for (const role of ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const) {
    operationsTracker.notificationSince(await loginIdAs(request, role), runStartedAt);
  }

  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  for (const cardId of createdTechCardIds) {
    await deleteTechCard(request, cardId);
  }
  createdObjectIds.clear();
  createdTechCardIds.clear();

  // Порядок уборки: заявки (по objectId и id) и уведомления — трекером «оперативки»,
  // затем данные М4 (графики, смены, материалы, ConsumedOperation).
  flushOperationsData();
  flushPlanningData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений (гонка с RabbitMQ): один раз на процесс.
  sweepOrphanNotifications();
});

// ---------------------------------------------------------------------------
// Общие сценарии настройки
// ---------------------------------------------------------------------------

/** Объект core, который набор уберёт за собой (и по которому уберутся его заявки). */
async function trackObject(
  request: APIRequestContext,
  input: Parameters<typeof createObject>[1] = {},
) {
  const object = await createObject(request, input);
  createdObjectIds.add(object.id);
  operationsTracker.object(object.id);
  return object;
}

/** Техкарта core: у техкарт нет каскада от объекта, поэтому удаление явное. */
async function trackTechCard(
  request: APIRequestContext,
  input: Parameters<typeof createTechCard>[1] = {},
) {
  const card = await createTechCard(request, input);
  createdTechCardIds.add(card.id);
  return card;
}

interface ConsumptionFixture {
  objectId: string;
  material: Material;
  ticketId: string;
  operationId: string;
  /** Свежий OPERATOR с токеном: он завершает операцию. */
  operatorId: string;
  operatorToken: string;
}

/**
 * Полный стенд для сквозного автосписания: объект → этаж → помещение с техкартой →
 * операция с нормой расхода → заявка на это помещение → приход материала на объект.
 *
 * Почему заявка создаётся с `roomId`: material-service получает материалы операции
 * ЦЕПОЧКОЙ ticket → core (заявка → помещение → техкарта → операция → нормы), и без
 * `roomId` автосписание честно пропускается — проверять было бы нечего.
 *
 * Оператор — свежий пользователь: и как автор завершения операции, и (в тесте
 * автосписания) как получатель broadcast-уведомления `material.low`.
 */
async function setupConsumptionFixture(
  request: APIRequestContext,
  options: { materialName: string; stock: number; consumption: number; threshold: number; cost: number },
): Promise<ConsumptionFixture> {
  const operator = await createFreshOperator(request);

  const object = await trackObject(request, { name: `E2E М4 автосписание ${runTag()}` });
  const material = await trackMaterial(request, {
    name: options.materialName,
    unit: 'л',
    defaultConsumption: options.consumption,
    minStockThreshold: options.threshold,
    costPerUnit: options.cost,
  });

  const floor = await createFloor(request, object.id, { number: 1 });
  const card = await trackTechCard(request, { name: `E2E техкарта автосписания ${runTag()}` });
  const operation = await addOperation(request, card.id, {
    name: 'Влажная уборка',
    estimatedTimeMin: 10,
    materials: [
      { materialId: material.id, consumptionPerOperation: options.consumption, unit: 'л' },
    ],
  });
  const room = await createRoom(request, floor.id, { techCardId: card.id, name: 'Санузел 101' });

  const ticket = await trackTicket(request, {
    type: 'planned',
    objectId: object.id,
    roomId: room.id,
    assigneeId: operator.id,
    description: `E2E автосписание ${runTag()}`,
  });

  // Приход: списывать можно только то, что лежит на складе объекта.
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: options.stock,
  });

  return {
    objectId: object.id,
    material,
    ticketId: ticket.id,
    operationId: operation.id,
    operatorId: operator.id,
    operatorToken: operator.token,
  };
}

/**
 * Свежий OPERATOR через auth-service.
 *
 * Зачем свой пользователь: и SCHEDULE_MISSED, и MATERIAL_LOW адресуются конкретному
 * получателю, а broadcast идёт владельцам активных устройств. Свежий пользователь
 * гарантирует, что найденное уведомление — наше, а не оставшееся от других наборов.
 * Уборка (удаление пользователя, его устройств и уведомлений) — в operationsTracker.
 */
async function createFreshOperator(
  request: APIRequestContext,
): Promise<{ id: string; token: string }> {
  const admin = await loginAs(request, 'ADMIN');
  const email = `e2e-m47-${runTag()}@cleaning-ops.com`;
  const password = 'e2e-m47-pass';

  const created = await request.post(`${AUTH_URL}/api/users`, {
    headers: { Authorization: `Bearer ${admin}` },
    data: { email, password, fullName: `E2E М4 ${email}`, role: 'OPERATOR' },
  });
  expect(created.status(), `создание оператора М4: ${await bodyText(created)}`).toBe(201);
  const { id } = (await created.json()) as { id: string };
  operationsTracker.userRow(id);

  const login = await request.post(`${AUTH_URL}/api/auth/login`, { data: { email, password } });
  expect(login.status(), `логин оператора М4: ${await bodyText(login)}`).toBe(201);
  const { accessToken } = (await login.json()) as { accessToken: string };

  return { id, token: accessToken };
}

/**
 * Доводит операцию стенда автосписания до списания: завершает операцию оператором и
 * дожидается движения `system:auto-consumption` по заявке. Возвращает это движение.
 * Вынесено отдельно, потому что «списать материалы» нужно нескольким тестам, а путь
 * асинхронный (ticket-service → RabbitMQ → material-service).
 */
async function consumeFixture(
  request: APIRequestContext,
  fixture: ConsumptionFixture,
): Promise<MaterialMovement> {
  const completion = await completeTicketOperation(
    request,
    fixture.ticketId,
    fixture.operationId,
    { totalOperations: 1 },
    { role: 'OPERATOR', token: fixture.operatorToken },
  );
  await expectStatus(completion, 201, 'завершение операции');
  return waitForAutoConsumption(request, {
    materialId: fixture.material.id,
    objectId: fixture.objectId,
    ticketId: fixture.ticketId,
  });
}

/** Случайный UUID v4: DTO стенда требуют именно v4, иначе 400 вместо 404. */
function randomUuid(): string {
  const hex = runTag().replace(/[^0-9a-f]/g, '').slice(-12).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// ---------------------------------------------------------------------------
// Графики и генерация
// ---------------------------------------------------------------------------

test.describe('Schedule: графики', () => {
  test('создание daily/weekly, 400 на weekly без days и на мусорную частоту', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const objectId = randomUuid();

    // daily — базовая форма правила: частота и время в UTC, исполнители обязательны.
    const daily = await trackSchedule(request, {
      objectId,
      name: `E2E daily ${runTag()}`,
      recurrence: { frequency: 'daily', time: '08:00' },
      assignees: [operatorId],
    });
    expect(daily.objectId).toBe(objectId);
    expect(daily.recurrence.frequency).toBe('daily');
    expect(daily.recurrence.time).toBe('08:00');
    expect(daily.assignees).toEqual([operatorId]);
    expect(daily.isActive, 'график по умолчанию активен').toBe(true);

    // weekly с днями Пн–Пт — правило из устава («Пн–Пт 08:00»).
    const weekly = await trackSchedule(request, {
      objectId,
      name: `E2E weekly ${runTag()}`,
      recurrence: { frequency: 'weekly', days: [1, 2, 3, 4, 5], time: '07:30' },
      assignees: [operatorId],
    });
    expect(weekly.recurrence.days).toEqual([1, 2, 3, 4, 5]);

    // weekly без days бессмыслен: не определить, в какие дни ставить смены.
    // Это ДОМЕННАЯ проверка ScheduleService.assertRecurrence → 400 с понятным текстом.
    const weeklyNoDays = await postSchedule(request, {
      objectId,
      name: `E2E weekly без days ${runTag()}`,
      recurrence: { frequency: 'weekly', time: '08:00' },
      assignees: [operatorId],
    });
    await expectStatus(weeklyNoDays, 400, 'weekly без days');
    expect(await errorMessage(weeklyNoDays)).toContain('weekly');

    // Мусорная частота ловится валидатором DTO (@IsIn(FREQUENCIES)) — тоже 400, не 500.
    const junkFrequency = await postSchedule(request, {
      objectId,
      name: `E2E мусорная частота ${runTag()}`,
      recurrence: { frequency: 'yearly' as never, time: '08:00' },
      assignees: [operatorId],
    });
    await expectStatus(junkFrequency, 400, 'мусорная частота');

    // Пустой список исполнителей: смену некому получить — 400.
    const noAssignees = await postSchedule(request, {
      objectId,
      name: `E2E без исполнителей ${runTag()}`,
      recurrence: { frequency: 'daily', time: '08:00' },
      assignees: [],
    });
    await expectStatus(noAssignees, 400, 'график без исполнителей');
  });

  test('GET /api/schedule и /:id отдают созданный график, неизвестный id → 404', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const schedule = await trackSchedule(request, {
      objectId: randomUuid(),
      name: `E2E в списке ${runTag()}`,
      recurrence: { frequency: 'daily', time: '09:15' },
      assignees: [operatorId],
    });

    const list = await listSchedules(request);
    const found = list.find((item) => item.id === schedule.id);
    expect(found, 'созданный график виден в списке').toBeTruthy();
    expect(found?.name).toBe(schedule.name);
    expect(found?.eventsCount, 'смен ещё нет — счётчик нулевой').toBe(0);

    const byId = await getSchedule(request, schedule.id);
    await expectStatus(byId, 200, 'график по id');
    expect(((await byId.json()) as { name: string }).name).toBe(schedule.name);

    const missing = await getSchedule(request, randomUuid());
    await expectStatus(missing, 404, 'неизвестный график');
  });
});

test.describe('Schedule: генерация смен и плановых заявок', () => {
  test('generate создаёт смены и заявки; повтор на ту же дату идемпотентен', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const object = await trackObject(request, { name: `E2E генерация ${runTag()}` });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E генерация график ${runTag()}`,
      recurrence: { frequency: 'daily', time: '08:00' },
      assignees: [operatorId],
    });
    const date = utcDate();

    const first = await generateForDate(request, date);
    expect(first.date).toBe(date);
    expect(first.ticketServiceUnavailable, 'ticket-service доступен — проход не прерван').toBe(false);
    expect(first.shiftsCreated, 'смены созданы').toBeGreaterThanOrEqual(1);
    expect(first.ticketsCreated, 'плановые заявки созданы').toBeGreaterThanOrEqual(1);
    expect(first.errors.join(' '), 'ошибок по нашим графикам нет').not.toContain(schedule.id);

    // Смена на дату: ровно один исполнитель из графика, день — запрошенный (UTC).
    const events = await listScheduleEvents(request, { date, objectId: object.id });
    expect(events, 'на дату создана ровно одна смена по нашему графику').toHaveLength(1);
    const event = events[0];
    expect(event.scheduleId).toBe(schedule.id);
    expect(event.userId).toBe(operatorId);
    expect(event.status).toBe('PLANNED');
    expect(event.date).toBe(date);
    expect(event.plannedStart, 'плановое начало = дата + время графика (UTC)').toBe(
      `${date}T08:00:00.000Z`,
    );
    expect(event.ticketId, 'смена связана с плановой заявкой').toBeTruthy();

    // Заявка проверяется ЧЕРЕЗ ticket-service: это и есть вертикаль «график → заявка».
    const ticket = await getTicketDetail(request, event.ticketId as string);
    expect(ticket.type).toBe('planned');
    expect(ticket.objectId).toBe(object.id);
    expect(ticket.assigneeId, 'исполнитель из графика').toBe(operatorId);
    expect(ticket.description, 'описание ссылается на график').toContain(schedule.name);

    // Идемпотентность: повторный проход не плодит ни смен, ни заявок. Проверяем это
    // дважды — по сводке И по факту (число смен и id заявки не изменились).
    const second = await generateForDate(request, date);
    expect(second.shiftsCreated, 'повтор не создаёт смен').toBe(0);
    expect(second.ticketsCreated, 'повтор не создаёт заявок').toBe(0);
    expect(second.shiftsSkipped, 'существующая смена пропущена').toBeGreaterThanOrEqual(1);
    expect(second.ticketServiceUnavailable).toBe(false);

    const afterRepeat = await listScheduleEvents(request, { date, objectId: object.id });
    expect(afterRepeat, 'число смен не выросло').toHaveLength(1);
    expect(afterRepeat[0].id).toBe(event.id);
    expect(afterRepeat[0].ticketId, 'id заявки не перезаписан').toBe(event.ticketId);
  });

  test('смены дня фильтруются по date/objectId/userId', async ({ request }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const adminId = await loginIdAs(request, 'ADMIN');
    const object = await trackObject(request, { name: `E2E фильтры смен ${runTag()}` });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E фильтры график ${runTag()}`,
      recurrence: { frequency: 'daily', time: '10:00' },
      assignees: [operatorId],
    });
    const today = utcDate();
    const tomorrow = utcDate(1);
    await generateForDate(request, today);

    // Положительные фильтры: смена с нашим исполнителем на нашем объекте находится.
    const byObject = await listScheduleEvents(request, { date: today, objectId: object.id });
    expect(byObject, 'смена на нашем объекте').toHaveLength(1);
    const byUser = await listScheduleEvents(request, {
      date: today,
      objectId: object.id,
      userId: operatorId,
    });
    expect(byUser, 'фильтр по исполнителю находит свою смену').toHaveLength(1);
    expect(byUser[0].scheduleId).toBe(schedule.id);

    // Отрицательные: чужой исполнитель, чужой объект и завтрашний день отсекаются.
    // Иначе «фильтр» мог бы просто игнорироваться, и тест остался бы зелёным.
    const foreignUser = await listScheduleEvents(request, {
      date: today,
      objectId: object.id,
      userId: adminId,
    });
    expect(foreignUser, 'смена другого исполнителя не попадает в выдачу').toHaveLength(0);

    const foreignObject = await listScheduleEvents(request, {
      date: today,
      objectId: randomUuid(),
    });
    expect(foreignObject).toHaveLength(0);

    const otherDay = await listScheduleEvents(request, { date: tomorrow, objectId: object.id });
    expect(otherDay, 'на завтра смен ещё нет — генерация не запускалась').toHaveLength(0);

    // Смена по id отдаётся тем же плоским представлением, что и список.
    const event = byObject[0];
    const byId = await getScheduleEvent(request, event.id);
    await expectStatus(byId, 200, 'смена по id');
    expect(((await byId.json()) as ScheduleEventView).scheduleName).toBe(schedule.name);
  });
});

// ---------------------------------------------------------------------------
// Check-in / check-out / неявка
// ---------------------------------------------------------------------------

test.describe('Schedule: check-in и check-out', () => {
  test('check-in: внутри геозоны 201 CHECKED_IN, вне зоны 403, чужая смена 404, повтор идемпотентен', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const adminId = await loginIdAs(request, 'ADMIN');

    const object = await trackObject(request, { name: `E2E геозона ${runTag()}` });
    // Своя площадка на тест: gps-service ищет БЛИЖАЙШУЮ геозону в радиусе 1000 м,
    // поэтому две геозоны в одной точке сделали бы проверку недетерминированной.
    const cell = uniqueGeofenceCell(21);
    const geofence = await trackGeofence(request, {
      objectId: object.id,
      name: `E2E геозона М4 ${runTag()}`,
      boundary: cell.boundary,
    });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E график check-in ${runTag()}`,
      recurrence: { frequency: 'daily', time: '00:00' },
      assignees: [operatorId],
    });
    const date = utcDate();
    await generateForDate(request, date);

    const events = await listScheduleEvents(request, { date, objectId: object.id });
    expect(events).toHaveLength(1);
    const event = events[0];

    // 1. Снаружи зоны — 403 и фиксированный текст из задания М4.5. Отметка не ставится:
    //    проверяем это отдельным чтением смены, иначе «403» ничего не доказывает.
    const outside = await checkIn(request, {
      scheduleId: schedule.id,
      lat: cell.outside.lat,
      lng: cell.outside.lng,
      role: 'OPERATOR',
    });
    await expectStatus(outside, 403, 'check-in вне геозоны');
    expect(await errorMessage(outside), 'текст ошибки зафиксирован заданием').toContain(
      'Вы находитесь вне зоны объекта',
    );
    const stillPlanned = (await (await getScheduleEvent(request, event.id)).json()) as ScheduleEventView;
    expect(stillPlanned.status, 'после 403 смена осталась PLANNED').toBe('PLANNED');

    // Геозона действительно наша: gps-service подтверждает вхождение в неё.
    const check = await checkGeofence(request, operatorId, cell.inside);
    expect(check.inside, 'точка внутри созданной геозоны').toBe(true);
    expect(check.geofence?.id).toBe(geofence.id);

    // 2. Внутри зоны — 201 и CHECKED_IN с координатами отметки и временем.
    const inside = await checkInOrFail(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    expect(inside.id).toBe(event.id);
    expect(inside.status).toBe('CHECKED_IN');
    expect(inside.checkInAt).toBeTruthy();
    // Координаты сверяем с точностью 10 знаков: это double precision в БД, и последний
    // бит мантиссы при сериализации/разборе может отличаться — контрактом он не является.
    expect(inside.checkInLat).toBeCloseTo(cell.inside.lat, 10);
    expect(inside.checkInLng).toBeCloseTo(cell.inside.lng, 10);
    expect(inside.userId).toBe(operatorId);
    expect(inside.ticketId, 'плановая заявка всё ещё привязана').toBe(event.ticketId);

    // 3. Повторный check-in идемпотентен: возвращается ТА ЖЕ отметка (а не 500 и не новое
    //    время). Критично для мобильного: повтор при плохой сети не должен ломать смену.
    const repeat = await checkInOrFail(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    expect(repeat.status).toBe('CHECKED_IN');
    expect(repeat.checkInAt, 'отметка не перезаписана').toBe(inside.checkInAt);

    // 4. 404: смены на сегодня нет. Два случая — неизвестный график и график, где
    //    у вызывающего нет смены (чужая смена не «читается» даже в 403).
    const unknownSchedule = await checkIn(request, {
      scheduleId: randomUuid(),
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    await expectStatus(unknownSchedule, 404, 'check-in по неизвестному графику');
    expect(await errorMessage(unknownSchedule)).toContain('не найден');

    const foreignSchedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E чужой график ${runTag()}`,
      recurrence: { frequency: 'daily', time: '00:00' },
      assignees: [adminId],
    });
    await generateForDate(request, date);
    const foreign = await checkIn(request, {
      scheduleId: foreignSchedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    await expectStatus(foreign, 404, 'check-in по чужой смене');
  });

  test('check-out: CHECKED_OUT, повтор идемпотентен, без check-in — 400', async ({ request }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const object = await trackObject(request, { name: `E2E check-out ${runTag()}` });
    const cell = uniqueGeofenceCell(22);
    await trackGeofence(request, {
      objectId: object.id,
      name: `E2E геозона check-out ${runTag()}`,
      boundary: cell.boundary,
    });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E график check-out ${runTag()}`,
      recurrence: { frequency: 'daily', time: '00:00' },
      assignees: [operatorId],
    });
    const date = utcDate();
    await generateForDate(request, date);

    // Закрыть смену, не открыв её, нельзя: 400 с понятным текстом (не 500 и не молчание).
    const beforeCheckIn = await checkOut(request, { scheduleId: schedule.id, role: 'OPERATOR' });
    await expectStatus(beforeCheckIn, 400, 'check-out без check-in');
    expect(await errorMessage(beforeCheckIn)).toContain('check-in');

    await checkInOrFail(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });

    const closed = await checkOutOrFail(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    expect(closed.status).toBe('CHECKED_OUT');
    expect(closed.checkOutAt).toBeTruthy();
    expect(closed.checkOutLat).toBeCloseTo(cell.inside.lat, 10);
    expect(closed.checkOutReason, 'ручное закрытие — без пометки авто check-out').toBeNull();

    // Повторное закрытие идемпотентно: время не перезаписывается, статус тот же.
    const again = await checkOutOrFail(request, { scheduleId: schedule.id, role: 'OPERATOR' });
    expect(again.status).toBe('CHECKED_OUT');
    expect(again.checkOutAt, 'время закрытия не перезаписано').toBe(closed.checkOutAt);
  });

  test('неявка: PLANNED с прошедшим plannedStart → MISSED и SCHEDULE_MISSED получателю', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const object = await trackObject(request, { name: `E2E неявка ${runTag()}` });
    const time = pastUtcTime();
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E график неявки ${runTag()}`,
      // Время гарантированно в прошлом: неявка определяется по plannedStart <= now,
      // поэтому «сегодня 08:00» сделало бы тест зависимым от часа прогона.
      recurrence: { frequency: 'daily', time },
      assignees: [operatorId],
    });
    const date = utcDate();
    await generateForDate(request, date);

    const events = await listScheduleEvents(request, { date, objectId: object.id });
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.status).toBe('PLANNED');
    expect(
      new Date(event.plannedStart).getTime(),
      'плановое начало уже прошло — иначе неявки нет',
    ).toBeLessThan(Date.now());

    // Детерминированный триггер вместо фонового прохода (cron на стенде выключен).
    const scan = await checkMissed(request, date);
    expect(scan.missed.eventIds, 'наша смена попала в проход').toContain(event.id);
    expect(scan.missed.missed).toBeGreaterThanOrEqual(1);

    const missed = (await (await getScheduleEvent(request, event.id)).json()) as ScheduleEventView;
    expect(missed.status, 'смена переведена в MISSED').toBe('MISSED');

    // Уведомление адресное (userId из события), поэтому спрашиваем список ПОД ОПЕРАТОРОМ:
    // notification-service изолирует выдачу по userId из JWT.
    const notification = await waitForNotification(
      request,
      { type: 'SCHEDULE_MISSED', payloadKey: 'eventId', payloadValue: event.id },
      { role: 'OPERATOR', timeout: 20_000 },
    );
    expect(notification.userId, 'уведомление пришло назначенному исполнителю').toBe(operatorId);
    expect(notification.payload.scheduleId).toBe(schedule.id);
    expect(notification.payload.eventId).toBe(event.id);
    expect(notification.payload.objectId).toBe(object.id);
    expect(notification.title, 'шаблон SCHEDULE_MISSED').toContain('Неявка');
    expect(notification.body, 'в теле — объект смены').toContain(object.name);

    // Повторный проход не публикует событие второй раз: смена уже не PLANNED.
    const secondScan = await checkMissed(request, date);
    expect(secondScan.missed.eventIds, 'повтор не находит нашу смену снова').not.toContain(event.id);
  });
});

test.describe('Schedule: права', () => {
  test('OPERATOR не создаёт графики и не генерирует, но может check-in; CLIENT не может check-in', async ({
    request,
  }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const object = await trackObject(request, { name: `E2E права ${runTag()}` });
    const cell = uniqueGeofenceCell(23);
    await trackGeofence(request, {
      objectId: object.id,
      name: `E2E геозона прав ${runTag()}`,
      boundary: cell.boundary,
    });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E график прав ${runTag()}`,
      recurrence: { frequency: 'daily', time: '00:00' },
      assignees: [operatorId],
    });
    const date = utcDate();
    await generateForDate(request, date);

    // OPERATOR: создание графика и ручная генерация — только ADMIN (@Roles в контроллере).
    // Смена графика — действие администратора, а не рабочее действие оператора.
    const operatorCreate = await postSchedule(request, {
      objectId: object.id,
      name: `E2E оператор не может ${runTag()}`,
      recurrence: { frequency: 'daily', time: '08:00' },
      assignees: [operatorId],
      role: 'OPERATOR',
    });
    await expectStatus(operatorCreate, 403, 'OPERATOR создаёт график');

    const operatorGenerate = await postGenerate(request, date, { role: 'OPERATOR' });
    await expectStatus(operatorGenerate, 403, 'OPERATOR запускает генерацию');

    const operatorCheckMissed = await postCheckMissed(request, date, { role: 'OPERATOR' });
    await expectStatus(operatorCheckMissed, 403, 'OPERATOR запускает проверку неявок');

    const operatorDelete = await deleteScheduleViaApi(request, schedule.id, 'OPERATOR');
    await expectStatus(operatorDelete, 403, 'OPERATOR удаляет график');

    // Без токена — 401 (а не 403): охрана аутентификации стоит перед ролями.
    const anonymous = await request.post(`${SCHEDULE_URL}/api/schedule`, {
      data: {
        objectId: object.id,
        name: `E2E аноним ${runTag()}`,
        recurrence: { frequency: 'daily', time: '08:00' },
        assignees: [operatorId],
      },
    });
    await expectStatus(anonymous, 401, 'создание графика без токена');

    // SUPERVISOR графики ведёт наравне с ADMIN (@Roles('ADMIN','SUPERVISOR')).
    const supervisor = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E supervisor ${runTag()}`,
      recurrence: { frequency: 'daily', time: '08:00' },
      assignees: [operatorId],
      role: 'SUPERVISOR',
    });
    expect(supervisor.name).toContain('supervisor');
    await generateForDate(request, date);

    // check-in — рабочее действие смены: OPERATOR его умеет (201), CLIENT — нет (403).
    const operatorCheckIn = await checkIn(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'OPERATOR',
    });
    await expectStatus(operatorCheckIn, 201, 'OPERATOR может check-in');

    const clientCheckIn = await checkIn(request, {
      scheduleId: schedule.id,
      lat: cell.inside.lat,
      lng: cell.inside.lng,
      role: 'CLIENT',
    });
    await expectStatus(clientCheckIn, 403, 'CLIENT не может check-in');
  });
});

/** DELETE графика «как есть»: в негативном кейсе важен именно 403, а не идемпотентность. */
function deleteScheduleViaApi(
  request: APIRequestContext,
  id: string,
  role: 'OPERATOR' | 'CLIENT' | 'SUPERVISOR' | 'ADMIN',
) {
  return scheduleApi(request, 'delete', `/api/schedule/${id}`, { role });
}

// ---------------------------------------------------------------------------
// Материалы: справочник и склад
// ---------------------------------------------------------------------------

test.describe('Materials: справочник', () => {
  test('CRUD справочника: создание, PATCH, поиск, удаление, 400 на некорректные числа', async ({
    request,
  }) => {
    const name = `E2E-M47 справочник ${runTag()}`;
    const supplier = `ООО «E2E поставщик ${runTag()}»`;

    const material = await trackMaterial(request, {
      name,
      unit: 'л',
      defaultConsumption: 0.25,
      minStockThreshold: 4,
      costPerUnit: 320.5,
      supplier,
    });
    expect(material.name).toBe(name);
    expect(material.unit).toBe('л');
    expect(material.defaultConsumption).toBe(0.25);
    expect(material.minStockThreshold).toBe(4);
    expect(material.costPerUnit).toBe(320.5);
    expect(material.supplier).toBe(supplier);

    // PATCH: частичное обновление; `supplier: null` очищает поле (отсутствие поля — «не менять»).
    const patched = await updateMaterial(request, material.id, {
      name: `${name} (изм.)`,
      minStockThreshold: 7,
      supplier: null,
    });
    expect(patched.name).toBe(`${name} (изм.)`);
    expect(patched.minStockThreshold).toBe(7);
    expect(patched.supplier, 'supplier: null очищает поставщика').toBeNull();
    expect(patched.costPerUnit, 'непереданные поля не меняются').toBe(320.5);

    // Деталь материала отдаёт остатки по объектам (пока пустые).
    const detail = await getMaterial(request, material.id);
    await expectStatus(detail, 200, 'материал по id');
    expect((await detail.json()) as { stocks: unknown[] }).toHaveProperty('stocks');

    // Поиск серверный и ищет и по названию, и по поставщику.
    const byName = await listMaterials(request, { search: name });
    expect(byName.items.map((item) => item.id), 'поиск по названию находит материал').toContain(
      material.id,
    );

    const supplierMaterial = await trackMaterial(request, {
      name: `E2E-M47 поставщик ${runTag()}`,
      supplier: `ООО «Уникальный ${runTag()}»`,
    });
    const bySupplier = await listMaterials(request, { search: 'Уникальный' });
    expect(bySupplier.items.map((item) => item.id), 'поиск по поставщику').toContain(
      supplierMaterial.id,
    );

    const noMatch = await listMaterials(request, { search: `нет-такого-${runTag()}` });
    expect(noMatch.items, 'по несуществующему запросу — пусто').toHaveLength(0);

    // Нечисловые/отрицательные значения — 400 от валидатора DTO (Min(0) + IsNumber),
    // а не 500: справочник не должен принимать отрицательную норму расхода.
    for (const bad of [
      { defaultConsumption: -1 },
      { minStockThreshold: -2 },
      { costPerUnit: -3 },
      { defaultConsumption: 'абв' as unknown as number },
    ]) {
      const res = await postMaterial(request, {
        name: `E2E-M47 мусор ${runTag()}`,
        unit: 'л',
        ...bad,
      });
      await expectStatus(res, 400, `некорректное число ${JSON.stringify(bad)}`);
    }

    const emptyName = await postMaterial(request, { name: '', unit: 'л' });
    await expectStatus(emptyName, 400, 'пустое название материала');

    // Удаление: 204 и материал исчезает (остатки и история уходят каскадом).
    await deleteMaterial(request, material.id);
    await expectStatus(await getMaterial(request, material.id), 404, 'удалённый материал');
    await expectStatus(await getMaterial(request, randomUuid()), 404, 'неизвестный материал');
  });
});

test.describe('Materials: движения и остатки', () => {
  test('IN увеличивает, OUT уменьшает, OUT больше остатка → 400, TRANSFER двигает два объекта', async ({
    request,
  }) => {
    const adminId = await loginIdAs(request, 'ADMIN');
    const objectA = randomUuid();
    const objectB = randomUuid();
    const material = await trackMaterial(request, {
      name: `E2E-M47 движения ${runTag()}`,
      unit: 'л',
      minStockThreshold: 5,
      costPerUnit: 100,
    });

    // До первого движения пары «материал — объект» на складе нет вовсе.
    expect(await findStock(request, material.id, objectA), 'остатка ещё нет').toBeNull();

    const incoming = await createMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'IN',
      quantity: 100,
    });
    expect(incoming.movement.userId, 'автор движения — текущий пользователь').toBe(adminId);
    expect(incoming.stocks, 'приход зачислен на объект').toEqual([
      { objectId: objectA, quantity: 100 },
    ]);
    expect((await findStock(request, material.id, objectA))?.quantity).toBe(100);

    const outgoing = await createMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'OUT',
      quantity: 30,
    });
    expect(outgoing.stocks[0].quantity).toBe(70);
    expect((await findStock(request, material.id, objectA))?.quantity).toBe(70);

    // Расход больше остатка: 400 «Недостаточно материала», остаток НЕ меняется.
    // Проверяем остаток после отказа — иначе «400» не доказывает транзакционность.
    const tooMuch = await postMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'OUT',
      quantity: 1000,
    });
    await expectStatus(tooMuch, 400, 'расход больше остатка');
    expect(await errorMessage(tooMuch)).toContain('Недостаточно материала');
    expect((await findStock(request, material.id, objectA))?.quantity, 'остаток не изменился').toBe(70);

    // Количество 0 не является движением.
    await expectStatus(
      await postMovement(request, { materialId: material.id, objectId: objectA, type: 'OUT', quantity: 0 }),
      400,
      'нулевое количество',
    );

    // TRANSFER: без получателя и с получателем = источник — 400 (доменные проверки).
    await expectStatus(
      await postMovement(request, { materialId: material.id, objectId: objectA, type: 'TRANSFER', quantity: 5 }),
      400,
      'TRANSFER без targetObjectId',
    );
    const sameObject = await postMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'TRANSFER',
      quantity: 5,
      targetObjectId: objectA,
    });
    await expectStatus(sameObject, 400, 'TRANSFER на тот же объект');
    expect(await errorMessage(sameObject)).toContain('отличаться');

    // Корректный TRANSFER обновляет ДВА объекта: −20 у источника, +20 у получателя.
    const transfer = await createMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'TRANSFER',
      quantity: 20,
      targetObjectId: objectB,
    });
    expect(transfer.movement.targetObjectId).toBe(objectB);
    expect(transfer.stocks).toEqual([
      { objectId: objectA, quantity: 50 },
      { objectId: objectB, quantity: 20 },
    ]);
    expect((await findStock(request, material.id, objectA))?.quantity).toBe(50);
    expect((await findStock(request, material.id, objectB))?.quantity).toBe(20);

    // WRITE_OFF уменьшает так же, как OUT (оба — расходные типы).
    const writeOff = await createMovement(request, {
      materialId: material.id,
      objectId: objectA,
      type: 'WRITE_OFF',
      quantity: 10,
    });
    expect(writeOff.stocks[0].quantity).toBe(40);

    // Фильтр остатков по объекту и признак «ниже порога» (порог 5: 40 и 20 — в норме).
    const stocksA = await listStocks(request, { objectId: objectA });
    expect(stocksA.items.map((item) => item.materialId)).toContain(material.id);
    expect(stocksA.items[0].belowThreshold, '40 > порога 5').toBe(false);
    expect((await listStocks(request, { objectId: randomUuid() })).items).toHaveLength(0);
  });

  test('отчёт агрегирует OUT+WRITE_OFF и сходится со стоимостью движений за период', async ({
    request,
  }) => {
    const objectId = randomUuid();
    const otherObjectId = randomUuid();
    const material = await trackMaterial(request, {
      name: `E2E-M47 отчёт ${runTag()}`,
      unit: 'л',
      minStockThreshold: 1,
      costPerUnit: 250,
    });

    await createMovement(request, { materialId: material.id, objectId, type: 'IN', quantity: 10 });
    await createMovement(request, { materialId: material.id, objectId, type: 'OUT', quantity: 3 });
    await createMovement(request, { materialId: material.id, objectId, type: 'WRITE_OFF', quantity: 2 });
    // Другой объект: приход, затем расход — этот расход не должен попасть в отчёт первого объекта.
    await createMovement(request, {
      materialId: material.id,
      objectId: otherObjectId,
      type: 'IN',
      quantity: 7,
    });
    await createMovement(request, {
      materialId: material.id,
      objectId: otherObjectId,
      type: 'OUT',
      quantity: 7,
    });

    const today = utcDate();
    const report = await getReport(request, { objectId, from: today, to: today });

    // На своём уникальном объекте в отчёте ровно одна строка — наш материал, поэтому
    // числа можно сверять точно, а не «больше нуля».
    expect(report.rows, 'в отчёте только наш материал').toHaveLength(1);
    const row = report.rows[0];
    expect(row.materialId).toBe(material.id);
    // OUT 3 + WRITE_OFF 2 = 5: агрегат обязан складывать оба расходных типа.
    expect(row.consumedQuantity).toBe(5);
    expect(row.operationsCount, 'две расходные операции').toBe(2);
    expect(row.costPerUnit).toBe(250);
    expect(row.cost, '5 × 250').toBe(1250);
    expect(report.totals.consumedQuantity).toBe(5);
    expect(report.totals.operationsCount).toBe(2);
    expect(report.totals.cost).toBe(1250);

    // Сверка с фактическими движениями: агрегат не должен «жить своей жизнью».
    const movements = await listMovements(request, material.id, { objectId });
    const consumed = movements.items
      .filter((item) => item.type === 'OUT' || item.type === 'WRITE_OFF')
      .reduce((sum, item) => sum + item.quantity, 0);
    expect(consumed, 'сумма расходных движений равна агрегату').toBe(row.consumedQuantity);

    // Период реально фильтрует: за завтрашний день расхода нет.
    const tomorrowReport = await getReport(request, { objectId, from: utcDate(1), to: utcDate(1) });
    expect(tomorrowReport.rows).toHaveLength(0);
    expect(tomorrowReport.totals.cost).toBe(0);

    // И чужой объект в отчёт не подмешивается.
    const otherReport = await getReport(request, {
      objectId: otherObjectId,
      from: today,
      to: today,
    });
    expect(otherReport.rows.map((item) => item.materialId)).toEqual([material.id]);
    expect(otherReport.totals.consumedQuantity, 'на другом объекте только расход 7').toBe(7);
  });

  test('история движений материала фильтруется по objectId и периоду', async ({ request }) => {
    const objectA = randomUuid();
    const objectB = randomUuid();
    const material = await trackMaterial(request, { name: `E2E-M47 история ${runTag()}` });

    await createMovement(request, { materialId: material.id, objectId: objectA, type: 'IN', quantity: 5 });
    await createMovement(request, { materialId: material.id, objectId: objectB, type: 'IN', quantity: 7 });
    await createMovement(request, { materialId: material.id, objectId: objectA, type: 'OUT', quantity: 2 });

    const all = await listMovements(request, material.id);
    expect(all.total, 'все движения материала').toBe(3);
    // Сортировка по createdAt desc: последним сделали расход — он и первый в выдаче.
    expect(all.items[0].type).toBe('OUT');
    expect(all.items[0].objectId).toBe(objectA);

    const byObject = await listMovements(request, material.id, { objectId: objectA });
    expect(byObject.total, 'по объекту А — два движения').toBe(2);
    expect(byObject.items.every((item) => item.objectId === objectA)).toBe(true);

    const today = utcDate();
    expect((await listMovements(request, material.id, { from: today, to: today })).total).toBe(3);
    expect(
      (await listMovements(request, material.id, { from: utcDate(1) })).total,
      'движений завтра ещё нет',
    ).toBe(0);
    expect(
      (await listMovements(request, material.id, { to: utcDate(-1) })).total,
      'вчера движений не было',
    ).toBe(0);

    // limit ограничивает выдачу, но total считает все подходящие записи.
    const limited = await listMovements(request, material.id, { limit: 1 });
    expect(limited.items).toHaveLength(1);
    expect(limited.total).toBe(3);

    // История несуществующего материала — 404, а не пустой список.
    await expectStatus(
      await materialsMovementsRaw(request, randomUuid()),
      404,
      'история неизвестного материала',
    );
  });
});

/** GET /api/materials/:id/movements «как есть» — для проверки 404. */
function materialsMovementsRaw(request: APIRequestContext, materialId: string) {
  return materialsApi(request, 'get', `/api/materials/${materialId}/movements`);
}

// ---------------------------------------------------------------------------
// Сквозное автосписание М4: заявка → завершение операции → склад
// ---------------------------------------------------------------------------

test.describe('Materials: сквозное автосписание', () => {
  test('завершение операции списывает материалы, шлёт material.low и не дублирует списание', async ({
    request,
  }) => {
    const materialName = `E2E-M47 автосписание ${runTag()}`;
    const fixture = await setupConsumptionFixture(request, {
      materialName,
      stock: 5,
      consumption: 2,
      threshold: 10,
      cost: 100,
    });

    // Получатель broadcast-уведомления material.low: владелец активного устройства.
    // У самого события список получателей пуст (контракт 3.2), поэтому notification-service
    // рассылает всем владельцам активных устройств — своё устройство даёт детерминированного
    // получателя, не зависящего от устройств, оставленных другими наборами.
    const device = deviceToken('m47');
    await trackDevice(request, { token: device, platform: 'android' }, { token: fixture.operatorToken });

    const completion = await completeTicketOperation(
      request,
      fixture.ticketId,
      fixture.operationId,
      { totalOperations: 1 },
      { role: 'OPERATOR', token: fixture.operatorToken },
    );
    await expectStatus(completion, 201, 'завершение операции');
    const result = (await completion.json()) as CompleteOperationResult;
    expect(result.alreadyCompleted, 'первое завершение').toBe(false);
    expect(result.allOperationsCompleted).toBe(true);

    // Автосписание асинхронное (RabbitMQ): ждём движение с автором-системой, а не sleep.
    const auto = await waitForAutoConsumption(request, {
      materialId: fixture.material.id,
      objectId: fixture.objectId,
      ticketId: fixture.ticketId,
    });
    expect(auto.userId).toBe(AUTO_CONSUMPTION_USER_ID);
    expect(auto.quantity, 'списано ровно по норме операции').toBe(2);
    expect(auto.ticketId).toBe(fixture.ticketId);
    expect(auto.objectId).toBe(fixture.objectId);
    // Тип движения. ПЛАН.md (М4.2) и docs/architecture/API_SPECIFICATION.md:92 фиксируют
    // автосписание как `OUT`; в задании М4.7 оно названо `WRITE_OFF`. Проверяем главный
    // инвариант — это РАСХОД (не приход и не перемещение), а расхождение формулировок
    // зафиксировано в отчёте М4.7 для решения главной сессии.
    expect(['OUT', 'WRITE_OFF'], 'автосписание обязано быть расходным движением').toContain(
      auto.type,
    );

    // Остаток уменьшился ровно на норму: 5 − 2 = 3 и ушёл ниже порога 10.
    const stock = await findStock(request, fixture.material.id, fixture.objectId);
    expect(stock?.quantity, 'остаток уменьшен на норму расхода').toBe(3);
    expect(stock?.belowThreshold, 'остаток ниже порога — основание для material.low').toBe(true);

    // Порог: material.low доезжает до notification-service (тоже через RabbitMQ).
    const low = await waitForNotification(
      request,
      { type: 'MATERIAL_LOW', payloadKey: 'materialId', payloadValue: fixture.material.id },
      { token: fixture.operatorToken, timeout: 20_000 },
    );
    expect(low.userId, 'получатель — владелец устройства').toBe(fixture.operatorId);
    expect(low.payload.quantity, 'в событии — остаток ПОСЛЕ списания').toBe(3);
    expect(low.payload.objectId).toBe(fixture.objectId);
    expect(low.body, 'в тексте — название материала').toContain(materialName);

    // Идемпотентность. Повторное завершение той же операции ticket-service помечает
    // alreadyCompleted и НЕ публикует событие повторно (уникальность (ticketId, operationId)),
    // поэтому второго списания быть не должно ни в движениях, ни в таблице идемпотентности.
    const duplicate = await completeTicketOperation(
      request,
      fixture.ticketId,
      fixture.operationId,
      { totalOperations: 1 },
      { role: 'OPERATOR', token: fixture.operatorToken },
    );
    await expectStatus(duplicate, 201, 'повторное завершение операции');
    const duplicateResult = (await duplicate.json()) as CompleteOperationResult;
    expect(duplicateResult.alreadyCompleted, 'повтор идемпотентен').toBe(true);
    expect(duplicateResult.completedAt, 'время завершения не перезаписано').toBe(result.completedAt);

    const afterDuplicate = await listMovements(request, fixture.material.id, {
      objectId: fixture.objectId,
    });
    const autoMovements = afterDuplicate.items.filter(
      (item) => item.userId === AUTO_CONSUMPTION_USER_ID && item.ticketId === fixture.ticketId,
    );
    expect(autoMovements, 'движение автосписания ровно одно').toHaveLength(1);

    if (sqlAvailable()) {
      // Детерминированная проверка идемпотентности: строка `ConsumedOperation` одна.
      const counts = planningCounts({ materialIds: [fixture.material.id] });
      expect(counts.consumed, 'одна запись идемпотентности').toBe(1);
      expect(counts.movements, 'приход + одно списание').toBe(2);
    }

    // Окно тишины: у второго списания нет «события-маркера», которого можно дождаться,
    // поэтому даём отложенной доставке RabbitMQ шанс проявиться и убеждаемся, что склад
    // не поехал. Окно короткое и проверяется не факт, а ОТСУТСТВИЕ изменения.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(
      (await findStock(request, fixture.material.id, fixture.objectId))?.quantity,
      'второго списания не произошло',
    ).toBe(3);
  });

  /**
   * Регрессия находки М4.7 №1: `DELETE /api/materials/:id` обязан уносить и строки
   * идемпотентности автосписания (`ConsumedOperation`).
   *
   * Почему это проверяется через БД, а не через API: `ConsumedOperation` — служебная
   * таблица без единой ручки, и до правки backend она оставалась после удаления
   * материала, потому что внешнего ключа на `Material` у неё нет (`materialId` —
   * строка чужого сервиса) и каскад Prisma её не видел. Следствие было не косметическим:
   * повторно завершить ту же операцию после пересоздания материала уже нельзя —
   * строка «уже списано» осталась бы навсегда.
   *
   * Проверяем не только «ноль у A», но и «не тронут B»: уборка должна быть точечной,
   * иначе DELETE одного материала ломал бы идемпотентность соседнего.
   */
  test('DELETE материала уносит его ConsumedOperation и не трогает строки другого материала', async ({
    request,
  }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    // Материал A — тот, который удаляем: доводим до автосписания, чтобы строка была.
    const first = await setupConsumptionFixture(request, {
      materialName: `E2E-M47 удаление A ${runTag()}`,
      stock: 5,
      consumption: 2,
      threshold: 10,
      cost: 100,
    });
    await consumeFixture(request, first);

    // Материал B — контроль: его строки идемпотентности и движения обязаны пережить удаление A.
    const second = await setupConsumptionFixture(request, {
      materialName: `E2E-M47 удаление B ${runTag()}`,
      stock: 4,
      consumption: 1,
      threshold: 10,
      cost: 50,
    });
    await consumeFixture(request, second);

    // «До»: у обоих есть и движение автосписания, и запись идемпотентности —
    // иначе проверка «после» ничего не доказывала бы.
    const beforeFirst = planningCounts({ materialIds: [first.material.id] });
    const beforeSecond = planningCounts({ materialIds: [second.material.id] });
    expect(beforeFirst.consumed, 'у A есть строка идемпотентности').toBe(1);
    expect(beforeFirst.movements, 'у A приход + автосписание').toBe(2);
    expect(beforeSecond.consumed, 'у B есть строка идемпотентности').toBe(1);
    expect(beforeSecond.movements, 'у B приход + автосписание').toBe(2);

    // Удаление материала с историей автосписания — 204 (контракт DELETE не менялся).
    const removed = await materialsApi(request, 'delete', `/api/materials/${first.material.id}`);
    await expectStatus(removed, 204, 'удаление материала с историей автосписания');

    // «После»: у A не осталось ничего, включая служебную таблицу идемпотентности.
    expect(
      planningCounts({ materialIds: [first.material.id] }),
      'после DELETE у материала не осталось ни строк, ни остатков, ни движений, ни идемпотентности',
    ).toEqual({ schedules: 0, events: 0, materials: 0, stocks: 0, movements: 0, consumed: 0 });

    // ... и B не пострадал: точечная уборка, а не «снести всё».
    const afterSecond = planningCounts({ materialIds: [second.material.id] });
    expect(afterSecond.materials, 'материал B на месте').toBe(1);
    expect(afterSecond.stocks, 'остаток B не удалён').toBe(1);
    expect(afterSecond.movements, 'движения B не тронуты').toBe(2);
    expect(afterSecond.consumed, 'строка идемпотентности B не тронута').toBe(1);
    expect(await findStock(request, second.material.id, second.objectId), 'B доступен по API').not.toBeNull();
    await expectStatus(await getMaterial(request, first.material.id), 404, 'удалённый материал A');
  });
});

// ---------------------------------------------------------------------------
// Чистота набора
// ---------------------------------------------------------------------------

test.describe('М4: уборка', () => {
  test('flush снимает графики, смены, материалы, движения и ConsumedOperation', async ({
    request,
  }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    const operatorId = await loginIdAs(request, 'OPERATOR');
    const object = await trackObject(request, { name: `E2E уборка ${runTag()}` });
    const schedule = await trackSchedule(request, {
      objectId: object.id,
      name: `E2E график уборки ${runTag()}`,
      recurrence: { frequency: 'daily', time: '00:00' },
      assignees: [operatorId],
    });
    await generateForDate(request, utcDate());

    const material = await trackMaterial(request, { name: `E2E материал уборки ${runTag()}` });
    await createMovement(request, {
      materialId: material.id,
      objectId: object.id,
      type: 'IN',
      quantity: 3,
    });
    await createMovement(request, {
      materialId: material.id,
      objectId: object.id,
      type: 'OUT',
      quantity: 1,
    });

    // Дополнительно прогоняем автосписание: `ConsumedOperation` — единственная таблица М4
    // без внешнего ключа и без API, поэтому её уборку проверяем явно.
    const fixture = await setupConsumptionFixture(request, {
      materialName: `E2E-M47 уборка автосписания ${runTag()}`,
      stock: 4,
      consumption: 1,
      threshold: 10,
      cost: 50,
    });
    await completeTicketOperation(
      request,
      fixture.ticketId,
      fixture.operationId,
      { totalOperations: 1 },
      { role: 'OPERATOR', token: fixture.operatorToken },
    );
    await waitForAutoConsumption(request, {
      materialId: fixture.material.id,
      objectId: fixture.objectId,
      ticketId: fixture.ticketId,
    });

    // «До»: строки прогона реально лежат в БД — иначе ноль «после» ничего не доказывал бы.
    const ids = planningTracker.ids();
    expect(ids.scheduleIds, 'график прогона попал в трекер').toContain(schedule.id);
    expect(ids.materialIds, 'материал прогона попал в трекер').toContain(material.id);
    const before = planningCounts(ids);
    expect(before.schedules, 'графики есть').toBeGreaterThan(0);
    expect(before.events, 'смены есть').toBeGreaterThan(0);
    expect(before.materials, 'материалы есть').toBeGreaterThan(0);
    expect(before.movements, 'движения есть').toBeGreaterThan(0);
    expect(before.consumed, 'запись автосписания есть').toBeGreaterThan(0);

    // Уборка ровно тем же путём, что в afterEach.
    flushOperationsData();
    flushPlanningData();

    const after = planningCounts(ids);
    expect(after, 'после уборки не осталось ни одной строки прогона').toEqual({
      schedules: 0,
      events: 0,
      materials: 0,
      stocks: 0,
      movements: 0,
      consumed: 0,
    });

    // Заявки, созданные генерацией, тоже сняты: у ticket-service нет DELETE, уборка SQL-ом.
    await expectStatus(
      await request.get(
        `${process.env.E2E_TICKET_URL ?? 'http://localhost:3005'}/api/tickets/${fixture.ticketId}`,
        { headers: { Authorization: `Bearer ${await loginAs(request, 'ADMIN')}` } },
      ),
      404,
      'заявка автосписания удалена уборкой',
    );
  });

  test('точечная уборка не трогает чужие материалы и графики', async ({ request }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    const operatorId = await loginIdAs(request, 'OPERATOR');
    const kept = await trackMaterial(request, { name: `E2E-M47 чужой материал ${runTag()}` });
    const keptSchedule = await trackSchedule(request, {
      objectId: randomUuid(),
      name: `E2E чужой график ${runTag()}`,
      recurrence: { frequency: 'daily', time: '11:11' },
      assignees: [operatorId],
    });

    // Снимаем ТОЛЬКО материал-«сосед», не зарегистрированный в трекере.
    const transient = await createMaterialViaApi(request, `E2E-M47 временный ${runTag()}`);
    cleanupPlanningData({ materialIds: [transient.id] });

    expect(planningCounts({ materialIds: [transient.id] }).materials).toBe(0);
    expect(
      planningCounts({ materialIds: [kept.id] }).materials,
      'чужой (не упомянутый в уборке) материал не тронут',
    ).toBe(1);
    expect(
      planningCounts({ scheduleIds: [keptSchedule.id] }).schedules,
      'график, не упомянутый в уборке, не тронут',
    ).toBe(1);
  });
});

/** Материал «в обход трекера»: нужен тесту точечной уборки. */
function createMaterialViaApi(request: APIRequestContext, name: string): Promise<Material> {
  return createMaterial(request, { name });
}
