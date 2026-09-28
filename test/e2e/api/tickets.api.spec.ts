import { expect, test } from '@playwright/test';
import {
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  completeTicketOperation,
  expectStatus,
  flushOperationsData,
  getTicketDetail,
  listTickets,
  loginIdAs,
  operationsTracker,
  patchTicketStatus,
  sweepOrphanNotifications,
  TICKETS_URL,
  trackTicket,
  type CompleteOperationResult,
  type Ticket,
  type TicketList,
  type TicketStatus,
} from '../../helpers/operations';
import { bodyText, loginAs, runTag } from '../../helpers/core';

/**
 * М3.8 — e2e ticket-service («оперативка»: заявки, state machine, RBAC).
 *
 * Требует запущенного стенда:
 *  - auth-service   :3001 (E2E_API_URL)    — access-токены;
 *  - ticket-service :3005 (E2E_TICKET_URL) — заявки, статусы, назначения, операции;
 *  - PostgreSQL (cleaning-ops-postgres)    — только для уборки своих заявок.
 *
 * Роли — по фактическим правилам контроллера (backend/ticket-service/src/tickets/tickets.controller.ts):
 *  - POST   /api/tickets              — ADMIN, SUPERVISOR, CLIENT (OPERATOR → 403);
 *  - POST   /api/tickets/emergency    — любая аутентифицированная роль (SOS с мобильного);
 *  - PATCH  /:id/status               — ADMIN, SUPERVISOR, OPERATOR;
 *  - POST   /:id/assign               — ADMIN, SUPERVISOR;
 *  - POST   /:id/comments             — без @Roles, то есть любая роль;
 *  - POST   /:id/operations/.../complete — ADMIN, SUPERVISOR, OPERATOR.
 *
 * State machine (shared/types/tickets.ts): new → assigned → in_progress → completed →
 * verified → closed; всё остальное — 400 «Invalid status transition» (текст общий с ядром).
 *
 * Идемпотентность: заявки убираются по id через SQL (у ticket-service нет DELETE),
 * поэтому созданные id складываются в operationsTracker и сносятся в afterEach.
 */

test.describe.configure({ timeout: 180_000 });

/** Свой объект core на прогон: уборка «по объекту» не задевает чужие заявки. */
const objectId = `00000000-0000-4000-8000-${runTag()
  .replace(/[^0-9a-f]/g, '')
  .slice(-12)
  .padStart(12, '0')}`;

/** Начало прогона: нижняя граница для уведомлений, созданных этим набором. */
const runStartedAt = new Date();

test.afterEach(async ({ request }) => {
  // Назначение и завершение операций эмитят события RabbitMQ, поэтому роли-фикстуры
  // получают in-app записи NEW_TICKET. Без этой области каждый прогон набора оставлял бы
  // уведомления на стенде; самих пользователей-фикстур не трогаем (они засеяны seed).
  for (const role of ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const) {
    operationsTracker.notificationSince(await loginIdAs(request, role), runStartedAt);
  }
  flushOperationsData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений: выполняется один раз на процесс
  // и безопасна, если docker недоступен.
  sweepOrphanNotifications();
});

// ---------------------------------------------------------------------------
// Создание, список, деталь
// ---------------------------------------------------------------------------

test.describe('Tickets: создание и чтение', () => {
  test('плановая и внеплановая заявки: статус new, дедлайн реакции, флаги', async ({ request }) => {
    const planned = await trackTicket(request, {
      type: 'planned',
      priority: 'normal',
      objectId,
      description: `E2E плановая ${runTag()}`,
    });

    // Плановая без исполнителя рождается в new и получает таймер реакции (М3.5).
    expect(planned.status).toBe('new');
    expect(planned.type).toBe('planned');
    expect(planned.priority).toBe('normal');
    expect(planned.assigneeId).toBeNull();
    expect(planned.objectId).toBe(objectId);
    expect(planned.reactionDeadline, 'таймер реакции NEW').toBeTruthy();
    expect(new Date(planned.reactionDeadline as string).getTime()).toBeGreaterThan(Date.now());

    const unscheduled = await trackTicket(request, {
      type: 'unscheduled',
      priority: 'high',
      objectId,
      description: `E2E внеплановая ${runTag()}`,
      lat: 55.7558,
      lng: 37.6173,
    });
    expect(unscheduled.status).toBe('new');
    expect(unscheduled.priority).toBe('high');
    expect(unscheduled.lat).toBe(55.7558);

    // Заявка с исполнителем сразу создаётся в assigned (путь schedule-service/М4.4).
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const assignedAtOnce = await trackTicket(request, {
      type: 'planned',
      objectId,
      assigneeId: operatorId,
      description: `E2E сразу назначена ${runTag()}`,
    });
    expect(assignedAtOnce.status).toBe('assigned');
    expect(assignedAtOnce.assigneeId).toBe(operatorId);
    expect(assignedAtOnce.assignedAt).toBeTruthy();
    expect(assignedAtOnce.reactionDeadline).toBeNull();
    expect(assignedAtOnce.arrivalDeadline, 'дедлайн прибытия в assigned').toBeTruthy();
  });

  test('список фильтруется по status/type/objectId и пагинируется, деталь отдаёт связи', async ({
    request,
  }) => {
    const first = await trackTicket(request, {
      type: 'planned',
      objectId,
      description: `E2E фильтр A ${runTag()}`,
    });
    const second = await trackTicket(request, {
      type: 'unscheduled',
      priority: 'critical',
      objectId,
      description: `E2E фильтр B ${runTag()}`,
    });

    const byObject = await listTickets(request, { objectId, take: 100 });
    await expectStatus(byObject, 200, 'список по объекту');
    const objectPage = (await byObject.json()) as TicketList;
    expect(objectPage.total).toBe(2);
    expect(objectPage.items.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());

    const byType = await listTickets(request, { objectId, type: 'unscheduled' });
    const typePage = (await byType.json()) as TicketList;
    expect(typePage.total).toBe(1);
    expect(typePage.items[0].id).toBe(second.id);

    const byPriority = await listTickets(request, { objectId, priority: 'critical' });
    expect(((await byPriority.json()) as TicketList).items.map((i) => i.id)).toEqual([second.id]);

    const byStatus = await listTickets(request, { objectId, status: 'new' });
    expect(((await byStatus.json()) as TicketList).total).toBe(2);

    // take=1 отдаёт ровно одну запись, но total считает все подходящие.
    const paged = await listTickets(request, { objectId, take: 1, skip: 0 });
    const page = (await paged.json()) as TicketList;
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);

    // Деталь: связи (назначения/комментарии/операции) присутствуют и пусты у свежей заявки.
    const detail = await getTicketDetail(request, first.id);
    expect(detail.id).toBe(first.id);
    expect(detail.assignments).toEqual([]);
    expect(detail.comments).toEqual([]);
    expect(detail.operations).toEqual([]);
    expect(detail.operationsCompleted).toBe(0);

    // Фильтр по несуществующему объекту — пустой список, а не 404.
    const empty = await listTickets(request, {
      objectId: '00000000-0000-4000-8000-0000000000bb',
    });
    expect(((await empty.json()) as TicketList).total).toBe(0);

    // Невалидные фильтры отсекаются DTO (значение вне enum).
    await expectStatus(
      await listTickets(request, { status: 'nope' as TicketStatus }),
      400,
      'плохой status',
    );
    await expectStatus(
      await listTickets(request, { priority: 'super-critical' }),
      400,
      'плохой priority',
    );
    // type=emergency — валидное значение enum, просто таких заявок под этим объектом нет.
    expect(
      ((await (await listTickets(request, { objectId, type: 'emergency' })).json()) as TicketList)
        .total,
    ).toBe(0);
  });

  test('без токена → 401, несуществующая заявка → 404', async ({ request }) => {
    // Хелпер listTickets по умолчанию добавляет токен ADMIN: здесь нужен «голый» запрос.
    const anonymous = await request.get(`${TICKETS_URL}/api/tickets`);
    await expectStatus(anonymous, 401, 'список без токена');
    const anonymousQuery = await request.get(
      `${TICKETS_URL}/api/tickets?status=new&objectId=${objectId}`,
    );
    await expectStatus(anonymousQuery, 401, 'список с фильтром без токена');

    const anonymousCreate = await request.post(`${TICKETS_URL}/api/tickets`, {
      data: { type: 'planned', objectId, description: 'аноним' },
    });
    await expectStatus(anonymousCreate, 401, 'создание без токена');

    const ghost = '00000000-0000-4000-8000-0000000000ff';
    const admin = await loginAs(request, 'ADMIN');
    const raw = await request.get(`${TICKETS_URL}/api/tickets/${ghost}`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
    await expectStatus(raw, 404, 'деталь несуществующей заявки');
  });
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

test.describe('Tickets: state machine', () => {
  test('валидная цепочка new → assigned → in_progress → completed → verified → closed', async ({
    request,
  }) => {
    const ticket = await trackTicket(request, { objectId, description: `E2E цепочка ${runTag()}` });
    expect(ticket.status).toBe('new');

    const operatorId = await loginIdAs(request, 'OPERATOR');
    const assigned = await assignTicket(request, ticket.id, operatorId);
    expect(assigned.status(), await bodyText(assigned)).toBe(201);
    expect(((await assigned.json()) as Ticket).assigneeId).toBe(operatorId);

    const transitions: TicketStatus[] = ['in_progress', 'completed', 'verified', 'closed'];
    const seen: TicketStatus[] = [];
    for (const status of transitions) {
      const updated = await changeTicketStatus(request, ticket.id, status);
      seen.push(updated.status);
    }
    expect(seen).toEqual(transitions);

    // Переходы проставляют тайминги жизненного цикла (М3.4).
    const detail = await getTicketDetail(request, ticket.id);
    expect(detail.status).toBe('closed');
    expect(detail.acceptedAt).toBeTruthy();
    expect(detail.arrivedAt).toBeTruthy();
    expect(detail.completedAt).toBeTruthy();
    expect(detail.verifiedAt).toBeTruthy();
    expect(detail.closedAt).toBeTruthy();
    expect(detail.assignments.map((item) => item.assigneeId)).toEqual([operatorId]);

    // closed — терминальный: дальше переходов нет.
    const afterClose = await patchTicketStatus(request, ticket.id, 'in_progress');
    await expectStatus(afterClose, 400, 'переход из closed');
    expect(await bodyText(afterClose)).toContain('Invalid status transition');
  });

  test('невалидные переходы → 400 Invalid status transition, статус не меняется', async ({
    request,
  }) => {
    const ticket = await trackTicket(request, { objectId, description: `E2E отказы ${runTag()}` });

    // new может уйти только в assigned или rejected: закрыть/завершить нельзя.
    for (const status of [
      'closed',
      'completed',
      'verified',
      'in_progress',
      'paused',
    ] as TicketStatus[]) {
      const res = await patchTicketStatus(request, ticket.id, status);
      await expectStatus(res, 400, `new → ${status}`);
      expect(await bodyText(res)).toContain('Invalid status transition');
    }

    // Отказ не сдвинул заявку.
    expect((await getTicketDetail(request, ticket.id)).status).toBe('new');

    // Пропуск шага: assigned → completed минуя in_progress — тоже невалидно.
    await assignTicket(request, ticket.id, await loginIdAs(request, 'OPERATOR'));
    const skip = await patchTicketStatus(request, ticket.id, 'completed');
    await expectStatus(skip, 400, 'assigned → completed');
    expect((await getTicketDetail(request, ticket.id)).status).toBe('assigned');

    // Неизвестный статус отсекается DTO.
    const badEnum = await patchTicketStatus(request, ticket.id, 'nonsense' as TicketStatus);
    await expectStatus(badEnum, 400, 'неизвестный статус');
  });
});

// ---------------------------------------------------------------------------
// Назначение, комментарии
// ---------------------------------------------------------------------------

test.describe('Tickets: назначение и комментарии', () => {
  test('назначение исполнителя пишет историю и переводит в assigned', async ({ request }) => {
    const ticket = await trackTicket(request, {
      objectId,
      description: `E2E назначение ${runTag()}`,
    });
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const supervisorId = await loginIdAs(request, 'SUPERVISOR');

    const first = await assignTicket(request, ticket.id, operatorId);
    expect(first.status(), await bodyText(first)).toBe(201);
    const assigned = (await first.json()) as Ticket;
    expect(assigned.status).toBe('assigned');
    expect(assigned.assigneeId).toBe(operatorId);
    expect(assigned.acceptedAt).toBeTruthy();

    // Смена исполнителя в assigned разрешена — история назначений растёт.
    const second = await assignTicket(request, ticket.id, supervisorId);
    expect(second.status(), await bodyText(second)).toBe(201);

    const detail = await getTicketDetail(request, ticket.id);
    expect(detail.assigneeId).toBe(supervisorId);
    expect(detail.assignments.map((item) => item.assigneeId)).toEqual([operatorId, supervisorId]);

    // Назначить на завершённую заявку нельзя: completed → assigned не разрешён.
    await changeTicketStatus(request, ticket.id, 'in_progress');
    const wrongStatus = await assignTicket(request, ticket.id, operatorId);
    await expectStatus(wrongStatus, 400, 'назначение в in_progress');

    // Пустой assigneeId отсекается DTO.
    const empty = await assignTicket(request, ticket.id, '');
    await expectStatus(empty, 400, 'пустой assigneeId');
  });

  test('комментарий добавляется в деталь заявки; пустой текст → 400', async ({ request }) => {
    const ticket = await trackTicket(request, {
      objectId,
      description: `E2E комментарии ${runTag()}`,
    });
    const text = `Осмотр завершён ${runTag()}`;

    const created = await addTicketComment(request, ticket.id, text);
    expect(created.status(), await bodyText(created)).toBe(201);
    const comment = (await created.json()) as { id: string; text: string; authorId: string };
    expect(comment.text).toBe(text);

    // Комментарий виден в детали и привязан к автору (OPERATOR по умолчанию).
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const detail = await getTicketDetail(request, ticket.id);
    expect(detail.comments.map((item) => item.text)).toEqual([text]);
    expect(detail.comments[0].authorId).toBe(operatorId);

    const empty = await addTicketComment(request, ticket.id, '');
    await expectStatus(empty, 400, 'пустой комментарий');

    const ghost = await addTicketComment(
      request,
      '00000000-0000-4000-8000-0000000000ff',
      'в никуда',
    );
    await expectStatus(ghost, 404, 'комментарий к несуществующей заявке');
  });
});

// ---------------------------------------------------------------------------
// Операции техкарты
// ---------------------------------------------------------------------------

test.describe('Tickets: операции техкарты', () => {
  test('завершение операции идемпотентно: второй вызов alreadyCompleted=true', async ({
    request,
  }) => {
    const ticket = await trackTicket(request, {
      objectId,
      description: `E2E операции ${runTag()}`,
    });
    const operationId = '11111111-1111-4111-8111-111111111111';

    const first = await completeTicketOperation(request, ticket.id, operationId, {
      totalOperations: 2,
    });
    expect(first.status(), await bodyText(first)).toBe(201);
    const firstResult = (await first.json()) as CompleteOperationResult;
    expect(firstResult.alreadyCompleted).toBe(false);
    expect(firstResult.operationId).toBe(operationId);
    expect(firstResult.ticketId).toBe(ticket.id);
    expect(firstResult.objectId).toBe(ticket.objectId);
    expect(firstResult.completedOperations).toBe(1);
    expect(firstResult.operationsTotal).toBe(2);
    expect(firstResult.allOperationsCompleted).toBe(false);

    const second = await completeTicketOperation(request, ticket.id, operationId, {
      totalOperations: 2,
    });
    expect(second.status(), await bodyText(second)).toBe(201);
    const secondResult = (await second.json()) as CompleteOperationResult;
    expect(secondResult.alreadyCompleted, 'повтор не эмитит событие повторно').toBe(true);
    expect(secondResult.completedOperations, 'дубликат не создаётся').toBe(1);
    expect(secondResult.completedAt).toBe(firstResult.completedAt);

    // Вторая операция той же заявки доводит счётчик до плана.
    const third = await completeTicketOperation(
      request,
      ticket.id,
      '22222222-2222-4222-8222-222222222222',
      { totalOperations: 2 },
    );
    const thirdResult = (await third.json()) as CompleteOperationResult;
    expect(thirdResult.completedOperations).toBe(2);
    expect(thirdResult.allOperationsCompleted).toBe(true);

    const detail = await getTicketDetail(request, ticket.id);
    expect(detail.operationsCompleted).toBe(2);
    expect(detail.operations).toHaveLength(2);
  });

  test('операция с requiresPhoto без photoUrl → 400, с photoUrl → 201', async ({ request }) => {
    const ticket = await trackTicket(request, { objectId, description: `E2E фото ${runTag()}` });

    const withoutPhoto = await completeTicketOperation(
      request,
      ticket.id,
      '33333333-3333-4333-8333-333333333333',
      { requiresPhoto: true },
    );
    await expectStatus(withoutPhoto, 400, 'requiresPhoto без photoUrl');
    expect(await bodyText(withoutPhoto)).toContain('фото');

    const withPhoto = await completeTicketOperation(
      request,
      ticket.id,
      '33333333-3333-4333-8333-333333333333',
      { requiresPhoto: true, photoUrl: 'https://minio.local/photos/e2e.jpg' },
    );
    expect(withPhoto.status(), await bodyText(withPhoto)).toBe(201);
    expect(((await withPhoto.json()) as CompleteOperationResult).photoUrl).toContain('e2e.jpg');

    // Завершение операции у несуществующей заявки — 404.
    const ghost = await completeTicketOperation(
      request,
      '00000000-0000-4000-8000-0000000000ff',
      '44444444-4444-4444-8444-444444444444',
    );
    await expectStatus(ghost, 404, 'операция несуществующей заявки');
  });
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

test.describe('Tickets: RBAC по фактическим правилам контроллера', () => {
  test('создание заявки: ADMIN/SUPERVISOR/CLIENT — 201, OPERATOR — 403, без токена — 401', async ({
    request,
  }) => {
    const allowed: Record<'ADMIN' | 'SUPERVISOR' | 'CLIENT', 201> = {
      ADMIN: 201,
      SUPERVISOR: 201,
      CLIENT: 201,
    };

    for (const role of ['ADMIN', 'SUPERVISOR', 'CLIENT'] as const) {
      const token = await loginAs(request, role);
      const res = await request.post(`${TICKETS_URL}/api/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { type: 'planned', objectId, description: `E2E RBAC ${role} ${runTag()}` },
      });
      expect(res.status(), `${role} POST /api/tickets: ${await bodyText(res)}`).toBe(allowed[role]);
      const created = (await res.json()) as Ticket;
      operationsTracker.ticket(created.id);
      expect(created.createdBy).toBeTruthy();
    }

    // OPERATOR создавать обычную заявку не может (только аварийную через /emergency).
    const operator = await loginAs(request, 'OPERATOR');
    const forbidden = await request.post(`${TICKETS_URL}/api/tickets`, {
      headers: { Authorization: `Bearer ${operator}` },
      data: { type: 'planned', objectId, description: 'оператор не может' },
    });
    await expectStatus(forbidden, 403, 'OPERATOR POST /api/tickets');
    expect(await bodyText(forbidden)).toContain('Недостаточно прав');
  });

  test('назначение и смена статуса: OPERATOR не назначает, но двигает статус', async ({
    request,
  }) => {
    const ticket = await trackTicket(request, {
      objectId,
      description: `E2E RBAC ops ${runTag()}`,
    });
    const operator = await loginAs(request, 'OPERATOR');
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const supervisor = await loginAs(request, 'SUPERVISOR');
    const client = await loginAs(request, 'CLIENT');

    // Назначение — только ADMIN/SUPERVISOR.
    const byOperator = await assignTicket(request, ticket.id, operatorId, { token: operator });
    await expectStatus(byOperator, 403, 'OPERATOR assign');
    const byClient = await assignTicket(request, ticket.id, operatorId, { token: client });
    await expectStatus(byClient, 403, 'CLIENT assign');

    const bySupervisor = await assignTicket(request, ticket.id, operatorId, { token: supervisor });
    expect(bySupervisor.status(), await bodyText(bySupervisor)).toBe(201);

    // Статус двигает OPERATOR (мобильный исполнитель), но не CLIENT.
    const clientStatus = await patchTicketStatus(request, ticket.id, 'in_progress', {
      token: client,
    });
    await expectStatus(clientStatus, 403, 'CLIENT смена статуса');

    const operatorStatus = await patchTicketStatus(request, ticket.id, 'in_progress', {
      token: operator,
    });
    expect(operatorStatus.status(), await bodyText(operatorStatus)).toBe(200);

    // Комментарии доступны всем аутентифицированным ролям — без @Roles на обработчике.
    for (const token of [operator, supervisor, client]) {
      const comment = await addTicketComment(request, ticket.id, `комментарий ${runTag()}`, {
        token,
      });
      expect(comment.status(), await bodyText(comment)).toBe(201);
    }
  });

  test('аварийная заявка доступна OPERATOR (SOS с мобильного)', async ({ request }) => {
    const operator = await loginAs(request, 'OPERATOR');
    const res = await request.post(`${TICKETS_URL}/api/tickets/emergency`, {
      headers: { Authorization: `Bearer ${operator}` },
      data: {
        objectId,
        description: `E2E SOS RBAC ${runTag()}`,
        lat: 55.7558,
        lng: 37.6173,
      },
    });
    expect(res.status(), await bodyText(res)).toBe(201);
    const emergency = (await res.json()) as Ticket & { nearbyOperators: unknown[] };
    operationsTracker.ticket(emergency.id);
    operationsTracker.object(emergency.objectId);

    expect(emergency.type).toBe('emergency');
    expect(emergency.priority, 'SOS всегда critical').toBe('critical');
    expect(emergency.status).toBe('new');
    expect(Array.isArray(emergency.nearbyOperators)).toBe(true);

    // Невалидное тело (без координат) отсекается DTO.
    const bad = await request.post(`${TICKETS_URL}/api/tickets/emergency`, {
      headers: { Authorization: `Bearer ${operator}` },
      data: { objectId, description: 'без координат' },
    });
    await expectStatus(bad, 400, 'SOS без координат');
  });
});
