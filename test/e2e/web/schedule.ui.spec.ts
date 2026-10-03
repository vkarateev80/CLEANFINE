import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createFloor, createObject, createRoute, deleteObject, runTag } from '../../helpers/core';
import {
  flushOperationsData,
  loginIdAs,
  operationsTracker,
  sqlAvailable,
  sweepOrphanNotifications,
} from '../../helpers/operations';
import {
  flushPlanningData,
  generateForDate,
  getSchedule,
  listScheduleEvents,
  listSchedules,
  planningCounts,
  planningTracker,
  trackSchedule,
  utcDate,
} from '../../helpers/planning';
import { userByRole } from '../../helpers/users';

/**
 * М4.7 — UI-спека экрана «Графики и смены» (М4.6) в web-admin.
 *
 * Проверяется интерфейс, а не контракт API (контракты закрыты
 * `e2e/api/planning.api.spec.ts`):
 *   1) три вкладки и их состояние в query-строке: deep-link `?tab=my&myFrom=…`
 *      обязан восстанавливать период, а не открывать вкладку «Графики»;
 *   2) создание ежедневного графика через модалку → строка в таблице с правилом
 *      повторения, объектом и активностью;
 *   3) клиентская валидация `weekly` без отмеченных дней: форма НЕ отправляется,
 *      пользователь видит текст ошибки (заведомо неверный запрос не уходит на сервер);
 *   4) ADMIN видит и может нажать ручную генерацию; смены появляются в таблице дня,
 *      а в баннере виден ответ сервера (сводка прохода), а не клиентский пересказ;
 *   5) удаление графика через ConfirmDialog → строка исчезает и график пропадает из API;
 *   6) «Мои смены» по deep-link: своя смена видна, модалка отметки открывается.
 *
 * Требуется web-admin на :5175 (vite dev проксирует `/api` на :3008 — schedule-service,
 * :3003 — core, :3001 — auth) и schedule-service :3008; вход — под ADMIN.
 *
 * ДЕТЕРМИНИРОВАННОСТЬ (важно для соседних наборов):
 *  - дата генерации — сегодня+45 в UTC, а НЕ «сегодня»: `planning.api.spec.ts` работает
 *    с текущим днём, и две спеки не должны видеть смены друг друга;
 *  - частота `daily`, поэтому выбранная дата подходит при любом дне недели;
 *  - никаких «в таблице ровно N строк»: в БД могут быть данные других прогонов, поэтому
 *    своя строка ищется по уникальному имени (`E2E-M47-UI-SCHED-<runTag>`) и по id из API.
 *
 * УБОРКА. График снимается через API (`DELETE /api/schedule/:id`, смены — каскадом) или
 * самим тестом через UI; на случай падения id лежит в `planningTracker`, поэтому
 * afterEach снесёт его SQL-ом. Плановые заявки, созданные генерацией, удаляются
 * трекером «оперативки» по objectId (`operationsTracker.object`), а объект core —
 * через API. `check-missed` НЕ нажимается: его проход помимо даты закрывает «зависшие»
 * смены по всем дням, а это затронуло бы данные других сессий на общем стенде.
 */

/** Объекты core, созданные набором: удаляются через API (каскадом этажи/помещения). */
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdObjectIds.clear();
  flushOperationsData();
  flushPlanningData();
});

test.afterAll(() => {
  sweepOrphanNotifications();
});

const admin = userByRole('ADMIN');

/** Дата генерации: далеко в будущем, чтобы не пересечься с наборами про «сегодня». */
const FUTURE_DATE = utcDate(45);

/** Вход через форму логина: сценарий начинается с настоящей аутентификации. */
async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** Экран «Графики и смены» под ADMIN: вход при необходимости + переход по ссылке. */
async function openSchedule(page: Page, query = ''): Promise<void> {
  if (!/\/dashboard|\/schedule/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page, admin.email, admin.password);
  }
  await page.goto(`/schedule${query}`);
}

/** Объект core «на прогон»: заявки, созданные генерацией, убираются по его id. */
async function createTrackedObject(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string }> {
  const object = await createObject(request, { name });
  createdObjectIds.add(object.id);
  operationsTracker.object(object.id);
  return { id: object.id, name: object.name };
}

/** Ждёт появления опции в `<select>`, чьи значения приходят с сервера. */
async function selectServerOption(page: Page, testId: string, value: string): Promise<void> {
  const select = page.getByTestId(testId);
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1, { timeout: 15_000 });
  await select.selectOption(value);
}

// ---------------------------------------------------------------------------
// Вкладки и query-строка
// ---------------------------------------------------------------------------

test('три вкладки переключаются и сохраняются в query-строке (deep-link восстанавливает состояние)', async ({
  page,
}) => {
  await openSchedule(page);

  // Вкладка по умолчанию — «Графики», и она не засоряет ссылку параметром.
  await expect(page.getByTestId('schedule-search')).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).searchParams.get('tab')).toBeNull();

  await page.getByTestId('schedule-tab-day').click();
  await expect(page).toHaveURL(/tab=day/);
  await expect(page.getByTestId('events-date')).toBeVisible();
  // Перезагрузка возвращает ту же вкладку: ссылку можно передать коллеге.
  await page.reload();
  await expect(page.getByTestId('events-date')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('schedule-tab-day')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('schedule-tab-my').click();
  await expect(page).toHaveURL(/tab=my/);
  await expect(page.getByTestId('my-from')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('my-from')).toBeVisible({ timeout: 20_000 });

  // Deep-link: период из адресной строки попадает в поля, а не подменяется «сегодня».
  await openSchedule(page, `?tab=my&myFrom=${FUTURE_DATE}&myTo=${FUTURE_DATE}`);
  await expect(page.getByTestId('my-from')).toHaveValue(FUTURE_DATE);
  await expect(page.getByTestId('my-to')).toHaveValue(FUTURE_DATE);
  await expect(page.getByTestId('schedule-tab-my')).toHaveAttribute('aria-selected', 'true');

  // Возврат в «Графики» убирает параметр: вкладка по умолчанию не должна его оставлять.
  await page.getByTestId('schedule-tab-list').click();
  await expect(page.getByTestId('schedule-search')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
});

// ---------------------------------------------------------------------------
// Создание графика через модалку
// ---------------------------------------------------------------------------

test('создание ежедневного графика через модалку: строка появляется в таблице', async ({
  page,
  request,
}) => {
  const name = `E2E-M47-UI-SCHED-${runTag()}`;
  const object = await createTrackedObject(request, `E2E-M47-UI-SCHED объект ${runTag()}`);
  const adminId = await loginIdAs(request, 'ADMIN');

  await openSchedule(page);
  await page.getByTestId('schedule-create-button').click();
  await expect(page.getByTestId('schedule-form')).toBeVisible();

  // Поля формы повторяют CreateScheduleDto: название, объект, частота, время (UTC), исполнители.
  await page.getByTestId('schedule-name').fill(name);
  await selectServerOption(page, 'schedule-object', object.id);
  await page.getByTestId('schedule-frequency').selectOption('daily');
  await page.getByTestId('schedule-time').fill('06:30');
  await page.getByTestId('schedule-assignee-' + adminId).check();
  await expect(page.getByTestId('schedule-active')).toBeChecked();
  await page.getByTestId('schedule-submit').click();

  // Модалка закрывается только после успешного сохранения.
  await expect(page.getByTestId('schedule-form')).toBeHidden({ timeout: 20_000 });

  // Поиск на клиенте по уникальному имени оставляет ровно нашу строку — так тест
  // не зависит от того, какие ещё графики лежат на стенде.
  await page.getByTestId('schedule-search').fill(name);
  const row = page.locator('[data-testid^="schedule-row-"]');
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  const scheduleId = ((await row.first().getAttribute('data-testid')) ?? '').replace(
    'schedule-row-',
    '',
  );
  expect(scheduleId, 'id графика читается из data-testid строки').toMatch(/^[0-9a-f-]{36}$/);
  planningTracker.schedule(scheduleId);

  // Строка показывает правило повторения по-русски, объект и активность.
  // Хук `schedule-row-<id>` после адаптивного рефакторинга живёт в ячейке названия
  // (см. `TableOnlyTestId`), поэтому остальные колонки читаем у строки таблицы-предка.
  const rowCells = row.first().locator('xpath=ancestor::tr');
  await expect(rowCells).toContainText(name);
  await expect(rowCells).toContainText('Ежедневно · 06:30 UTC');
  await expect(rowCells).toContainText(object.name);
  await expect(rowCells).toContainText('Активен');

  // И то же самое на сервере: форма отправила именно daily/06:30 и наш объект.
  const saved = (await listSchedules(request)).find((item) => item.id === scheduleId);
  expect(saved, 'график сохранён сервером').toBeTruthy();
  expect(saved?.recurrence.frequency).toBe('daily');
  expect(saved?.recurrence.time).toBe('06:30');
  expect(saved?.objectId).toBe(object.id);
  expect(saved?.assignees).toContain(adminId);
  expect(saved?.isActive).toBe(true);
});

test('маршрут графика выбирается из селекта и сохраняется (routeId виден в API)', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const name = `E2E-M47-UI-SCHED маршрут ${tag}`;
  const object = await createTrackedObject(request, `E2E-M47-UI-SCHED маршрут ${tag}`);
  const routeFloor = await createFloor(request, object.id, { number: 1, name: 'Этаж 1' });
  const route = await createRoute(request, routeFloor.id, {
    name: `E2E-M47-UI-SCHED маршрут этажа ${tag}`,
  });
  // Второй объект — контроль: его маршрут в селект не попадает, потому что список
  // маршрутов сужен объектом графика СЕРВЕРНЫМ фильтром (`GET /api/routes?objectId=`),
  // а не фильтрацией уже загруженной сотни на клиенте.
  const foreignObject = await createTrackedObject(request, `E2E-M47-UI-SCHED чужой объект ${tag}`);
  const foreignFloor = await createFloor(request, foreignObject.id, { number: 1 });
  const foreignRoute = await createRoute(request, foreignFloor.id, {
    name: `E2E-M47-UI-SCHED чужой маршрут ${tag}`,
  });
  const adminId = await loginIdAs(request, 'ADMIN');

  await openSchedule(page);
  await page.getByTestId('schedule-create-button').click();
  await expect(page.getByTestId('schedule-form')).toBeVisible();
  await page.getByTestId('schedule-name').fill(name);

  // Селект «Маршрут» грузится с сервера: сначала выбираем объект графика, затем —
  // маршрут этого объекта (опция появляется только после ответа core-service).
  await selectServerOption(page, 'schedule-object', object.id);
  await selectServerOption(page, 'schedule-route', route.id);
  await expect(
    page.getByTestId('schedule-route').locator(`option[value="${foreignRoute.id}"]`),
    'маршрут чужого объекта в селекте отсутствует',
  ).toHaveCount(0);

  await page.getByTestId('schedule-frequency').selectOption('daily');
  await page.getByTestId('schedule-time').fill('06:45');
  await page.getByTestId('schedule-assignee-' + adminId).check();
  await page.getByTestId('schedule-submit').click();
  await expect(page.getByTestId('schedule-form')).toBeHidden({ timeout: 20_000 });

  await page.getByTestId('schedule-search').fill(name);
  const row = page.locator('[data-testid^="schedule-row-"]');
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  const scheduleId = ((await row.first().getAttribute('data-testid')) ?? '').replace(
    'schedule-row-',
    '',
  );
  planningTracker.schedule(scheduleId);

  // Главное: выбранный в селекте маршрут действительно уехал на сервер и сохранён.
  const savedRes = await getSchedule(request, scheduleId);
  expect(savedRes.status()).toBe(200);
  const saved = (await savedRes.json()) as { objectId: string | null; routeId: string | null };
  expect(saved.objectId).toBe(object.id);
  expect(saved.routeId, 'выбранный маршрут сохранён в графике').toBe(route.id);
});

test('weekly без отмеченных дней: форма не отправляется и показывает текст ошибки', async ({
  page,
  request,
}) => {
  const name = `E2E-M47-UI-SCHED weekly ${runTag()}`;
  const adminId = await loginIdAs(request, 'ADMIN');

  await openSchedule(page);
  await page.getByTestId('schedule-create-button').click();
  await expect(page.getByTestId('schedule-form')).toBeVisible();

  await page.getByTestId('schedule-name').fill(name);
  await page.getByTestId('schedule-frequency').selectOption('weekly');
  // Дни недели появляются только для weekly — это тоже часть контракта формы.
  const days = page.getByTestId('schedule-days');
  await expect(days).toBeVisible();
  await page.getByTestId('schedule-time').fill('09:00');
  // Исполнителя отмечаем, чтобы ошибка была ровно одна — про дни.
  await page.getByTestId('schedule-assignee-' + adminId).check();
  await page.getByTestId('schedule-submit').click();

  // Заведомо неверный запрос не уходит на сервер: виден текст клиентской проверки,
  // и модалка остаётся открытой (иначе пользователь не поймёт, что не сохранилось).
  await expect(days).toContainText('Для недельного графика отметьте хотя бы один день');
  await expect(page.getByTestId('schedule-form')).toBeVisible();

  // И на сервере графика с таким именем нет — проверяем факт, а не только вёрстку.
  const created = (await listSchedules(request)).filter((item) => item.name === name);
  expect(created, 'график без дней на сервере не создан').toHaveLength(0);

  // Отмечаем день — ошибка снимается, форма готова к отправке.
  await page.getByTestId('schedule-days-2').check();
  await expect(days).not.toContainText('Для недельного графика отметьте хотя бы один день');
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('schedule-form')).toBeHidden();
});

// ---------------------------------------------------------------------------
// Смены дня: ручная генерация
// ---------------------------------------------------------------------------

test('ADMIN видит ручные триггеры; генерация создаёт смену и показывает сводку сервера', async ({
  page,
  request,
}) => {
  const name = `E2E-M47-UI-SCHED генерация ${runTag()}`;
  const object = await createTrackedObject(request, `E2E-M47-UI-SCHED генерация ${runTag()}`);
  const adminId = await loginIdAs(request, 'ADMIN');
  const schedule = await trackSchedule(request, {
    objectId: object.id,
    name,
    recurrence: { frequency: 'daily', time: '07:00' },
    assignees: [adminId],
  });

  await openSchedule(page, '?tab=day');

  // Обе ручные кнопки доступны ADMIN (@Roles('ADMIN') на /generate и /check-missed).
  await expect(page.getByTestId('events-generate-button')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('events-check-missed-button')).toBeVisible();

  // Дату выбираем далеко в будущем: генерация на «сегодня» мешала бы API-набору.
  await page.getByTestId('events-date').fill(FUTURE_DATE);
  await expect(page.getByTestId('events-date')).toHaveValue(FUTURE_DATE);

  await page.getByTestId('events-generate-button').click();

  // Баннер `schedule-notice` показывает сводку, полученную от сервиса.
  const notice = page.getByTestId('schedule-notice');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('создано смен');
  await expect(notice).toContainText(FUTURE_DATE);

  // Смена видна в таблице дня. id берём из API: строка адресуется им же.
  const events = await listScheduleEvents(request, { date: FUTURE_DATE, objectId: object.id });
  expect(events, 'генерация создала ровно одну смену по нашему графику').toHaveLength(1);
  const event = events[0];
  expect(event.scheduleId).toBe(schedule.id);
  await expect(page.getByTestId(`event-row-${event.id}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`event-status-${event.id}`)).toContainText('Запланирована');
  // Ссылка на плановую заявку привязана к смене (ticketId проставил schedule-service).
  expect(event.ticketId, 'у смены есть плановая заявка').toBeTruthy();

  // Блок состояния планировщика раскрывается по кнопке. Его содержимое НЕ проверяем:
  // на стенде cron выключен (`SCHEDULE_CRON_ENABLED=false`), и отметки проходов пусты —
  // это ожидаемое состояние, а не предмет проверки интерфейса.
  await page.getByRole('button', { name: 'Состояние планировщика' }).click();
  await expect(page.getByTestId('scheduler-state')).toBeVisible({ timeout: 20_000 });
});

// ---------------------------------------------------------------------------
// Мои смены и модалка отметки
// ---------------------------------------------------------------------------

test('«Мои смены» по deep-link: своя смена видна, модалка отметки открывается', async ({
  page,
  request,
}) => {
  const object = await createTrackedObject(request, `E2E-M47-UI-SCHED мои ${runTag()}`);
  const adminId = await loginIdAs(request, 'ADMIN');
  const schedule = await trackSchedule(request, {
    objectId: object.id,
    name: `E2E-M47-UI-SCHED мои ${runTag()}`,
    recurrence: { frequency: 'daily', time: '05:00' },
    assignees: [adminId],
  });

  await openSchedule(page, `?tab=my&myFrom=${FUTURE_DATE}&myTo=${FUTURE_DATE}`);

  // Смену создаём генерацией через API: предмет проверки здесь — интерфейс «Моих смен»,
  // а не кнопка генерации (она закрыта отдельным тестом).
  await generateForDate(request, FUTURE_DATE);
  await page.reload();

  const events = await listScheduleEvents(request, {
    date: FUTURE_DATE,
    objectId: object.id,
    userId: adminId,
  });
  expect(events).toHaveLength(1);
  const event = events[0];

  // Смена текущего пользователя (ADMIN указан исполнителем) видна на вкладке.
  await expect(page.getByTestId(`my-event-row-${event.id}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`my-event-status-${event.id}`)).toContainText('Запланирована');

  // Кнопка отметки в строке выбирает смену и открывает модалку: поля координат и
  // кнопка подтверждения на месте. Саму отметку не отправляем — для неё нужна геозона
  // (это проверяет API-набор), а здесь важен именно переход «строка → модалка».
  await page.getByTestId(`my-checkin-${event.id}`).click();
  await expect(page.getByTestId('checkin-lat')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('checkin-lng')).toBeVisible();
  await expect(page.getByTestId('checkin-submit')).toBeVisible();

  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('checkin-lat')).toBeHidden();

  // Выбранная смена закреплена в query-строке — ссылка воспроизводит состояние.
  expect(new URL(page.url()).searchParams.get('myEvent')).toBe(event.id);
  expect(schedule.id).toBe(event.scheduleId);
});

// ---------------------------------------------------------------------------
// Удаление
// ---------------------------------------------------------------------------

test('удаление графика через ConfirmDialog: строка исчезает и график пропадает из API', async ({
  page,
  request,
}) => {
  const name = `E2E-M47-UI-SCHED удаление ${runTag()}`;
  const adminId = await loginIdAs(request, 'ADMIN');
  const schedule = await trackSchedule(request, {
    name,
    recurrence: { frequency: 'daily', time: '11:00' },
    assignees: [adminId],
  });

  await openSchedule(page);
  await page.getByTestId('schedule-search').fill(name);
  const row = page.locator(`[data-testid="schedule-row-${schedule.id}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });

  // Удаление требует подтверждения: строка исчезает только после «Удалить» в диалоге.
  await page.getByTestId(`schedule-delete-${schedule.id}`).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить график?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(name);
  await dialog.getByRole('button', { name: 'Удалить' }).click();

  await expect(row).toBeHidden({ timeout: 20_000 });
  // Список после удаления пуст по нашему фильтру — панель показывает исходное состояние.
  await expect(page.getByText('Графиков пока нет')).toBeVisible({ timeout: 20_000 });

  // И на сервере графика больше нет: 404, а не пустая строка в списке.
  expect((await getSchedule(request, schedule.id)).status()).toBe(404);
  expect((await listSchedules(request)).some((item) => item.id === schedule.id)).toBe(false);
});

// ---------------------------------------------------------------------------
// Уборка
// ---------------------------------------------------------------------------

test('уборка: после снятия графика в БД не остаётся ни графика, ни его смен', async ({
  page,
  request,
}) => {
  // Тест тяжёлый (генерация смен + несколько SQL-срезов через docker): на загруженной
  // машине дефолтные 30 с истекали на входе в UI, и Playwright обрывал fill на логине.
  test.setTimeout(120_000);
  test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

  const name = `E2E-M47-UI-SCHED уборка ${runTag()}`;
  const object = await createTrackedObject(request, `E2E-M47-UI-SCHED уборка ${runTag()}`);
  const adminId = await loginIdAs(request, 'ADMIN');
  const schedule = await trackSchedule(request, {
    objectId: object.id,
    name,
    recurrence: { frequency: 'daily', time: '04:00' },
    assignees: [adminId],
  });

  await generateForDate(request, FUTURE_DATE);

  // «До»: и график, и смена прогона лежат в БД, иначе ноль «после» ничего не доказывал бы.
  const before = planningCounts({ scheduleIds: [schedule.id] });
  expect(before.schedules, 'график есть').toBe(1);
  expect(before.events, 'смена создана').toBeGreaterThan(0);

  await openSchedule(page);
  await page.getByTestId('schedule-search').fill(name);
  await expect(page.locator(`[data-testid="schedule-row-${schedule.id}"]`)).toBeVisible({
    timeout: 20_000,
  });

  // Уборка тем же путём, что и в afterEach.
  flushOperationsData();
  flushPlanningData();

  expect(
    planningCounts({ scheduleIds: [schedule.id] }),
    'после уборки не осталось ни графика, ни смен',
  ).toEqual({ schedules: 0, events: 0, materials: 0, stocks: 0, movements: 0, consumed: 0 });

  // Экран после перезапроса больше не показывает строку.
  await page.reload();
  await expect(page.locator(`[data-testid="schedule-row-${schedule.id}"]`)).toBeHidden({
    timeout: 20_000,
  });
});
