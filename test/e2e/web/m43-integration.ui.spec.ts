import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  addOperation,
  bodyText,
  core,
  createObject,
  createTechCard,
  deleteObject,
  deleteTechCard,
  loginAs,
  runTag,
} from '../../helpers/core';
import {
  flushOperationsData,
  sqlAvailable,
  sweepOrphanNotifications,
  trackTicket,
} from '../../helpers/operations';
import {
  createMovement,
  flushPlanningData,
  listMovements,
  planningCounts,
  trackMaterial,
} from '../../helpers/planning';
import { userByRole } from '../../helpers/users';

/**
 * М4.7 — UI-интеграция трёх пунктов М4.3, которые раньше не были реализованы:
 *
 *  1. **Материал операции техкарты выбирается из справочника material-service**
 *     (`OperationFormModal`): серверный поиск, подстановка единицы и нормы расхода
 *     из справочника, ручной расход не затирается повторным выбором, а legacy-id
 *     (материала нет в справочнике) остаётся выбранным и сохраняется как есть.
 *     Это закрывает интеграционную точку М2.6 («выбор материала в техкарте
 *     валидируется по справочнику»);
 *  2. **Необязательная заявка в движении материала** (`MovementModal`): поле
 *     «Заявка» есть только у расходных типов `OUT`/`WRITE_OFF`, и `ticketId`
 *     уходит в payload только тогда, когда поле реально показано и выбрано
 *     (иначе в истории появилась бы привязка, которой пользователь не делал);
 *  3. **Поиск заявки по подстроке описания** (`movement-ticket-search`): поле рядом
 *     с селектом сужает СЕРВЕРНУЮ выдачу (`ListTicketsQueryDto.search`), поэтому
 *     нужная заявка находится, даже если её нет среди последних 50, а выбранная
 *     заявка попадает в `ticketId` движения.
 *
 * Почему отдельный файл, а не расширение `materials.ui.spec.ts`: проверяется связка
 * ДВУХ экранов (техкарты ↔ справочник материалов) плюс движение с заявкой; в наборе
 * «Материалы» эти сценарии размыли бы предмет проверки. `core.ui.spec.ts` не трогаю —
 * он про ядро домена М2.7.
 *
 * Требуется web-admin :5175 (vite проксирует `/api` на :3001 auth, :3003 core,
 * :3005 tickets, :3007 materials), core-service :3003, material-service :3007,
 * ticket-service :3005 и PostgreSQL (уборка + SQL-проверки).
 *
 * ДАННЫЕ. Материалы, техкарты и заявки создаются через API с уникальным префиксом
 * прогона (`E2E-M43-<tag>`), поэтому набор не зависит от того, что уже лежит на стенде.
 * Уборка — в afterEach: материалы/движения (SQL трекером М4), техкарты и объекты (API),
 * заявки и уведомления (`operationsTracker`).
 */

const admin = userByRole('ADMIN');

/** Техкарты и объекты core, созданные набором: удаляются через API. */
const createdTechCardIds = new Set<string>();
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const cardId of createdTechCardIds) {
    await deleteTechCard(request, cardId);
  }
  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdTechCardIds.clear();
  createdObjectIds.clear();
  flushOperationsData();
  flushPlanningData();
});

test.afterAll(() => {
  sweepOrphanNotifications();
});

/** Вход через форму логина: сценарий начинается с настоящей аутентификации. */
async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** Гарантирует вход в админку и переходит на нужный путь. */
async function openPage(page: Page, path: string): Promise<void> {
  if (!/\/dashboard/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page, admin.email, admin.password);
  }
  await page.goto(path);
}

/** Техкарта core «на прогон»: уносится в afterEach через API. */
async function createTrackedTechCard(request: APIRequestContext, name: string) {
  const card = await createTechCard(request, { name });
  createdTechCardIds.add(card.id);
  return card;
}

/**
 * Ожидание опции с серверным значением (справочник/заявки грузятся запросом).
 * Проверяем и наличие, и отсутствие: «материал B выпал из выдачи поиска» — такая же
 * часть контракта серверного поиска, как и появление нужной опции. `.first()` —
 * потому что testid селекта строки намеренно одинаков у всех строк таблицы.
 */
async function expectOption(
  page: Page,
  testId: string,
  value: string,
  present: boolean,
): Promise<void> {
  const option = page.getByTestId(testId).first().locator(`option[value="${value}"]`);
  await expect(option).toHaveCount(present ? 1 : 0, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// 1. Материал операции техкарты выбирается из справочника
// ---------------------------------------------------------------------------

test('М4.3: материал операции выбирается из справочника, норма подставляется, ручной расход не затирается', async ({
  page,
  request,
}) => {
  const tag = runTag();
  // Два материала с РАЗНЫМИ единицей и нормой: так видно, что именно подставляется
  // при выборе и что уже введённый вручную расход при повторном выборе не пропадает.
  const materialA = await trackMaterial(request, {
    name: `E2E-M43-MAT-A-${tag}`,
    unit: 'л',
    defaultConsumption: 0.4,
    minStockThreshold: 5,
    costPerUnit: 100,
  });
  const materialB = await trackMaterial(request, {
    name: `E2E-M43-MAT-B-${tag}`,
    unit: 'шт',
    defaultConsumption: 3,
    minStockThreshold: 5,
    costPerUnit: 50,
  });
  const card = await createTrackedTechCard(request, `E2E-M43 техкарта ${tag}`);

  await openPage(page, `/tech-cards/${card.id}`);
  await page.getByTestId('operation-create-button').first().click();
  const form = page.getByTestId('operation-form');
  await expect(form).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('operation-name').fill(`E2E-M43 операция ${tag}`);
  await page.getByTestId('operation-time').fill('10');

  // Строка материала: у новой строки расход 0, значит справочник имеет право подставить норму.
  await page.getByTestId('operation-material-add').click();
  const rowSelect = page.getByTestId('operation-material-select').first();
  await expect(rowSelect).toBeVisible();

  // Справочник грузится по серверному поиску (`search` в material-service), поэтому
  // сначала убеждаемся, что фильтр реально сужает выдачу: по маркеру материала A
  // опция B в списке отсутствует — это и доказывает, что поиск уходит на сервер,
  // а не фильтрует уже загруженную сотню на клиенте.
  await page.getByTestId('operation-material-search').fill(`MAT-A-${tag}`);
  await expectOption(page, 'operation-material-select', materialA.id, true);
  await expectOption(page, 'operation-material-select', materialB.id, false);

  await rowSelect.selectOption(materialA.id);

  // Подставились единица и норма расхода из справочника, а подпись показывает имя.
  const unitInput = page.getByLabel('Единица измерения').first();
  const consumptionInput = page.getByLabel('Расход на операцию').first();
  await expect(unitInput).toHaveValue('л');
  await expect(consumptionInput).toHaveValue('0.4');
  await expect(page.getByTestId('operation-material-name').first()).toHaveText(
    `${materialA.name} (л)`,
  );

  // Пользователь осознанно меняет норму на свою: 0.9 вместо 0.4.
  await consumptionInput.fill('0.9');

  // Повторный выбор — уже ДРУГОГО материала. Единица обязана обновиться (это свойство
  // материала), а введённый руками расход — сохраниться: правило «подставляем только
  // в пустую строку» и есть предмет проверки.
  await page.getByTestId('operation-material-search').fill(`MAT-B-${tag}`);
  await expectOption(page, 'operation-material-select', materialB.id, true);
  // Материал A выпал из выдачи поиска, но остался ВЫБРАННЫМ и подписан именем,
  // а не «нет в справочнике»: форма помнит уже виденные материалы.
  await expect(rowSelect).toHaveValue(materialA.id);
  await expect(page.getByTestId('operation-material-name').first()).toHaveText(
    `${materialA.name} (л)`,
  );

  await rowSelect.selectOption(materialB.id);
  await expect(unitInput).toHaveValue('шт');
  await expect(
    consumptionInput,
    'введённый вручную расход не перезаписывается нормой при повторном выборе',
  ).toHaveValue('0.9');

  await page.getByTestId('operation-submit').click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // Сверка с сервером: в core у операции лежит именно выбранный из справочника
  // materialId вместе с ручной нормой и подставленной единицей.
  const cardRes = await core(request, 'get', `/api/tech-cards/${card.id}`);
  expect(cardRes.status(), `техкарта после сохранения: ${await bodyText(cardRes)}`).toBe(200);
  const saved = (await cardRes.json()) as {
    operations: Array<{
      name: string;
      materials: Array<{ materialId: string; consumptionPerOperation: number; unit: string }>;
    }>;
  };
  expect(saved.operations, 'операция сохранена').toHaveLength(1);
  expect(saved.operations[0].materials, 'материал операции один').toHaveLength(1);
  expect(saved.operations[0].materials[0].materialId).toBe(materialB.id);
  expect(saved.operations[0].materials[0].consumptionPerOperation).toBe(0.9);
  expect(saved.operations[0].materials[0].unit).toBe('шт');
});

// ---------------------------------------------------------------------------
// 2. Legacy-материал (id, которого нет в справочнике)
// ---------------------------------------------------------------------------

test('М4.3: legacy-материал операции отображается как «нет в справочнике» и не подменяется при сохранении', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const card = await createTrackedTechCard(request, `E2E-M43 legacy ${tag}`);

  // Материал, которого в справочнике material-service нет: так выглядят операции,
  // созданные до М4 (или заведённые напрямую в core). `shortId` этого id — «deadbeef»,
  // поэтому подпись читается однозначно.
  const legacyMaterialId = 'deadbeef-0000-4000-8000-0000000000aa';
  await addOperation(request, card.id, {
    name: `E2E-M43 legacy операция ${tag}`,
    estimatedTimeMin: 7,
    materials: [{ materialId: legacyMaterialId, consumptionPerOperation: 1.5, unit: 'уп' }],
  });

  await openPage(page, `/tech-cards/${card.id}`);
  await page
    .getByRole('button', { name: `Действия с операцией «E2E-M43 legacy операция ${tag}»` })
    .click();
  await page.getByRole('button', { name: 'Редактировать' }).click();

  const form = page.getByTestId('operation-form');
  await expect(form).toBeVisible({ timeout: 20_000 });

  // Значение вне выдачи справочника остаётся выбранным, а подпись честно сообщает,
  // что материала в справочнике нет (иначе <select> показал бы пусто и молча потерял id).
  const rowSelect = page.getByTestId('operation-material-select').first();
  await expect(rowSelect).toHaveValue(legacyMaterialId, { timeout: 20_000 });
  await expect(page.getByTestId('operation-material-name').first()).toContainText(
    'deadbeef — нет в справочнике',
  );
  await expect(page.getByLabel('Расход на операцию').first()).toHaveValue('1.5');
  await expect(page.getByLabel('Единица измерения').first()).toHaveValue('уп');

  // Сохраняем без изменений: legacy-значение обязано уехать на сервер как есть.
  await page.getByTestId('operation-submit').click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  const cardRes = await core(request, 'get', `/api/tech-cards/${card.id}`);
  expect(cardRes.status(), `техкарта после сохранения: ${await bodyText(cardRes)}`).toBe(200);
  const saved = (await cardRes.json()) as {
    operations: Array<{
      materials: Array<{ materialId: string; consumptionPerOperation: number; unit: string }>;
    }>;
  };
  expect(saved.operations[0].materials, 'материал операции на месте').toHaveLength(1);
  expect(
    saved.operations[0].materials[0].materialId,
    'legacy-materialId не подменён и не очищен',
  ).toBe(legacyMaterialId);
  expect(saved.operations[0].materials[0].consumptionPerOperation).toBe(1.5);
  expect(saved.operations[0].materials[0].unit).toBe('уп');
});

// ---------------------------------------------------------------------------
// 3. Заявка в движении материала
// ---------------------------------------------------------------------------

test('М4.3: поле «Заявка» есть только у расходных типов, а ticketId уходит в историю только при выборе', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const material = await trackMaterial(request, {
    name: `E2E-M43 движение ${tag}`,
    unit: 'л',
    minStockThreshold: 1,
    costPerUnit: 100,
  });
  const object = await createObject(request, { name: `E2E-M43 объект движения ${tag}` });
  createdObjectIds.add(object.id);

  // Свежая заявка на прогон: селект показывает последние заявки, и своя гарантирует,
  // что выбор не зависит от чужих данных на стенде. Уборка — `trackTicket`.
  const ticket = await trackTicket(request, {
    type: 'planned',
    objectId: object.id,
    description: `E2E-M43 движение по заявке ${tag}`,
  });

  // Остаток нужен, чтобы расход не упирался в 400 «Недостаточно материала».
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: 10,
  });

  await openPage(page, '/materials');

  // ── Расход с заявкой ────────────────────────────────────────────────────
  await page.getByTestId('movement-open-button').click();
  await expect(page.getByTestId('movement-form')).toBeVisible();
  // По умолчанию тип IN — поля «Заявка» быть не должно: у прихода связи с работой нет.
  await expect(page.getByTestId('movement-type')).toHaveValue('IN');
  await expect(page.getByTestId('movement-ticket')).toHaveCount(0);

  await page.getByTestId('movement-type').selectOption('OUT');
  await expect(page.getByTestId('movement-ticket')).toHaveCount(1);
  await expectOption(page, 'movement-ticket', ticket.id, true);

  await page.getByTestId('movement-quantity').fill('2');
  await expectOption(page, 'movement-material', material.id, true);
  await page.getByTestId('movement-material').selectOption(material.id);
  await expectOption(page, 'movement-object', object.id, true);
  await page.getByTestId('movement-object').selectOption(object.id);
  await page.getByTestId('movement-ticket').selectOption(ticket.id);
  await page.getByTestId('movement-submit').click();
  await expect(page.getByTestId('movement-notice')).toBeVisible({ timeout: 20_000 });

  // ── Приход после выбора заявки: ticketId в payload НЕ уходит ────────────
  await page.getByTestId('movement-open-button').click();
  await expect(page.getByTestId('movement-form')).toBeVisible();
  await page.getByTestId('movement-type').selectOption('OUT');
  await expectOption(page, 'movement-ticket', ticket.id, true);
  await page.getByTestId('movement-ticket').selectOption(ticket.id);
  // Меняем тип на IN: поле исчезает, а выбранная заявка остаётся в состоянии формы —
  // именно здесь проверяется, что клиент не отправляет ticketId «на всякий случай».
  await page.getByTestId('movement-type').selectOption('IN');
  await expect(page.getByTestId('movement-ticket')).toHaveCount(0);

  await page.getByTestId('movement-quantity').fill('5');
  await expectOption(page, 'movement-material', material.id, true);
  await page.getByTestId('movement-material').selectOption(material.id);
  await expectOption(page, 'movement-object', object.id, true);
  await page.getByTestId('movement-object').selectOption(object.id);
  await page.getByTestId('movement-submit').click();
  await expect(page.getByTestId('movement-notice')).toBeVisible({ timeout: 20_000 });

  // История движений — единственное место, где привязка видна: сверяем по количеству,
  // чтобы не путать три движения (10 IN из API, 2 OUT и 5 IN из формы).
  const history = await listMovements(request, material.id, { objectId: object.id });
  const expense = history.items.find((item) => item.type === 'OUT' && item.quantity === 2);
  const income = history.items.find((item) => item.type === 'IN' && item.quantity === 5);
  expect(expense, 'расход 2 проведён').toBeTruthy();
  expect(expense?.ticketId, 'выбранная заявка записана в движение').toBe(ticket.id);
  expect(income, 'приход 5 проведён').toBeTruthy();
  expect(
    income?.ticketId,
    'для прихода ticketId не отправлен, хотя заявка была выбрана в форме',
  ).toBeNull();
});

// ---------------------------------------------------------------------------
// 4. Поиск заявки в модалке движения (М4.3)
// ---------------------------------------------------------------------------

test('М4.3: поиск заявки по подстроке описания находит её, и выбранная заявка попадает в ticketId движения', async ({
  page,
  request,
}) => {
  const tag = runTag();
  // Маркер — подстрока ОПИСАНИЯ заявки: до М4.3 селект показывал только последние 50
  // заявок, и нужной там могло не быть; поиск уходит на сервер (`ListTicketsQueryDto.search`).
  const marker = `M43-ПОИСК-${tag}`;
  const material = await trackMaterial(request, {
    name: `E2E-M43 поиск заявки ${tag}`,
    unit: 'л',
    minStockThreshold: 1,
    costPerUnit: 100,
  });
  const object = await createObject(request, { name: `E2E-M43 поиск объект ${tag}` });
  createdObjectIds.add(object.id);
  const ticket = await trackTicket(request, {
    type: 'planned',
    objectId: object.id,
    description: `Влажная уборка ${marker} санузла`,
  });
  // Остаток нужен, чтобы расход не упирался в 400 «Недостаточно материала».
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: 10,
  });

  await openPage(page, '/materials');
  await page.getByTestId('movement-open-button').click();
  await expect(page.getByTestId('movement-form')).toBeVisible();
  // Поле поиска есть только у расходных типов — начинаем с OUT.
  await page.getByTestId('movement-type').selectOption('OUT');

  // Поиск реально сужает выдачу селекта: по несуществующей подстроке нашей заявки нет.
  await page.getByTestId('movement-ticket-search').fill(`нет-такой-заявки-${tag}`);
  await expectOption(page, 'movement-ticket', ticket.id, false);

  // А по подстроке описания — заявка находится, хотя её могло не быть в последних 50.
  await page.getByTestId('movement-ticket-search').fill(marker);
  await expectOption(page, 'movement-ticket', ticket.id, true);
  await page.getByTestId('movement-ticket').selectOption(ticket.id);

  await page.getByTestId('movement-quantity').fill('3');
  await expectOption(page, 'movement-material', material.id, true);
  await page.getByTestId('movement-material').selectOption(material.id);
  await expectOption(page, 'movement-object', object.id, true);
  await page.getByTestId('movement-object').selectOption(object.id);
  await page.getByTestId('movement-submit').click();
  await expect(page.getByTestId('movement-notice')).toBeVisible({ timeout: 20_000 });

  // Сверка с сервером: заявка, найденная поиском и выбранная в селекте, записана в движение.
  const history = await listMovements(request, material.id, { objectId: object.id });
  const expense = history.items.find((item) => item.type === 'OUT' && item.quantity === 3);
  expect(expense, 'расход 3 проведён').toBeTruthy();
  expect(expense?.ticketId, 'выбранная через поиск заявка попала в ticketId').toBe(ticket.id);
});

// ---------------------------------------------------------------------------
// Уборка
// ---------------------------------------------------------------------------

test('уборка: материалы, движения, техкарты и заявки прогона сняты', async ({ request }) => {
  // Полный цикл «создать → проверить «до» → снести → проверить «после»» на загруженной
  // машине не укладывается в дефолтные 30 с. Обрыв тела теста по таймауту оставлял
  // DELETE техкарты в полёте, и afterEach налетал на него вторым DELETE — гонка
  // getCard/delete давала 500 (P2025) вместо идемпотентных 204/404.
  test.setTimeout(120_000);
  test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

  const tag = runTag();
  const material = await trackMaterial(request, {
    name: `E2E-M43 уборка ${tag}`,
    unit: 'л',
  });
  const object = await createObject(request, { name: `E2E-M43 уборка объект ${tag}` });
  createdObjectIds.add(object.id);
  const card = await createTrackedTechCard(request, `E2E-M43 уборка техкарта ${tag}`);
  await addOperation(request, card.id, {
    name: `E2E-M43 уборка операция ${tag}`,
    estimatedTimeMin: 5,
    materials: [{ materialId: material.id, consumptionPerOperation: 1, unit: 'л' }],
  });
  const ticket = await trackTicket(request, {
    type: 'planned',
    objectId: object.id,
    description: `E2E-M43 уборка заявка ${tag}`,
  });
  await createMovement(request, {
    materialId: material.id,
    objectId: object.id,
    type: 'IN',
    quantity: 3,
  });

  // «До»: строки прогона реально в БД — иначе ноль «после» ничего не доказывал бы.
  expect(planningCounts({ materialIds: [material.id] }).materials).toBe(1);
  expect(planningCounts({ materialIds: [material.id] }).movements).toBe(1);
  expect((await core(request, 'get', `/api/tech-cards/${card.id}`)).status()).toBe(200);

  // Уборка тем же путём, что и в afterEach: SQL-часть (заявки, материалы, движения) —
  // трекерами, объекты и техкарты core — через API (у core нет «снести всё»).
  flushOperationsData();
  flushPlanningData();
  await deleteTechCard(request, card.id);
  await deleteObject(request, object.id);
  // Из сетей уборки убираем сразу: повторный DELETE из afterEach без надобности.
  createdTechCardIds.delete(card.id);
  createdObjectIds.delete(object.id);

  expect(planningCounts({ materialIds: [material.id] }), 'материал и его движения сняты').toEqual({
    schedules: 0,
    events: 0,
    materials: 0,
    stocks: 0,
    movements: 0,
    consumed: 0,
  });
  expect(
    (await core(request, 'get', `/api/tech-cards/${card.id}`)).status(),
    'техкарта прогона удалена',
  ).toBe(404);
  // Заявки убираются трекером «оперативки» (у ticket-service нет DELETE): проверяем фактом.
  const ticketRes = await request.get(
    `${process.env.E2E_TICKET_URL ?? 'http://localhost:3005'}/api/tickets/${ticket.id}`,
    { headers: { Authorization: `Bearer ${await loginAs(request, 'ADMIN')}` } },
  );
  expect(ticketRes.status(), `заявка прогона удалена: ${await bodyText(ticketRes)}`).toBe(404);
});
