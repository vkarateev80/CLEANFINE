import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createObject, deleteObject, runTag } from '../../helpers/core';
import { flushOperationsData, sqlAvailable, sweepOrphanNotifications } from '../../helpers/operations';
import {
  createMaterial,
  createMovement,
  flushPlanningData,
  listMaterials,
  planningCounts,
  planningTracker,
  utcDate,
  type Material,
} from '../../helpers/planning';
import { userByRole } from '../../helpers/users';

/**
 * М4.7 — UI-спека экрана «Материалы» (М4.3) в web-admin.
 *
 * Проверяется именно интерфейс, а не контракт API (контракты закрыты
 * `e2e/api/planning.api.spec.ts`):
 *   1) вкладки Справочник/Остатки/История/Отчёт и их сохранение в query-строке
 *      (перезагрузка возвращает ту же вкладку — состояние экрана должно быть
 *      восстановимо из ссылки);
 *   2) создание материала через модалку и появление строки в таблице;
 *   3) проведение прихода через модалку движения и появление остатка, а также показ
 *      серверной 400 «Недостаточно материала» пользователю при расходе больше остатка
 *      (клиент не подменяет серверную проверку своей);
 *   4) ненулевой итог отчёта за период после расхода;
 *   5) история движений с фильтром по материалу.
 *
 * Требуется web-admin на :5173 (vite dev проксирует `/api` на :3007 — material-service,
 * :3003 — core) и material-service :3007; вход — под ADMIN.
 *
 * ДАННЫЕ. Часть данных создаётся через UI (это и есть предмет проверки), часть — через
 * API, чтобы тест не зависел от вёрстки соседних экранов. Все имена уникальны
 * (`E2E-M47-UI-<runTag>`), поэтому набор не зависит от того, что уже лежит на стенде.
 * Уборка — в afterEach: материалы/движения/остатки (`helpers/planning.ts`), объекты core
 * через API, уведомления и заявки — существующим трекером «оперативки».
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
  // Один раз на процесс: зачистка уведомлений, оставшихся от гонки с RabbitMQ.
  sweepOrphanNotifications();
});

const admin = userByRole('ADMIN');

/** Вход через форму логина: сценарий начинается с настоящей аутентификации. */
async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** Экран «Материалы» под ADMIN: вход + переход (логин кэшируется в браузере). */
async function openMaterials(page: Page, query = ''): Promise<void> {
  if (!/\/dashboard|\/materials/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page, admin.email, admin.password);
  }
  await page.goto(`/materials${query}`);
}

/**
 * Выбор значения в `<select>`, у которого опции приходят с сервера.
 *
 * Почему не сразу `selectOption`: список грузится запросом, и до его завершения опции
 * нужного id ещё нет — `selectOption` упал бы на «option not found». Ждём появления
 * опции, после чего выбор детерминирован.
 */
async function selectServerOption(page: Page, testId: string, value: string): Promise<void> {
  const select = page.getByTestId(testId);
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1, { timeout: 15_000 });
  await select.selectOption(value);
}

/** Объект core «на прогон»: нужен как адрес склада в модалке движения и в отчёте. */
async function createTrackedObject(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string }> {
  const object = await createObject(request, { name });
  createdObjectIds.add(object.id);
  return { id: object.id, name: object.name };
}

/** Материал, созданный через API: id известен сразу, уборка — трекером. */
async function createTrackedMaterial(
  request: APIRequestContext,
  input: Parameters<typeof createMaterial>[1],
): Promise<Material> {
  const material = await createMaterial(request, input);
  planningTracker.material(material.id);
  return material;
}

// ---------------------------------------------------------------------------
// Вкладки и query-строка
// ---------------------------------------------------------------------------

test('вкладки переключаются и сохраняются в query-строке (перезагрузка возвращает вкладку)', async ({
  page,
}) => {
  await openMaterials(page);

  // По умолчанию открыт справочник, и лишнего параметра в ссылке нет.
  await expect(page.getByTestId('materials-search')).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).searchParams.get('tab'), 'справочник — вкладка по умолчанию').toBeNull();

  // Каждая вкладка пишет свой `tab` и монтирует свою панель.
  await page.getByTestId('materials-tab-stocks').click();
  await expect(page).toHaveURL(/tab=stocks/);
  await expect(page.getByTestId('stocks-object-filter')).toBeVisible();

  // Главное требование: ссылку можно передать коллеге — после перезагрузки открыта та же
  // вкладка, а не справочник. Проверяем и состояние страницы, и `aria-selected`.
  await page.reload();
  await expect(page.getByTestId('stocks-object-filter')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('materials-tab-stocks')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('materials-tab-movements').click();
  await expect(page).toHaveURL(/tab=movements/);
  await page.reload();
  await expect(page.getByTestId('movements-material-filter')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('materials-tab-report').click();
  await expect(page).toHaveURL(/tab=report/);
  await expect(page.getByTestId('report-total-cost')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('report-total-cost')).toBeVisible({ timeout: 20_000 });

  // Возврат в справочник убирает параметр: «вкладка по умолчанию» не должна засорять ссылку.
  await page.getByTestId('materials-tab-catalog').click();
  await expect(page.getByTestId('materials-search')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
});

// ---------------------------------------------------------------------------
// Справочник: создание через модалку
// ---------------------------------------------------------------------------

test('создание материала через модалку: строка появляется и находится серверным поиском', async ({
  page,
  request,
}) => {
  const name = `E2E-M47-UI материал ${runTag()}`;
  await openMaterials(page);

  await page.getByTestId('material-create-button').click();
  await expect(page.getByTestId('material-form')).toBeVisible();

  // Поля формы повторяют CreateMaterialDto material-service.
  await page.getByTestId('material-name').fill(name);
  await page.getByTestId('material-unit').fill('л');
  await page.getByTestId('material-consumption').fill('0.25');
  await page.getByTestId('material-threshold').fill('5');
  await page.getByTestId('material-cost').fill('120.5');
  await page.getByTestId('material-submit').click();

  // Модалка закрывается только после успешного сохранения (ошибка оставила бы её открытой).
  await expect(page.getByTestId('material-form')).toBeHidden({ timeout: 20_000 });

  // Поиск в справочнике серверный: находим созданное по уникальному имени и берём id
  // из data-testid строки — вёрстка сама сообщает, что запись реально сохранена.
  await page.getByTestId('materials-search').fill(name);
  // Поле пишет запрос в query-строку с задержкой (debounce 300 мс): ждём именно записи
  // параметра, иначе строка могла бы найтись в ещё не отфильтрованной выдаче, и проверка
  // серверного поиска оказалась бы фиктивной.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('catSearch'), { timeout: 15_000 })
    .toBe(name);
  const row = page.locator('[data-testid^="material-row-"]');
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  const testId = (await row.first().getAttribute('data-testid')) ?? '';
  const materialId = testId.replace('material-row-', '');
  expect(materialId, 'id материала читается из data-testid строки').toMatch(/^[0-9a-f-]{36}$/);
  planningTracker.material(materialId);

  // Сверка с API: в форму вводили «120.5», и на сервере именно 120.5 (а не строка/0).
  const saved = (await listMaterials(request, { search: name })).items.find(
    (item) => item.id === materialId,
  );
  expect(saved, 'материал сохранён сервером').toBeTruthy();
  expect(saved?.name).toBe(name);
  expect(saved?.unit).toBe('л');
  expect(saved?.costPerUnit).toBe(120.5);
  expect(saved?.minStockThreshold).toBe(5);
});

// ---------------------------------------------------------------------------
// Движения и остатки
// ---------------------------------------------------------------------------

test('движение IN через модалку даёт остаток, OUT больше остатка показывает серверную ошибку', async ({
  page,
  request,
}) => {
  const material = await createTrackedMaterial(request, {
    name: `E2E-M47-UI движение ${runTag()}`,
    unit: 'л',
    minStockThreshold: 5,
    costPerUnit: 100,
  });
  const object = await createTrackedObject(request, `E2E-M47-UI объект ${runTag()}`);

  await openMaterials(page);

  // ── Приход на 10 единиц ──────────────────────────────────────────────────
  await page.getByTestId('movement-open-button').click();
  await expect(page.getByTestId('movement-form')).toBeVisible();
  await page.getByTestId('movement-type').selectOption('IN');
  await page.getByTestId('movement-quantity').fill('10');
  await selectServerOption(page, 'movement-material', material.id);
  await selectServerOption(page, 'movement-object', object.id);
  await page.getByTestId('movement-submit').click();

  // Баннер подтверждения с остатком после операции — экран сам показывает результат.
  const notice = page.getByTestId('movement-notice');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('Приход');
  await expect(notice).toContainText('Остаток после операции');

  // Остаток на вкладке «Остатки»: сначала фильтр по объекту. Без фильтра таблица
  // показывает пары «материал + объект», и `stock-quantity-<id>` мог бы повторяться.
  await page.getByTestId('materials-tab-stocks').click();
  await selectServerOption(page, 'stocks-object-filter', object.id);
  await expect(page.getByTestId(`stock-quantity-${material.id}`)).toHaveText('10', {
    timeout: 20_000,
  });

  // ── Расход больше остатка: пользователь видит серверную 400 ─────────────
  await page.getByTestId('movement-open-button').click();
  await expect(page.getByTestId('movement-form')).toBeVisible();
  await page.getByTestId('movement-type').selectOption('OUT');
  await page.getByTestId('movement-quantity').fill('999');
  await selectServerOption(page, 'movement-material', material.id);
  await selectServerOption(page, 'movement-object', object.id);
  await page.getByTestId('movement-submit').click();

  // Текст ошибки приходит из ответа material-service дословно («Недостаточно материала…»):
  // клиент предупреждает о нехватке, но НЕ блокирует отправку, поэтому 400 обязан
  // отобразиться, а не превратиться в молчаливый отказ или 500.
  await expect(page.getByTestId('movement-error')).toContainText('Недостаточно материала', {
    timeout: 20_000,
  });

  // Остаток не поехал: отказ транзакционный. Модалку закрываем и смотрим вкладку остатков.
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('movement-form')).toBeHidden();
  await expect(page.getByTestId(`stock-quantity-${material.id}`)).toHaveText('10', {
    timeout: 20_000,
  });
});

// ---------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------

test('отчёт за период показывает ненулевой итог после расхода', async ({ page, request }) => {
  const material = await createTrackedMaterial(request, {
    name: `E2E-M47-UI отчёт ${runTag()}`,
    unit: 'л',
    minStockThreshold: 1,
    costPerUnit: 100,
  });
  const object = await createTrackedObject(request, `E2E-M47-UI отчёт объект ${runTag()}`);

  // Расход 3 × 100 ₽ = 300 ₽ — итог отчёта на своём объекте детерминирован.
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
    quantity: 3,
  });

  const today = utcDate();
  await openMaterials(page, '?tab=report');
  await expect(page.getByTestId('report-total-cost')).toBeVisible({ timeout: 20_000 });

  await selectServerOption(page, 'report-object-filter', object.id);
  await page.getByTestId('report-from').fill(today);
  await page.getByTestId('report-to').fill(today);

  // Итог ненулевой и равен стоимости расхода: отчёт агрегирует OUT и WRITE_OFF.
  await expect(page.getByTestId('report-total-cost')).toContainText('300,00', { timeout: 20_000 });
  // И строка именно нашего материала — иначе «итог» мог бы прийти из чужих данных.
  await expect(page.getByTestId(`report-row-${material.id}`)).toBeVisible();
});

// ---------------------------------------------------------------------------
// История движений
// ---------------------------------------------------------------------------

test('история движений фильтруется по материалу и объекту', async ({ page, request }) => {
  const material = await createTrackedMaterial(request, {
    name: `E2E-M47-UI история ${runTag()}`,
  });
  const objectA = await createTrackedObject(request, `E2E-M47-UI история А ${runTag()}`);
  const objectB = await createTrackedObject(request, `E2E-M47-UI история Б ${runTag()}`);

  await createMovement(request, {
    materialId: material.id,
    objectId: objectA.id,
    type: 'IN',
    quantity: 5,
  });
  await createMovement(request, {
    materialId: material.id,
    objectId: objectA.id,
    type: 'OUT',
    quantity: 2,
  });
  await createMovement(request, {
    materialId: material.id,
    objectId: objectB.id,
    type: 'IN',
    quantity: 7,
  });

  await openMaterials(page, '?tab=movements');
  await selectServerOption(page, 'movements-material-filter', material.id);

  // Выбрали материал — видим все три движения с типами из shared-словаря.
  const rows = page.locator('[data-testid^="movement-row-"]');
  await expect(rows).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByText('Приход').first()).toBeVisible();
  await expect(page.getByText('Расход').first()).toBeVisible();

  // Фильтр по объекту реально сужает выдачу: на объекте А два движения из трёх.
  await selectServerOption(page, 'movements-object-filter', objectA.id);
  await expect(rows).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText(/показано 2 из 2/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Уборка
// ---------------------------------------------------------------------------

test('уборка: после снятия данных материал исчезает из справочника и из БД', async ({
  page,
  request,
}) => {
  test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

  const name = `E2E-M47-UI уборка ${runTag()}`;
  const material = await createTrackedMaterial(request, { name });

  // Ищем по deep-link (`catSearch`), а не набором в поле: у поля debounce 300 мс, и
  // строка «поиск нашёл материал» могла бы выполниться на ЕЩЁ НЕ отфильтрованной выдаче.
  // Deep-link убирает гонку и проверяет ровно то, что нужно: серверный поиск.
  await openMaterials(page, `?catSearch=${encodeURIComponent(name)}`);
  await expect(page.locator('[data-testid^="material-row-"]')).toHaveCount(1, { timeout: 20_000 });

  // Уборка тем же путём, что и в afterEach.
  flushPlanningData();

  // SQL: строки прогона в таблицах М4 больше нет.
  expect(planningCounts({ materialIds: [material.id] }).materials).toBe(0);
  // И тот же серверный поиск после перезагрузки не находит ничего: экран показывает
  // «Ничего не найдено» (фильтр активен), а не «залипшую» строку из кэша запроса.
  await page.reload();
  await expect(page.getByText('Ничего не найдено')).toBeVisible({ timeout: 20_000 });
});
