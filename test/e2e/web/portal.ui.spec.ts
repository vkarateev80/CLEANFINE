import { devices, expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { core, createObject, deleteObject, runTag, type Role } from '../../helpers/core';
import {
  createTicket,
  flushOperationsData,
  getTicketDetail,
  listTickets,
  loginIdAs,
  operationsTracker,
  sqlAvailable,
  sweepOrphanNotifications,
  tickets,
  type Ticket,
} from '../../helpers/operations';
import {
  createMovement,
  flushPlanningData,
  getReport,
  planningCounts,
  trackMaterial,
  utcDate,
} from '../../helpers/planning';
import {
  countChats,
  flushChatData,
  searchMessages,
  sendMessage,
  trackDirectChat,
  trackTicketChat,
} from '../../helpers/chat';
import { userByRole } from '../../helpers/users';

/**
 * М5.6 (финал М5) — постоянный UI-набор портала заказчика (`frontend/web-client`, :5174)
 * и сквозной цикл «клиент → менеджер».
 *
 * Проект `web`: файл оканчивается на `.ui.spec.ts`, поэтому его подхватывает тот же
 * проект, что и UI-наборы админки; адрес портала задаётся `E2E_PORTAL_URL` (в CI — :5174),
 * а адрес админки остаётся `baseURL` проекта (`E2E_BASE_URL`, :5173). Портал и админка —
 * два разных приложения, поэтому переходы в портал идут по абсолютному адресу, а в
 * админку — по относительному (см. сквозной тест ниже).
 *
 * Мобильный вьюпорт — дескриптор `iPhone 13` из `@playwright/test` (`test.use`): портал
 * проектировался под телефон (DS-004). Браузер остаётся chromium проекта: у дескриптора
 * iPhone `defaultBrowserType` = webkit, а в наборе установлен только chromium, поэтому
 * переносим только параметры контекста (viewport/screen/DPR/isMobile/hasTouch/UA).
 *
 * ОБЛАСТЬ ВИДИМОСТИ ОБЪЕКТА (задача 4 набора). В auth-service у пользователя нет
 * `objectId`, поэтому портал определяет «свой объект» сопоставлением `Object.clientName`
 * с ФИО/email пользователя (`useObjectScope`). Тесты создают объект клиента с
 * `clientName = fullName` клиента из `fixtures/users.json` («Заказчик»), а «чужой» объект
 * назван так, чтобы сопоставление заведомо не срабатывало (без подстроки «заказчик»).
 * Тест на чужой объект различает ДВЕ разные ветки отказа: `forbidden` («Нет доступа к
 * объекту», чужой `objectId` в URL) и `unassigned` («Объект не подключён», свой объект не
 * найден) — иначе тест «проходил» бы просто потому, что портал вообще ничего не показывает.
 *
 * УБОРКА. Данные помечены префиксом `E2E-M56-` и снимаются в `afterEach`: объекты core —
 * через API, заявки/чаты/материалы — существующими трекерами (`operationsTracker`,
 * `chatTracker`, `planningTracker`). Глобальные счётчики строк нигде не проверяются: только
 * свои id (SQL-подтверждение чистоты — в отчёте по задаче).
 */

const client = userByRole('CLIENT');
const admin = userByRole('ADMIN');

/** Портал заказчика — отдельное приложение (:5174). */
const PORTAL_URL = process.env.E2E_PORTAL_URL ?? 'http://localhost:5174';

/** Админка — `baseURL` проекта `web` (в CI `E2E_BASE_URL` = :5173). */
const ADMIN_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** Параметры мобильного контекста из дескриптора iPhone 13 (без `defaultBrowserType`). */
const iPhone = devices['iPhone 13'];
test.use({
  viewport: iPhone.viewport,
  screen: iPhone.screen,
  deviceScaleFactor: iPhone.deviceScaleFactor,
  isMobile: iPhone.isMobile,
  hasTouch: iPhone.hasTouch,
  userAgent: iPhone.userAgent,
});

/** Десктопный вьюпорт менеджера в админке (тот же дескриптор, что у проекта `web`). */
const desktop = devices['Desktop Chrome'];

// Сквозной тест делает больше навигаций, чем обычный UI-сценарий (портал + админка).
test.describe.configure({ timeout: 120_000 });

/** Объекты core, созданные набором: снимаются через API в afterEach. */
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdObjectIds.clear();
  // Чат-трекер снимает созданные набором чаты (ticket-чат заявки) и свои сообщения;
  // заявки/уведомления — трекер «оперативки», материалы — трекер М4.
  flushChatData();
  flushOperationsData();
  flushPlanningData();
});

test.afterAll(() => {
  sweepOrphanNotifications();
});

// ---------------------------------------------------------------------------
// Общие приёмы
// ---------------------------------------------------------------------------

/** Вход клиентом через форму портала (`portal-login-*`); после входа открыт `/dashboard`. */
async function loginClient(page: Page): Promise<void> {
  await page.goto(`${PORTAL_URL}/login`);
  await page.getByTestId('portal-login-email').fill(client.email);
  await page.getByTestId('portal-login-password').fill(client.password);
  await page.getByTestId('portal-login-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/**
 * Объект клиента с уникальным именем прогона. `clientName` обязан совпасть с ФИО
 * клиента: портал сопоставляет объект именно по этому полю (другой привязки в модели нет).
 */
async function createClientObject(
  request: APIRequestContext,
  label: string,
): Promise<{ id: string; name: string }> {
  const object = await createObject(request, {
    name: `E2E-M56-${label}-${runTag()}`,
    clientName: client.fullName,
  });
  createdObjectIds.add(object.id);
  // Область уборки «по объекту»: снимает заявки на нём, даже если тест упал до их поиска.
  operationsTracker.object(object.id);
  return object;
}

/**
 * Ищет заявку прогона в ticket-service по уникальному маркеру описания (по своим данным,
 * а не по глобальным счётчикам) и ставит её на уборку.
 */
async function findTicketByMarker(
  request: APIRequestContext,
  objectId: string,
  marker: string,
  role: Role,
): Promise<Ticket> {
  const res = await listTickets(request, { objectId, take: 100 }, { role });
  expect(res.status(), `список заявок: ${await res.text()}`).toBe(200);
  const page = (await res.json()) as { items: Ticket[]; total: number };
  const ticket = page.items.find((item) => item.description.includes(marker));
  expect(ticket, `заявка «${marker}» не найдена в tickets-service`).toBeTruthy();
  operationsTracker.ticket(ticket!.id);
  operationsTracker.object(ticket!.objectId);
  return ticket!;
}

/**
 * Число из подписи портала: `formatNumber` даёт русскую локаль (`2,50`) и узкий пробел
 * как разделитель разрядов.
 */
function parsePortalNumber(text: string): number {
  return Number(text.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'));
}

// ---------------------------------------------------------------------------
// 1. Вход клиентом и свой объект
// ---------------------------------------------------------------------------

test('М5.4: вход клиентом открывает dashboard со своим объектом', async ({ page, request }) => {
  const object = await createClientObject(request, 'dashboard');

  await loginClient(page);

  await expect(page.getByTestId('portal-dashboard')).toBeVisible({ timeout: 20_000 });
  // Шапка каркаса: «{clientName} · {objectName}» — подтверждение, что показан СВОЙ объект.
  await expect(page.getByTestId('portal-header-object')).toContainText(object.name);
  await expect(page.getByRole('heading', { name: object.name })).toBeVisible();
  await expect(page.getByText('Открытые заявки')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Чужой объект (область видимости по организации)
// ---------------------------------------------------------------------------

test('М5.4: чужой objectId в URL даёт «Нет доступа к объекту» и не показывает данные чужого объекта', async ({
  page,
  request,
}) => {
  const own = await createClientObject(request, 'scope');
  const foreignTag = runTag();
  // «Чужой» объект: имя и clientName намеренно НЕ содержат подстроки «заказчик», иначе
  // частичное сопоставление (см. useObjectScope) сделало бы его кандидатом в «свои».
  const foreign = await createObject(request, {
    name: `E2E-M56-ЧУЖОЙ-${foreignTag}`,
    clientName: `E2E-M56-ЧУЖОЙ-${foreignTag}`,
    address: 'г. Москва, ул. Чужая, 99',
  });
  createdObjectIds.add(foreign.id);

  await loginClient(page);
  await page.goto(`${PORTAL_URL}/dashboard?objectId=${foreign.id}`);

  const forbidden = page.getByTestId('portal-forbidden');
  await expect(forbidden).toBeVisible({ timeout: 20_000 });
  // Различаем причины отказа: mismatch — «Нет доступа к объекту»; «Объект не подключён» —
  // совсем другая ветка (свой объект не найден), и она НЕ должна срабатывать в этом тесте.
  await expect(forbidden.getByText('Нет доступа к объекту')).toBeVisible();
  await expect(page.getByText('Объект не подключён')).toHaveCount(0);
  // Данных чужого объекта нет ни в тексте, ни в разметке (атрибуты title тоже проверяются).
  const body = await page.locator('body').innerText();
  const html = await page.content();
  for (const secret of [foreign.name, `E2E-M56-ЧУЖОЙ-${foreignTag}`, 'ул. Чужая']) {
    expect(body, `текст страницы не содержит данных чужого объекта: ${secret}`).not.toContain(
      secret,
    );
    expect(html, `разметка не содержит данных чужого объекта: ${secret}`).not.toContain(secret);
  }

  // КОНТРОЛЬ (ключ к пункту 4 задачи): без чужого параметра тот же клиент видит свой объект.
  // Значит, отказ вызван именно чужим id, а не тем, что портал не умеет показывать данные.
  await page.goto(`${PORTAL_URL}/dashboard`);
  await expect(page.getByTestId('portal-dashboard')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('portal-header-object')).toContainText(own.name);
  await expect(page.getByTestId('portal-forbidden')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3. Создание заявки в портале
// ---------------------------------------------------------------------------

test('М5.4: заявка, созданная в портале, появляется в списке и видна через API tickets', async ({
  page,
  request,
}) => {
  const object = await createClientObject(request, 'заявка');
  const marker = `E2E-M56-портал-заявка-${runTag()}`;
  const clientId = await loginIdAs(request, 'CLIENT');

  await loginClient(page);
  await page.goto(`${PORTAL_URL}/tickets`);
  await expect(page.getByTestId('portal-ticket-list')).toBeVisible({ timeout: 20_000 });

  // Проверка «портал видит ИМЕННО наш объект» стоит до создания заявки: скоуп
  // определяется сопоставлением clientName (см. useObjectScope), и чужой объект с
  // подстрокой «заказчик» (например, не убранный предыдущим набором) увёл бы заявку
  // на себя. Без этой проверки падение выглядело бы как «заявка не найдена в
  // tickets-service» и уводило бы от настоящей причины.
  await expect(
    page.getByTestId('portal-header-object'),
    'портал обязан показывать объект ЭТОГО теста (иначе scope перехватил чужой объект)',
  ).toContainText(object.name);

  await page.getByTestId('portal-ticket-create').click();
  const sheet = page.getByTestId('portal-ticket-create-sheet');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('portal-ticket-description').fill(`${marker}: не закрывается дверь`);
  await page.getByTestId('portal-ticket-submit').click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  // Заявка видна в ленте портала…
  await expect(page.getByTestId('portal-ticket-list')).toContainText(marker, { timeout: 20_000 });

  // …и подтверждается API tickets у ТОГО ЖЕ клиента, а не только разметкой.
  const ticket = await findTicketByMarker(request, object.id, marker, 'CLIENT');
  const detail = await getTicketDetail(request, ticket.id, { role: 'CLIENT' });
  expect(detail.createdBy, 'автор заявки — клиент портала').toBe(clientId);
  expect(detail.objectId, 'заявка привязана к объекту клиента').toBe(object.id);
});

// ---------------------------------------------------------------------------
// 4. Отчёты: числовой итог расхода
// ---------------------------------------------------------------------------

test('М5.4: /reports отдаёт числовой итог расхода материалов', async ({ page, request }) => {
  const object = await createClientObject(request, 'отчёт');
  const material = await trackMaterial(request, {
    name: `E2E-M56-материал-${runTag()}`,
    unit: 'л',
    minStockThreshold: 1,
    costPerUnit: 100,
  });
  // Приход нужен, чтобы расход не упирался в 400 «Недостаточно материала».
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: 10,
  });
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'OUT',
    quantity: 2.5,
  });

  // Период задаём ровно «сегодня по UTC» — и в URL портала, и в сверке с API: границы суток
  // совпадают, поэтому расход, созданный сейчас, гарантированно попадает в отчёт.
  const today = utcDate(0);
  const report = await getReport(
    request,
    { objectId: object.id, from: today, to: today },
    { role: 'CLIENT' },
  );
  expect(report.rows.map((row) => row.materialId), 'расход виден в отчёте сервиса').toContain(
    material.id,
  );

  await loginClient(page);
  await page.goto(`${PORTAL_URL}/reports?tab=materials&from=${today}&to=${today}`);
  const materialsTab = page.getByTestId('portal-report-materials');
  await expect(materialsTab).toBeVisible({ timeout: 20_000 });
  await expect(materialsTab).toContainText(material.name, { timeout: 20_000 });

  // Итог по расходу помечен собственным testid (portal-report-total) — проверяем именно
  // его, чтобы тест не зависел от вёрстки строки «Итого».
  const totalValue = materialsTab.getByTestId('portal-report-total');
  await expect(totalValue, 'итог расхода отрисован').toBeVisible({ timeout: 20_000 });
  const total = parsePortalNumber(await totalValue.innerText());
  expect(Number.isFinite(total), 'итог — число').toBe(true);
  expect(total, 'итог портала совпадает с агрегатом material-service').toBeCloseTo(
    report.totals.consumedQuantity,
    2,
  );
});

// ---------------------------------------------------------------------------
// 5. Чат с менеджером
// ---------------------------------------------------------------------------

test('М5.4: сообщение из портала остаётся в ленте и видно второму участнику через REST', async ({
  page,
  request,
}) => {
  const clientId = await loginIdAs(request, 'CLIENT');

  // Прямой чат «клиент ↔ менеджер» (ADMIN). Портал открывает самый свежий DIRECT-чат,
  // поэтому «затравка» от менеджера делает наш чат первым в списке клиента и заодно
  // доказывает, что портал выбрал именно его.
  const chat = await trackDirectChat(request, clientId);
  const seed = `E2E-M56-менеджер-${runTag()}`;
  await sendMessage(request, chat.id, seed);

  await loginClient(page);
  await page.goto(`${PORTAL_URL}/chat`);
  const thread = page.getByTestId('portal-chat-thread');
  await expect(thread).toBeVisible({ timeout: 20_000 });
  await expect(thread).toContainText(seed, { timeout: 20_000 });

  const reply = `E2E-M56-ответ-клиента-${runTag()}`;
  await page.getByTestId('portal-chat-input').fill(reply);
  await page.getByTestId('portal-chat-send').click();
  await expect(thread).toContainText(reply, { timeout: 20_000 });

  // Второй участник (менеджер) видит сообщение через REST chat-service — то есть оно
  // реально сохранено сервером, а не только отрисовано оптимистично в портале.
  const seenByManager = await searchMessages(request, { q: reply, chatId: chat.id });
  expect(seenByManager.items.map((item) => item.text), 'менеджер видит ответ клиента').toContain(
    reply,
  );
  expect(
    seenByManager.items.find((item) => item.text === reply)?.authorId,
    'автор — клиент портала',
  ).toBe(clientId);
});

// ---------------------------------------------------------------------------
// 6. Сквозной цикл «клиент → менеджер» (главный критерий приёмки М5)
// ---------------------------------------------------------------------------

/**
 * Почему цикл собран именно так (условие задачи разрешает проверить роль менеджера через
 * API, но требует, чтобы ответ клиенту пришёл в портал):
 *
 *  1. заявку создаёт КЛИЕНТ в портале (UI) — это начало цикла;
 *  2. менеджер (ADMIN) работает в АДМИНКЕ (UI): видит заявку в `/tickets` с фильтром по
 *     объекту и отвечает в чате заявки (`ticket-chat`) — путь менеджера пройден интерфейсом,
 *     а не API;
 *  3. ответ клиенту в портале проверяется в `portal-chat-thread`. Здесь есть ограничение
 *     продукта, которое набор фиксирует, а не маскирует: портал рендерит ТОЛЬКО DIRECT-чаты
 *     (`ChatPage`/`useChatResolution` фильтруют `type === 'direct'`), поэтому сообщение
 *     TICKET-чата заявки в ленту портала попасть не может. Клиенту в портале доступен
 *     единственный канал — DIRECT-чат с менеджером; в него менеджер и отправляет тот же
 *     ответ (REST chat-service). Дополнительно проверяется, что ответ в чате ЗАЯВКИ доступен
 *     клиенту как участнику заявки (`createdBy`) — через REST.
 */
test('М5.6: клиент создаёт заявку в портале, менеджер отвечает в чате заявки, клиент видит ответ в портале', async ({
  page,
  browser,
  request,
}) => {
  const object = await createClientObject(request, 'цикл');
  const marker = `E2E-M56-цикл-${runTag()}`;
  const clientId = await loginIdAs(request, 'CLIENT');
  const adminId = await loginIdAs(request, 'ADMIN');

  // ── 1. Клиент: заявка через портал (мобильный вьюпорт) ────────────────────
  await loginClient(page);
  await page.goto(`${PORTAL_URL}/tickets`);
  await page.getByTestId('portal-ticket-create').click();
  await page.getByTestId('portal-ticket-description').fill(`${marker}: протекает кран в санузле`);
  await page.getByTestId('portal-ticket-submit').click();
  await expect(page.getByTestId('portal-ticket-create-sheet')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId('portal-ticket-list')).toContainText(marker, { timeout: 20_000 });

  const ticket = await findTicketByMarker(request, object.id, marker, 'CLIENT');
  expect(
    (await getTicketDetail(request, ticket.id, { role: 'CLIENT' })).createdBy,
    'заявку создал клиент портала',
  ).toBe(clientId);

  // Чат заявки создаём ЗАРАНЕЕ (API + трекер уборки): тогда админка открывает уже
  // существующий чат (ChatPanel ищет его в своих), а уборка знает, что удалять.
  const ticketChat = await trackTicketChat(request, ticket.id, {
    title: `${marker} (чат заявки)`,
  });
  const answer = `E2E-M56-ответ-менеджера-${runTag()}`;

  // ── 2. Менеджер: админка, заявка в списке, ответ в чате заявки ─────────────
  // Админка — второе приложение, поэтому ей нужен свой контекст. Десктопные параметры
  // задаются ЯВНО: контексты, созданные через `browser.newContext()`, наследуют опции
  // `use` этого файла (мобильный iPhone), и админка в 390 px ширины ломает клик по строке
  // таблицы (точка клика перехватывается боковым меню/панелью фильтров).
  const adminContext = await browser.newContext({
    // Адрес админки берём из baseURL проекта `web` (тот же E2E_BASE_URL, что в CI).
    baseURL: test.info().project.use.baseURL ?? ADMIN_URL,
    viewport: desktop.viewport,
    screen: desktop.screen,
    deviceScaleFactor: desktop.deviceScaleFactor,
    isMobile: desktop.isMobile,
    hasTouch: desktop.hasTouch,
    userAgent: desktop.userAgent,
  });
  const adminPage = await adminContext.newPage();
  try {
    await adminPage.goto('/login');
    await adminPage.locator('input[name="email"]').fill(admin.email);
    await adminPage.locator('input[name="password"]').fill(admin.password);
    await adminPage.getByRole('button', { name: 'Войти' }).click();
    await expect(adminPage).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

    // Фильтр по объекту: наш объект создан набором, поэтому заявка гарантированно в выдаче.
    await adminPage.goto(`/tickets?objectId=${object.id}`);
    const description = adminPage.getByText(marker).first();
    await expect(description, 'менеджер видит заявку клиента в списке').toBeVisible({
      timeout: 20_000,
    });
    await description.click({ timeout: 15_000 });
    await expect(adminPage).toHaveURL(new RegExp(`/tickets/${ticket.id}$`), { timeout: 20_000 });

    const managerChat = adminPage.getByTestId('ticket-chat');
    await expect(managerChat, 'в карточке заявки есть чат заявки').toBeVisible({
      timeout: 20_000,
    });
    await managerChat.getByTestId('messages-input').fill(answer);
    await managerChat.getByTestId('messages-send').click();
    await expect(
      managerChat.getByTestId('messages-thread'),
      'ответ ушёл в чат заявки',
    ).toContainText(answer, { timeout: 20_000 });
  } finally {
    await adminContext.close();
  }

  // Ответ в чате ЗАЯВКИ адресован клиенту: он участник заявки (`createdBy`) и читает
  // сообщение через REST chat-service (в портале этот чат не рендерится — см. комментарий).
  const asClient = await searchMessages(
    request,
    { q: answer, chatId: ticketChat.id },
    { role: 'CLIENT' },
  );
  expect(asClient.items.map((item) => item.text), 'ответ менеджера доступен клиенту').toContain(
    answer,
  );
  expect(
    asClient.items.find((item) => item.text === answer)?.authorId,
    'автор ответа — менеджер',
  ).toBe(adminId);

  // ── 3. Клиент видит ответ менеджера в портале ─────────────────────────────
  const direct = await trackDirectChat(request, clientId);
  await sendMessage(request, direct.id, answer);
  await page.goto(`${PORTAL_URL}/chat`);
  const thread = page.getByTestId('portal-chat-thread');
  await expect(thread).toBeVisible({ timeout: 20_000 });
  await expect(thread, 'ответ менеджера виден клиенту в портале').toContainText(answer, {
    timeout: 20_000,
  });
});

// ---------------------------------------------------------------------------
// 7. Уборка
// ---------------------------------------------------------------------------

test('уборка: объект, заявка, чат и материал прогона сняты', async ({ request }) => {
  test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

  const object = await createClientObject(request, 'уборка');
  const material = await trackMaterial(request, { name: `E2E-M56-уборка-${runTag()}` });
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: 3,
  });
  const marker = `E2E-M56-уборка-заявка-${runTag()}`;
  const created = await createTicket(request, {
    objectId: object.id,
    description: `${marker}: проверка уборки набора портала`,
    role: 'CLIENT',
  });
  operationsTracker.ticket(created.id);
  const ticketChat = await trackTicketChat(request, created.id);
  await sendMessage(request, ticketChat.id, `E2E-M56-уборка-сообщение-${runTag()}`);

  // «До»: строки прогона реально лежат в сервисах — иначе ноль «после» ничего не доказывал бы.
  expect((await getTicketDetail(request, created.id, { role: 'ADMIN' })).id).toBe(created.id);
  expect(countChats([ticketChat.id]), 'чат прогона есть в БД').toBe(1);
  expect(planningCounts({ materialIds: [material.id] }).materials).toBe(1);

  // Уборка тем же путём, что и в afterEach.
  flushChatData();
  flushOperationsData();
  flushPlanningData();
  await deleteObject(request, object.id);
  createdObjectIds.delete(object.id);

  expect(countChats([ticketChat.id]), 'чат прогона удалён').toBe(0);
  expect(
    (await tickets(request, 'get', `/api/tickets/${created.id}`, { role: 'ADMIN' })).status(),
    'заявка прогона удалена',
  ).toBe(404);
  expect(
    planningCounts({ materialIds: [material.id] }),
    'материал прогона удалён',
  ).toEqual({ schedules: 0, events: 0, materials: 0, stocks: 0, movements: 0, consumed: 0 });
  expect(
    (await core(request, 'get', `/api/objects/${object.id}`)).status(),
    'объект прогона удалён',
  ).toBe(404);
});
