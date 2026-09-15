import { expect, test, type APIRequestContext } from '@playwright/test';
import { createObject, deleteObject, runTag } from '../../helpers/core';
import {
  errorMessage,
  expectStatus,
  flushOperationsData,
  loginIdAs,
  operationsTracker,
  sweepOrphanNotifications,
} from '../../helpers/operations';
import {
  flushPlanningData,
  getScheduleEvent,
  listScheduleEvents,
  postCheckMissedScoped,
  postGenerateScoped,
  trackSchedule,
  utcDate,
  pastUtcTime,
  type GenerationResult,
  type MissedScanSummary,
  type ScheduleEventView,
} from '../../helpers/planning';

/**
 * М4 (задача A2) — e2e СКОУПИНГА расписания: ручные триггеры умеют ограничивать проход
 * одним графиком (`scheduleId`) или ровно одной сменой (`eventId`).
 *
 * Зачем отдельная спека. Раньше `POST /api/schedule/generate` и
 * `POST /api/schedule/check-missed` обрабатывали ВСЁ: на общем стенде параллельные прогоны
 * мешали друг другу, а один ручной проход мог перевести в MISSED чужие смены. Новые
 * необязательные параметры — это контракт, и он обязан быть под постоянной проверкой,
 * а не только под «живьём проверено».
 *
 * Что именно фиксируется:
 *   1) `check-missed?eventId=` обрабатывает ровно указанную смену и НЕ трогает соседнюю
 *      смену того же дня (у графика с двумя исполнителями их две);
 *   2) `check-missed?scheduleId=` обрабатывает только смены своего графика — смена
 *      второго графика того же дня остаётся PLANNED;
 *   3) несуществующий `eventId`/`scheduleId` → 404 (а не «успех с нулями»), вызов без
 *      параметров сохраняет прежнее поведение — проход по всем сменам;
 *   4) `generate?scheduleId=` создаёт смены только по этому графику, несуществующий → 404.
 *
 * ДЕТЕРМИНИРОВАННОСТЬ. Все триггеры вызываются явно (cron на стенде выключен:
 * `SCHEDULE_CRON_ENABLED=false`), «сегодня» берётся в UTC, а время смены — гарантированно
 * прошедшее (`pastUtcTime`), иначе неявки не было бы вовсе. Генерация всегда сужена
 * `scheduleId`, поэтому чужие графики стенда новых смен не получают.
 *
 * УБОРКА. afterEach снимает РОВНО созданное: смены/графики — трекером `helpers/planning.ts`,
 * плановые заявки (их создаёт schedule-service, id тесту неизвестен) и уведомления — по
 * objectId трекером `helpers/operations.ts`, объект core — через API.
 */

test.describe.configure({ timeout: 180_000 });

/** Нижняя граница для уведомлений: всё, что пришло после, — заслуга этого набора. */
const runStartedAt = new Date();

/** Объекты core, созданные набором: удаляются через API (каскадом этажи/маршруты). */
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  // Неявка адресована исполнителю и (broadcast-копией) засеянным ролям — снимаем
  // уведомления этих ролей «по области» (userId + время прогона).
  for (const role of ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const) {
    operationsTracker.notificationSince(await loginIdAs(request, role), runStartedAt);
  }

  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdObjectIds.clear();

  flushOperationsData();
  flushPlanningData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений (гонка с RabbitMQ): один раз на процесс.
  sweepOrphanNotifications();
});

/** Объект core, который набор уберёт за собой (и по которому уберутся его заявки). */
async function trackObject(request: APIRequestContext, name: string) {
  const object = await createObject(request, { name });
  createdObjectIds.add(object.id);
  operationsTracker.object(object.id);
  return object;
}

/** Случайный UUID v4: DTO стенда требуют именно v4, иначе 400 вместо 404. */
function randomUuid(): string {
  const hex = runTag().replace(/[^0-9a-f]/g, '').slice(-12).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/** Статусы смен по id — «после» прохода: сравнивать точечно, а не по всему стенду. */
async function statusById(
  request: APIRequestContext,
  date: string,
  objectId: string,
): Promise<Map<string, ScheduleEventView>> {
  const events = await listScheduleEvents(request, { date, objectId });
  return new Map(events.map((event) => [event.id, event]));
}

/** Две смены одного графика на один день: столько даёт график с двумя исполнителями. */
async function generateTwoShiftSchedule(request: APIRequestContext, objectId: string) {
  const operatorId = await loginIdAs(request, 'OPERATOR');
  const adminId = await loginIdAs(request, 'ADMIN');
  const schedule = await trackSchedule(request, {
    objectId,
    name: `E2E-M4-SCOPE eventId график ${runTag()}`,
    recurrence: { frequency: 'daily', time: pastUtcTime() },
    assignees: [operatorId, adminId],
  });
  return { schedule, operatorId, adminId };
}

// ---------------------------------------------------------------------------
// check-missed: область прохода
// ---------------------------------------------------------------------------

test('check-missed с eventId обрабатывает ровно указанную смену и не трогает соседнюю смену того же дня', async ({
  request,
}) => {
  const date = utcDate();
  const object = await trackObject(request, `E2E-M4-SCOPE eventId ${runTag()}`);
  const { schedule, operatorId, adminId } = await generateTwoShiftSchedule(request, object.id);

  // Генерация сужена scheduleId: чужие графики стенда смен на эту дату не получают.
  const generated = await postGenerateScoped(request, { date, scheduleId: schedule.id });
  await expectStatus(generated, 201, 'генерация по одному графику');
  expect(((await generated.json()) as GenerationResult).shiftsCreated, 'два исполнителя → две смены').toBe(2);

  const events = await listScheduleEvents(request, { date, objectId: object.id });
  expect(events, 'на дату созданы ровно две смены нашего графика').toHaveLength(2);
  expect(new Set(events.map((event) => event.userId))).toEqual(new Set([operatorId, adminId]));
  expect(events.every((event) => event.status === 'PLANNED')).toBe(true);

  const [target, neighbour] = events;

  const scan = await postCheckMissedScoped(request, { eventId: target.id });
  await expectStatus(scan, 201, 'проход по одной смене');
  const summary = (await scan.json()) as MissedScanSummary;
  expect(summary.missed.eventIds, 'обработана ровно указанная смена').toEqual([target.id]);
  expect(summary.missed.scanned, 'область прохода — одна смена, а не весь день').toBe(1);

  const after = await statusById(request, date, object.id);
  expect(after.get(target.id)?.status, 'указанная смена переведена в MISSED').toBe('MISSED');
  expect(
    after.get(neighbour.id)?.status,
    'соседняя смена того же дня осталась PLANNED — проход не задел её',
  ).toBe('PLANNED');
});

test('check-missed с scheduleId обрабатывает только смены своего графика, смены второго остаются PLANNED', async ({
  request,
}) => {
  const date = utcDate();
  const time = pastUtcTime();
  const operatorId = await loginIdAs(request, 'OPERATOR');
  const adminId = await loginIdAs(request, 'ADMIN');
  const object = await trackObject(request, `E2E-M4-SCOPE scheduleId ${runTag()}`);

  const firstSchedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M4-SCOPE scheduleId A ${runTag()}`,
    recurrence: { frequency: 'daily', time },
    assignees: [operatorId],
  });
  const secondSchedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M4-SCOPE scheduleId B ${runTag()}`,
    recurrence: { frequency: 'daily', time },
    assignees: [adminId],
  });

  // Каждый график генерируется своим вызовом: набор не трогает чужие графики.
  for (const schedule of [firstSchedule, secondSchedule]) {
    await expectStatus(
      await postGenerateScoped(request, { date, scheduleId: schedule.id }),
      201,
      `генерация по графику ${schedule.name}`,
    );
  }

  const events = await listScheduleEvents(request, { date, objectId: object.id });
  expect(events, 'у каждого графика своя смена на дату').toHaveLength(2);
  const firstEvent = events.find((event) => event.scheduleId === firstSchedule.id);
  const secondEvent = events.find((event) => event.scheduleId === secondSchedule.id);
  expect(firstEvent && secondEvent, 'обе смены принадлежат разным графикам').toBeTruthy();

  const scan = await postCheckMissedScoped(request, { date, scheduleId: firstSchedule.id });
  await expectStatus(scan, 201, 'проход по одному графику');
  const summary = (await scan.json()) as MissedScanSummary;
  expect(summary.missed.eventIds, 'в проход попала ровно смена своего графика').toEqual([
    firstEvent?.id,
  ]);

  const after = await statusById(request, date, object.id);
  expect(after.get(firstEvent?.id ?? '')?.status, 'смена своего графика — MISSED').toBe('MISSED');
  expect(
    after.get(secondEvent?.id ?? '')?.status,
    'смена второго графика осталась PLANNED — проход её не задел',
  ).toBe('PLANNED');

  // Контроль «до конца»: проход по второму графику закрывает и его смену, и только её.
  const secondScan = await postCheckMissedScoped(request, { date, scheduleId: secondSchedule.id });
  await expectStatus(secondScan, 201, 'проход по второму графику');
  expect(((await secondScan.json()) as MissedScanSummary).missed.eventIds).toEqual([
    secondEvent?.id,
  ]);
});

test('check-missed: несуществующий eventId/scheduleId → 404, без параметров — прежнее поведение', async ({
  request,
}) => {
  const date = utcDate();
  const operatorId = await loginIdAs(request, 'OPERATOR');
  const object = await trackObject(request, `E2E-M4-SCOPE 404 ${runTag()}`);
  const schedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M4-SCOPE 404 график ${runTag()}`,
    recurrence: { frequency: 'daily', time: pastUtcTime() },
    assignees: [operatorId],
  });
  await expectStatus(
    await postGenerateScoped(request, { date, scheduleId: schedule.id }),
    201,
    'генерация по одному графику',
  );

  const events = await listScheduleEvents(request, { date, objectId: object.id });
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.status).toBe('PLANNED');

  // Неизвестный id — 404 с текстом сервиса: опечатка не должна выглядеть как
  // выполненный проход (иначе смены молча остались бы PLANNED).
  const unknownEvent = await postCheckMissedScoped(request, { eventId: randomUuid() });
  await expectStatus(unknownEvent, 404, 'check-missed по неизвестной смене');
  expect(await errorMessage(unknownEvent)).toContain('Смена не найдена');

  const unknownSchedule = await postCheckMissedScoped(request, { scheduleId: randomUuid() });
  await expectStatus(unknownSchedule, 404, 'check-missed по неизвестному графику');
  expect(await errorMessage(unknownSchedule)).toContain('График не найден');

  // Отказ ничего не менял — смена по-прежнему PLANNED.
  expect(
    ((await (await getScheduleEvent(request, event.id)).json()) as ScheduleEventView).status,
    'после 404 смена не тронута',
  ).toBe('PLANNED');

  // Прежнее поведение: без параметров проход идёт по всем сменам, и наша в него попадает.
  const noParams = await postCheckMissedScoped(request);
  await expectStatus(noParams, 201, 'проход без параметров');
  const summary = (await noParams.json()) as MissedScanSummary;
  expect(summary.missed.eventIds, 'проход без параметров обрабатывает и нашу смену').toContain(
    event.id,
  );
  expect(
    ((await (await getScheduleEvent(request, event.id)).json()) as ScheduleEventView).status,
    'смена переведена в MISSED общим проходом',
  ).toBe('MISSED');
});

// ---------------------------------------------------------------------------
// generate: область прохода
// ---------------------------------------------------------------------------

test('generate с scheduleId генерирует смены только по этому графику; несуществующий → 404', async ({
  request,
}) => {
  const date = utcDate();
  const time = pastUtcTime();
  const operatorId = await loginIdAs(request, 'OPERATOR');
  const adminId = await loginIdAs(request, 'ADMIN');
  const object = await trackObject(request, `E2E-M4-SCOPE generate ${runTag()}`);

  const firstSchedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M4-SCOPE generate A ${runTag()}`,
    recurrence: { frequency: 'daily', time },
    assignees: [operatorId],
  });
  const secondSchedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M4-SCOPE generate B ${runTag()}`,
    recurrence: { frequency: 'daily', time },
    assignees: [adminId],
  });

  const scoped = await postGenerateScoped(request, { date, scheduleId: firstSchedule.id });
  await expectStatus(scoped, 201, 'генерация по одному графику');
  const result = (await scoped.json()) as GenerationResult;
  expect(result.date).toBe(date);
  expect(result.schedulesMatched, 'проход ограничен одним графиком').toBe(1);
  expect(result.shiftsCreated, 'создана ровно одна смена').toBe(1);
  expect(result.ticketServiceUnavailable).toBe(false);

  const events = await listScheduleEvents(request, { date, objectId: object.id });
  expect(events, 'смена создана только по запрошенному графику').toHaveLength(1);
  expect(events[0].scheduleId).toBe(firstSchedule.id);
  expect(events[0].userId).toBe(operatorId);
  expect(events[0].ticketId, 'смена связана с плановой заявкой').toBeTruthy();
  expect(
    events.some((event) => event.scheduleId === secondSchedule.id),
    'у второго (активного) графика смен на дату нет — он не входил в проход',
  ).toBe(false);

  const unknown = await postGenerateScoped(request, { date, scheduleId: randomUuid() });
  await expectStatus(unknown, 404, 'генерация по неизвестному графику');
  expect(await errorMessage(unknown)).toContain('График не найден');

  // Отказ не создал ничего: у второго графика смен так и не появилось.
  expect(await listScheduleEvents(request, { date, objectId: object.id })).toHaveLength(1);
});
