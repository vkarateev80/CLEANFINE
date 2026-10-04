import { expect, test, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deleteFile,
  deleteObject,
  deleteTechCard,
  file,
  getRouteDetail,
  loginAs,
  core,
} from '../../helpers/core';
import { flushChatData, trackObjectChatsOf } from '../../helpers/chat';
import { userByRole } from '../../helpers/users';

/**
 * М2.9 — автоматизация сценария М2.7 (прямое требование плана: «e2e-сценарий
 * М2.7 автоматизирован в Playwright»).
 *
 * В отличие от `e2e/api/core.api.spec.ts` (проверяет контракты API), этот набор
 * идёт через браузер и повторяет ручной приёмочный сценарий М2.7:
 *   создать объект → этаж → загрузить план → нарисовать помещения рамкой →
 *   собрать маршрут из помещений → перетащить точки → сохранить.
 *
 * Требуется запущенный web-admin (vite dev, :5175) и все три сервиса — vite-прокси
 * раскидывает `/api` по :3001/:3002/:3003.
 *
 * Данные создаются через интерфейс (это и есть предмет проверки), а API-хелперы
 * используются только для двух вещей: узнать id созданных сущностей и убрать за
 * собой мусор. Логинов ровно три (админ, оператор) — при поднятом лимите это
 * безопасно; на боевом лимите 5/мин прогон надо делать на стенде с
 * `THROTTLE_LOGIN_LIMIT=1000` (см. test/README.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const PLAN_FILE = join(here, '..', '..', 'fixtures', 'files', 'floor-plan.png');

const admin = userByRole('ADMIN');
const operator = userByRole('OPERATOR');

const RUN = Date.now().toString(36);
const OBJECT_NAME = `E2E сквозной объект ${RUN}`;
const FLOOR_NAME = `Первый этаж ${RUN}`;
const ROUTE_NAME = `Утренний маршрут ${RUN}`;
const TECH_CARD_NAME = `E2E техкарта ${RUN}`;

const ROOMS = ['Санузел 101', 'Офис 102', 'Коридор 103'];

/**
 * Уборка живёт в `afterEach`, а не в конце сценария. На первом прогоне этого набора
 * падение в середине теста оставило в БД объект, этаж, помещение, техкарту и файл
 * плана — мусор пережил прогон именно потому, что `deleteObject` стоял последней
 * строкой теста. Идентификаторы записываются сразу после их получения.
 */
let createdObjectId: string | null = null;
let createdFloorId: string | null = null;
let createdTechCardId: string | null = null;

test.afterEach(async ({ request }) => {
  if (createdObjectId && createdFloorId) {
    // План лежит в file-service и каскадом core не удаляется.
    const attachmentsRes = await file(
      request,
      'get',
      `/api/files/attachments/FLOOR_PLAN/${createdFloorId}`,
    );
    if (attachmentsRes.status() === 200) {
      const attachments = (await attachmentsRes.json()) as Array<{ id: string }>;
      for (const attachment of attachments) {
        await deleteFile(request, attachment.id);
      }
    }
  }
  if (createdObjectId) {
    // Карточка объекта в админке САМА создаёт «чат объекта» (М5.3, ChatPanel), поэтому
    // без этого шага каждый UI-прогон оставлял бы на стенде объектный чат: объект мы
    // удаляем, а чат — нет (у chat-service нет DELETE, уборка только через тест).
    await trackObjectChatsOf(request, [createdObjectId]);
    flushChatData();
    await deleteObject(request, createdObjectId);
  }
  if (createdTechCardId) {
    await deleteTechCard(request, createdTechCardId);
  }

  createdObjectId = null;
  createdFloorId = null;
  createdTechCardId = null;
});

/** Вход через форму логина: сценарий начинается с настоящей аутентификации. */
async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** id сущности из адресной строки: `/objects/<uuid>` → `<uuid>`. */
function lastPathSegment(page: Page): string {
  const segments = new URL(page.url()).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1];
}

/**
 * Рисование помещения на плане: экран в режиме «Добавить помещение» принимает
 * не клик, а протягивание рамки (title кнопки: «Протяните рамку по плану»),
 * поэтому двигаем мышь с зажатой кнопкой.
 *
 * Два неочевидных момента, найденных прогоном:
 *  - после создания помещения экран СБРАСЫВАЕТ режим рисования, поэтому перед
 *    каждой рамкой его нужно включать заново (иначе вторая рамка просто ничего
 *    не делает — молчаливый отказ, а не ошибка);
 *  - созданное помещение открывает карточку-панель поверх плана, её надо закрыть,
 *    иначе следующий drag попадает по панели, а не по плану.
 */
async function ensureAddMode(page: Page) {
  const drawerClose = page.getByRole('button', { name: 'Закрыть карточку помещения' });
  if (await drawerClose.isVisible().catch(() => false)) {
    await drawerClose.click();
    await expect(drawerClose).toBeHidden();
  }

  const toggle = page.getByTestId('add-mode-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  }
}

async function drawRoom(
  page: Page,
  rect: { x: number; y: number; w: number; h: number },
  name: string,
) {
  await ensureAddMode(page);

  const layer = page.getByTestId('plan-click-layer');
  await expect(layer).toBeVisible();
  const box = await layer.boundingBox();
  expect(box, 'план этажа должен быть отрисован (boundingBox у plan-click-layer)').not.toBeNull();

  await page.mouse.move(box!.x + rect.x, box!.y + rect.y);
  await page.mouse.down();
  await page.mouse.move(box!.x + rect.x + rect.w, box!.y + rect.y + rect.h, { steps: 8 });
  await page.mouse.up();

  const form = page.getByTestId('room-create-form');
  await expect(form, 'рамка по плану должна открыть форму помещения').toBeVisible({
    timeout: 15_000,
  });
  await form.getByLabel('Название').fill(name);
  await form.getByLabel('Площадь').fill('24.5');
  await form.getByLabel('Тип помещения').fill('office');
  await page.getByTestId('room-submit').click();
  await expect(form).toBeHidden({ timeout: 15_000 });
}

/** Добавление точки маршрута по id помещения (id берём запросом, а не из вёрстки). */
async function addRoutePointViaUi(page: Page, roomId: string, minutes: number) {
  await page.getByTestId('route-point-add').click();
  const form = page.getByTestId('route-point-form');
  await expect(form).toBeVisible();
  await form.locator('#add-point-room').selectOption(roomId);
  await form.locator('#add-point-time').fill(String(minutes));
  await page.getByTestId('route-point-submit').click();
  await expect(form).toBeHidden({ timeout: 15_000 });
}

test('М2.7: объект → этаж → план → помещения → маршрут → переупорядочивание', async ({
  page,
  request,
}) => {
  await loginViaUi(page, admin.email, admin.password);

  // ── 1. Создание объекта ──────────────────────────────────────────────────
  await page.goto('/objects');
  await page.getByTestId('object-create-button').click();
  const objectForm = page.getByTestId('object-form');
  await expect(objectForm).toBeVisible();
  await objectForm.locator('#object-name').fill(OBJECT_NAME);
  await objectForm.locator('#object-address').fill('г. Москва, ул. Тестовая, 1');
  await objectForm.locator('#object-type').fill('business-center');
  await objectForm.locator('#object-lat').fill('55.7558');
  await objectForm.locator('#object-lng').fill('37.6173');
  await objectForm.locator('#object-total-area').fill('1200.5');
  await objectForm.locator('#object-floors-count').fill('2');
  await objectForm.locator('#object-client-name').fill('ООО «E2E Заказчик»');
  await objectForm.locator('#object-client-contact').fill('+7 495 000-00-00');
  await page.getByTestId('object-submit').click();
  await expect(objectForm).toBeHidden({ timeout: 20_000 });

  // Объект появился в списке через серверный поиск (не по локальному состоянию формы).
  await page.getByTestId('objects-search').fill(OBJECT_NAME);
  const objectName = page.getByText(OBJECT_NAME).first();
  await expect(objectName).toBeVisible({ timeout: 20_000 });
  await objectName.click();
  await expect(page).toHaveURL(/\/objects\/[0-9a-f-]{36}/);
  const objectId = lastPathSegment(page);
  createdObjectId = objectId;

  // ── 2. Этаж ──────────────────────────────────────────────────────────────
  await page.getByTestId('floor-create-button').click();
  const floorForm = page.getByTestId('floor-form');
  await expect(floorForm).toBeVisible();
  await floorForm.locator('#floor-number').fill('1');
  await floorForm.locator('#floor-name').fill(FLOOR_NAME);
  await page.getByTestId('floor-submit').click();
  await expect(floorForm).toBeHidden({ timeout: 20_000 });

  const floorRow = page.locator('[data-testid^="floor-row-"]').first();
  await expect(floorRow).toBeVisible({ timeout: 20_000 });
  const floorId = ((await floorRow.getAttribute('data-testid')) ?? '').replace('floor-row-', '');
  expect(floorId, 'id этажа должен читаться из data-testid строки').toMatch(/^[0-9a-f-]{36}$/);
  createdFloorId = floorId;

  // ── 3. План этажа ────────────────────────────────────────────────────────
  await page.goto(`/objects/${objectId}/floors/${floorId}`);
  await page.getByTestId('floor-plan-upload-open').click();
  // Файл уходит в file-service руками core-service (проброс токена пользователя).
  await page.getByTestId('floor-plan-upload').setInputFiles(PLAN_FILE);
  await page.getByTestId('floor-plan-upload-submit').click();
  await expect(page.getByTestId('floor-plan-image')).toBeVisible({ timeout: 30_000 });

  // ── 4. Помещения: рисуем рамки по координатам плана ──────────────────────
  await page.getByTestId('add-mode-toggle').click();
  await drawRoom(page, { x: 40, y: 40, w: 200, h: 140 }, ROOMS[0]);
  await drawRoom(page, { x: 300, y: 40, w: 200, h: 140 }, ROOMS[1]);
  await drawRoom(page, { x: 40, y: 240, w: 200, h: 140 }, ROOMS[2]);

  for (const name of ROOMS) {
    // Строки экспликации адресуются по id помещения, поэтому ищем по имени.
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  }

  // id помещений нужны, чтобы выбирать их в селекте добавления точки.
  const roomsRes = await core(request, 'get', `/api/floors/${floorId}/rooms`);
  expect(roomsRes.status(), `список помещений: ${await roomsRes.text()}`).toBe(200);
  const rooms = (await roomsRes.json()) as Array<{
    id: string;
    name: string;
    coordsX: number | null;
  }>;
  expect(rooms).toHaveLength(3);
  // Координаты проставлены именно кликом по плану, а не вручную.
  for (const room of rooms) {
    expect(room.coordsX, `помещение «${room.name}» должно иметь координаты с плана`).not.toBeNull();
  }
  const roomIdByName = new Map(rooms.map((room) => [room.name, room.id]));

  // ── 5. Маршрут из помещений ──────────────────────────────────────────────
  await page.goto(`/routes?objectId=${objectId}&floorId=${floorId}`);
  await page.getByTestId('route-create-button').click();
  await page.getByTestId('route-name-input').fill(ROUTE_NAME);
  await page.getByTestId('route-submit').click();
  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const routeId = lastPathSegment(page);

  for (const name of ROOMS) {
    await addRoutePointViaUi(page, roomIdByName.get(name)!, 8);
  }

  const points = page.locator('[data-testid^="sortable-row-"]');
  await expect(points).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByTestId('route-total-time')).toContainText('24');

  // ── 6. Переупорядочивание: первая точка вниз + сохранение ────────────────
  const orderBefore = await points.allInnerTexts();
  await points.first().getByRole('button', { name: 'Ниже' }).click();
  await expect(page.getByText('Есть несохранённые изменения')).toBeVisible();

  await page.getByRole('button', { name: 'Сохранить порядок' }).click();
  await expect(page.getByText('Есть несохранённые изменения')).toBeHidden({ timeout: 20_000 });

  // Порядок проверяем по API: он должен совпасть с тем, что показывает интерфейс.
  const orderAfter = await points.allInnerTexts();
  expect(orderAfter).not.toEqual(orderBefore);

  const detail = await getRouteDetail(request, routeId);
  expect(detail.points).toHaveLength(3);
  expect(detail.totalEstimatedTimeMin).toBe(24);

  const expectedFirst = roomIdByName.get(ROOMS[1])!;
  expect(
    detail.points[0].roomId,
    'после «Ниже» первая точка должна стать второй, а вторая — первой',
  ).toBe(expectedFirst);

  // orderIndex пересобран плотно, без дыр (транзакционный reorder на бэкенде).
  const indexes = detail.points.map((point) => point.orderIndex).sort((a, b) => a - b);
  expect(indexes).toEqual([0, 1, 2]);

  // Уборка — в afterEach (см. комментарий к состоянию модуля выше).
});

test('М2.7: техкарта — операция создаётся и переупорядочивается', async ({ page, request }) => {
  await loginViaUi(page, admin.email, admin.password);

  await page.goto('/tech-cards');
  await page.getByTestId('techcard-create-button').first().click();
  const cardForm = page.getByTestId('techcard-form');
  await expect(cardForm).toBeVisible();
  await cardForm.getByTestId('techcard-name').fill(TECH_CARD_NAME);
  await page.getByTestId('techcard-submit').click();

  // Создание ведёт сразу в редактор новой техкарты.
  await expect(page).toHaveURL(/\/tech-cards\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const cardId = lastPathSegment(page);
  createdTechCardId = cardId;

  for (const [index, name] of ['Нанести средство', 'Протереть поверхность'].entries()) {
    await page.getByTestId('operation-create-button').first().click();
    const opForm = page.getByTestId('operation-form');
    await expect(opForm).toBeVisible();
    await page.getByTestId('operation-name').fill(name);
    await page.getByTestId('operation-time').fill(index === 0 ? '5' : '15');
    await page.getByTestId('operation-submit').click();
    await expect(opForm).toBeHidden({ timeout: 20_000 });
  }

  // Строки берём по testid <li> из SortableList: кнопки «↑/↓» — соседи содержимого
  // строки, а не его потомки, поэтому искать их внутри `operation-row-<id>` нельзя.
  const rows = page.locator('[data-testid^="sortable-row-"]');
  await expect(rows).toHaveCount(2, { timeout: 20_000 });
  // Сумма времени операций: 5 + 15.
  await expect(page.getByTestId('operation-total-time')).toContainText('20');

  const orderBefore = await rows.allInnerTexts();
  await rows.first().getByRole('button', { name: 'Ниже' }).click();
  // У техкарт переупорядочивание сохраняется сразу (без отдельной кнопки).
  await expect
    .poll(async () => (await rows.allInnerTexts()).join('|'), { timeout: 20_000 })
    .not.toBe(orderBefore.join('|'));

  const cardRes = await core(request, 'get', `/api/tech-cards/${cardId}`);
  expect(cardRes.status(), `техкарта: ${await cardRes.text()}`).toBe(200);
  const card = (await cardRes.json()) as {
    operations: Array<{ orderIndex: number; name: string }>;
    totalEstimatedTimeMin: number;
  };
  expect(card.totalEstimatedTimeMin).toBe(20);
  expect(card.operations.map((op) => op.orderIndex)).toEqual([0, 1]);
  expect(card.operations[0].name, 'первой стала операция, сдвинутая вниз').toBe(
    'Протереть поверхность',
  );

  await deleteTechCard(request, cardId);
});

test('М2.7: защита маршрутов — без входа админка недоступна', async ({ page }) => {
  for (const path of ['/objects', '/routes', '/tech-cards']) {
    await page.goto(path);
    await expect(page, `${path} должен требовать вход`).toHaveURL(/\/login$/, { timeout: 20_000 });
  }
});

test('М2.7: RBAC — оператору недоступен конструктор маршрутов', async ({ page }) => {
  await loginViaUi(page, operator.email, operator.password);

  // Пункт меню скрыт для роли, которой бэкенд запрещает правку маршрутов.
  await expect(page.getByRole('link', { name: 'Маршруты' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Техкарты' })).toHaveCount(0);
  // Чтение объектов оператору разрешено.
  await expect(page.getByRole('link', { name: 'Объекты' })).toBeVisible();

  // Прямой заход по URL упирается в RoleGuard и возвращает на дашборд.
  await page.goto('/routes');
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

  // Вспомогательная проверка, что токен оператора вообще рабочий (иначе тест
  // прошёл бы и при сломанной авторизации).
  const token = await loginAs(page.request, 'OPERATOR');
  expect(token).toBeTruthy();
});
