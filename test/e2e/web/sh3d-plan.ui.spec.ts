import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { core, createFloor, createObject, deleteObject, runTag } from '../../helpers/core';
import { userByRole } from '../../helpers/users';

/**
 * UI-спека загрузки плана в формате Sweet Home 3D (.sh3d).
 *
 * Формат интегрирован в экосистему как «часть поэтажного плана»: админка
 * конвертирует .sh3d В БРАУЗЕРЕ (zip → Home.xml → canvas → PNG) и дальше идёт
 * тот же путь, что и для картинки — multipart в core → file-service, плюс
 * опциональный импорт помещений (название, площадь, координаты прямоугольника).
 * Сервер о .sh3d ничего не знает.
 *
 * Проверяется:
 *   1) пустая зона на канвасе: .sh3d открывает модалку с превью конвертации;
 *   2) после отправки план — обычный PNG (planImageUrl/planWidth/planScale),
 *      помещения созданы с координатами ВНУТРИ плана и площадью > 0;
 *   3) снимок чекбокса: без импорта — только план, ни одного помещения;
 *   4) битый .sh3d — понятная ошибка, план НЕ загружен.
 *
 * Требуется web-admin :5175 (прокси `/api` → core :3003, file-service :3002)
 * и поднятые сервисы. Уборка — объекты каскадом через API.
 */

const admin = userByRole('ADMIN');

/** Объекты прогона: сносятся каскадом (этажи, помещения, план в file-service). */
const createdObjectIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const objectId of createdObjectIds) {
    await deleteObject(request, objectId);
  }
  createdObjectIds.clear();
});

/** Валидная сцена Sweet Home 3D: 2 комнаты (12 м² и 6 м²) + стены-граница. */
function fixtureHomeXml(prefix: string): string {
  return `<?xml version='1.0'?>
<home version='7400' name='${prefix}.sh3d' wallHeight='1600.0'>
  <wall id='w1' xStart='0' yStart='0' xEnd='1000' yEnd='0' thickness='10'/>
  <wall id='w2' xStart='0' yStart='0' xEnd='0' yEnd='800' thickness='10'/>
  <wall id='w3' xStart='1000' yStart='0' xEnd='1000' yEnd='800' thickness='10'/>
  <wall id='w4' xStart='0' yStart='800' xEnd='1000' yEnd='800' thickness='10'/>
  <room id='r1' name='${prefix} Кабинет'>
    <point x='0' y='0'/>
    <point x='400' y='0'/>
    <point x='400' y='300'/>
    <point x='0' y='300'/>
  </room>
  <room id='r2' name='${prefix} Санузел'>
    <point x='500' y='0'/>
    <point x='700' y='0'/>
    <point x='700' y='300'/>
    <point x='500' y='300'/>
  </room>
</home>`;
}

async function makeSh3d(xml: string, name: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('Home.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

interface FloorDetail {
  planImageUrl: string | null;
  planWidth: number | null;
  planHeight: number | null;
  planScale: number | null;
  rooms: Array<{
    id: string;
    name: string;
    areaM2: number;
    floorType: string;
    coordsX: number | null;
    coordsY: number | null;
    coordsWidth: number | null;
    coordsHeight: number | null;
  }>;
}

async function floorDetail(request: APIRequestContext, floorId: string): Promise<FloorDetail> {
  const res = await core(request, 'get', `/api/floors/${floorId}/detail`);
  expect(res.status(), `деталь этажа: ${await res.text()}`).toBe(200);
  return (await res.json()) as FloorDetail;
}

/** Этаж без плана — пустая зона загрузки на канвасе. */
async function createBareFloor(
  request: APIRequestContext,
  tag: string,
): Promise<{ objectId: string; floorId: string }> {
  const object = await createObject(request, {
    name: `E2E-SH3D объект ${tag}`,
    address: 'Москва, ул. Форматная, 1',
  });
  createdObjectIds.add(object.id);
  const floor = await createFloor(request, object.id, { number: 1, name: 'ГД' });
  return { objectId: object.id, floorId: floor.id };
}

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function openFloorPlan(page: Page, objectId: string, floorId: string): Promise<void> {
  if (!/\/dashboard|\/objects/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page, admin.email, admin.password);
  }
  await page.goto(`/objects/${objectId}/floors/${floorId}`);
  await expect(page.getByTestId('floor-plan-canvas')).toBeVisible({ timeout: 20_000 });
}

test.describe('План этажа: Sweet Home 3D (.sh3d)', () => {
  test('.sh3d → PNG-план и импорт помещений из файла', async ({ page, request }) => {
    const tag = runTag();
    const { objectId, floorId } = await createBareFloor(request, tag);
    await openFloorPlan(page, objectId, floorId);

    // Пустая зона: бросаем .sh3d — модалка открывается с превью конвертации.
    const buffer = await makeSh3d(fixtureHomeXml(`E2E-SH3D-${tag}`), 'plan.sh3d');
    await page.getByTestId('floor-plan-upload').setInputFiles({
      name: `E2E-SH3D-${tag}.sh3d`,
      mimeType: 'application/octet-stream',
      buffer,
    });

    const preview = page.getByTestId('sh3d-preview');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText('PNG');
    await expect(preview).toContainText('2 помещений');
    // Импорт помещений включён по умолчанию — чекбокс трогаем только в другом тесте.
    await expect(page.getByTestId('sh3d-import-rooms')).toBeChecked();

    await page.getByTestId('floor-plan-upload-submit').click();

    // План отрисован (PNG уже в file-service)…
    await expect(page.getByTestId('floor-plan-image')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid^="room-row-"]')).toHaveCount(2, {
      timeout: 20_000,
    });

    // …и то же самое подтверждаем контрактом API (UI мог показать что угодно).
    const detail = await floorDetail(request, floorId);
    expect(detail.planImageUrl).toBeTruthy();
    expect(detail.planWidth ?? 0).toBeGreaterThan(0);
    expect(detail.planHeight ?? 0).toBeGreaterThan(0);
    expect(detail.planScale ?? 0).toBeGreaterThan(0);
    expect(detail.rooms).toHaveLength(2);

    for (const room of detail.rooms) {
      expect(room.areaM2).toBeGreaterThan(0);
      // Фикстура: 12 и 6 м² — ошибка «px·м» (3090 м² на ЗИЛ) ловится тут же.
      expect(room.areaM2, room.name).toBeLessThan(100);
      expect(room.floorType).toBe('Офис');
      expect(room.coordsX, room.name).not.toBeNull();
      expect(room.coordsY, room.name).not.toBeNull();
      expect(room.coordsWidth ?? 0, room.name).toBeGreaterThanOrEqual(1);
      expect(room.coordsHeight ?? 0, room.name).toBeGreaterThanOrEqual(1);
      // Прямоугольник целиком внутри размеров плана — валидация core пройдена.
      expect((room.coordsX ?? 0) + (room.coordsWidth ?? 0)).toBeLessThanOrEqual(
        detail.planWidth ?? Number.MAX_SAFE_INTEGER,
      );
      expect((room.coordsY ?? 0) + (room.coordsHeight ?? 0)).toBeLessThanOrEqual(
        detail.planHeight ?? Number.MAX_SAFE_INTEGER,
      );
    }
    expect(detail.rooms.map((room) => room.name).sort()).toEqual(
      [`E2E-SH3D-${tag} Кабинет`, `E2E-SH3D-${tag} Санузел`].sort(),
    );
  });

  test('снимок чекбокса: без импорта заливается только план', async ({ page, request }) => {
    const tag = runTag();
    const { objectId, floorId } = await createBareFloor(request, tag);
    await openFloorPlan(page, objectId, floorId);

    const buffer = await makeSh3d(fixtureHomeXml(`E2E-SH3D-NI-${tag}`), 'plan.sh3d');
    await page.getByTestId('floor-plan-upload').setInputFiles({
      name: `E2E-SH3D-NI-${tag}.sh3d`,
      mimeType: 'application/octet-stream',
      buffer,
    });

    await expect(page.getByTestId('sh3d-preview')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('sh3d-import-rooms').uncheck();
    await page.getByTestId('floor-plan-upload-submit').click();

    await expect(page.getByTestId('floor-plan-image')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid^="room-row-"]')).toHaveCount(0);

    const detail = await floorDetail(request, floorId);
    expect(detail.planImageUrl).toBeTruthy();
    expect(detail.rooms).toHaveLength(0);
  });

  test('битый .sh3d — понятная ошибка, план не загружен', async ({ page, request }) => {
    const tag = runTag();
    const { objectId, floorId } = await createBareFloor(request, tag);
    await openFloorPlan(page, objectId, floorId);

    await page.getByTestId('floor-plan-upload').setInputFiles({
      name: `E2E-SH3D-broken-${tag}.sh3d`,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('это точно не zip'),
    });

    await expect(page.getByText(/не читается как \.sh3d/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('sh3d-preview')).toHaveCount(0);
    // Отправлять нечего: модалка с ошибкой, этаж нетронут.
    const detail = await floorDetail(request, floorId);
    expect(detail.planImageUrl).toBeNull();
    expect(detail.rooms).toHaveLength(0);
  });
});
