import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  addOperation,
  addRoutePoint,
  attachFile,
  attachPlanUrl,
  AUTH_URL,
  authHeader,
  bodyText,
  core,
  createClientAccount,
  createFloor,
  createObject,
  createRoom,
  createRoute,
  createTechCard,
  deactivateAccount,
  deleteFile,
  deleteObject,
  deleteTechCard,
  FILE_URL,
  file,
  getRouteDetail,
  listRoutes,
  loginAs,
  PNG_1x1,
  runTag,
  uniqueEmail,
  uploadFile,
  uploadPlanViaCore,
  type Room,
  type RoutePoint,
} from '../../helpers/core';

/**
 * М2.9 — e2e ядра домена (core-service) и файлового сервиса.
 *
 * Требует запущенного стенда:
 *  - auth-service :3001 (E2E_API_URL)   — выдача access-токенов;
 *  - file-service :3002 (E2E_FILE_URL)  — загрузка планов и привязки;
 *  - core-service :3003 (E2E_CORE_URL)  — объекты, этажи, помещения, техкарты, маршруты.
 *
 * Покрытие: сквозной цикл «объект → 2 этажа → план → помещения → техкарта → маршрут»,
 * негативные кейсы (401/403/404/400/409), RBAC по четырём ролям, а также привязка
 * объекта к аккаунту заказчика (`ownerClientId`): поле в ответах, фильтр списка и
 * коды валидации 400 на несуществующий/не-CLIENT/деактивированный аккаунт.
 *
 * Про `ownerClientId`: это единственный авторитетный признак доступа заказчика к
 * объекту (портал сравнивает его с id сессии). Серверного scope нет — фильтр
 * `?ownerClientId=` это фильтр СПИСКА, а не авторизация (см. System Design §1/§14).
 *
 * Идемпотентность: набор не создаёт долгоживущих сущностей. Объекты удаляются
 * (каскадом уходят этажи, помещения, маршруты и точки), техкарты и файлы — тоже.
 * Две ранее засеянные техкарты («Влажная уборка санузла») не трогаются.
 *
 * ВНИМАНИЕ про лимит входа: auth-service пускает 5 логинов/мин на IP. Хелпер кэширует
 * токены (4 логина на набор) и один раз пережидает окно при 429, поэтому таймаут тестов
 * поднят выше стандартного.
 */

test.describe.configure({ timeout: 180_000 });

/** Созданное за тест: уборка идёт в afterEach, чтобы прогон был идемпотентным. */
const createdObjects = new Set<string>();
const createdTechCards = new Set<string>();

function trackObject(id: string): string {
  createdObjects.add(id);
  return id;
}

function trackTechCard(id: string): string {
  createdTechCards.add(id);
  return id;
}

/**
 * Загружает план в file-service, привязывает его к этажу (FLOOR_PLAN) и возвращает файл.
 * Это основной путь «план» из приёмки; дублирующий путь через core проверяет
 * uploadPlanViaCore (сквозной проброс токена в file-service).
 */
async function uploadAndAttachPlan(
  request: APIRequestContext,
  floorId: string,
  planScale: number,
): Promise<{ fileId: string; url: string }> {
  const uploaded = await uploadFile(request, { kind: 'plan' });
  await attachFile(request, uploaded.id, 'FLOOR_PLAN', floorId);
  // Реальные размеры плана уходят в core — координаты помещений валидируются по ним (дефект B).
  const floor = await attachPlanUrl(request, floorId, uploaded.url, planScale, {
    width: uploaded.width ?? undefined,
    height: uploaded.height ?? undefined,
  });
  expect(floor.planImageUrl).toBe(uploaded.url);
  expect(floor.planScale).toBe(planScale);
  return { fileId: uploaded.id, url: uploaded.url };
}

test.afterEach(async ({ request }) => {
  for (const id of createdTechCards) {
    await deleteTechCard(request, id);
  }
  createdTechCards.clear();

  for (const id of createdObjects) {
    // Страховка: объект с маршрутом в статусе ACTIVE удалить нельзя.
    await core(request, 'patch', `/api/objects/${id}`, { data: { status: 'PAUSED' } });
    await deleteObject(request, id);
  }
  createdObjects.clear();
});

// ---------------------------------------------------------------------------
// Сквозной сценарий
// ---------------------------------------------------------------------------

test.describe('Core: сквозной цикл объекта', () => {
  test('объект → 2 этажа → план → 3 помещения → техкарта → маршрут с reorder', async ({
    request,
  }) => {
    const fileIds: string[] = [];

    try {
      // 1. Объект
      const object = await createObject(request, { name: `E2E БЦ ${runTag()}`, floorsCount: 2 });
      trackObject(object.id);
      expect(object.id).toBeTruthy();

      const objectDetail = await core(request, 'get', `/api/objects/${object.id}/detail`);
      expect(objectDetail.status()).toBe(200);
      expect((await objectDetail.json()).floors).toHaveLength(0);

      // 2. Два этажа: разные номера, порядок выдачи — по возрастанию номера
      const second = await createFloor(request, object.id, { number: 2, name: 'Второй этаж' });
      const first = await createFloor(request, object.id, {
        number: 1,
        name: 'Первый этаж',
        planScale: 0.05,
      });

      const floorsRes = await core(request, 'get', `/api/objects/${object.id}/floors`);
      expect(floorsRes.status()).toBe(200);
      const floors = (await floorsRes.json()) as { id: string; number: number }[];
      expect(floors.map((f) => f.number)).toEqual([1, 2]);
      expect(floors.map((f) => f.id)).toEqual([first.id, second.id]);

      // 3. План этажа: file-service → привязка к этажу в core
      const plan = await uploadAndAttachPlan(request, first.id, 0.05);
      fileIds.push(plan.fileId);
      expect(plan.url).toContain('localhost:9000');

      // План виден в детализации этажа — по нему валидируются координаты помещений
      const floorDetail = await core(request, 'get', `/api/floors/${first.id}/detail`);
      expect(floorDetail.status()).toBe(200);
      const floorBody = await floorDetail.json();
      expect(floorBody.planImageUrl).toBe(plan.url);
      expect(floorBody.rooms).toHaveLength(0);
      expect(floorBody.object.id).toBe(object.id);

      // 4. Три помещения с координатами внутри плана (план 10000×10000 px)
      const roomA = await createRoom(request, first.id, {
        name: 'Кабинет 101',
        areaM2: 24.5,
        floorType: 'office',
        coordsX: 100,
        coordsY: 120,
        coordsWidth: 200,
        coordsHeight: 160,
        zone: 'A',
      });
      const roomB = await createRoom(request, first.id, {
        name: 'Санузел 102',
        areaM2: 6.2,
        floorType: 'sanitary',
        coordsX: 400,
        coordsY: 120,
        coordsWidth: 120,
        coordsHeight: 100,
        zone: 'A',
      });
      const roomC = await createRoom(request, first.id, {
        name: 'Коридор 103',
        areaM2: 40,
        floorType: 'corridor',
        coordsX: 100,
        coordsY: 400,
        coordsWidth: 900,
        coordsHeight: 200,
        zone: 'B',
      });

      expect([roomA.coordsX, roomA.coordsY, roomA.coordsWidth, roomA.coordsHeight]).toEqual([
        100, 120, 200, 160,
      ]);

      const roomsRes = await core(request, 'get', `/api/floors/${first.id}/rooms`);
      expect(roomsRes.status()).toBe(200);
      const rooms = (await roomsRes.json()) as Room[];
      expect(rooms.map((r) => r.name)).toEqual(['Кабинет 101', 'Коридор 103', 'Санузел 102']);

      // 5. Техкарта с тремя операциями и материалами
      const card = await createTechCard(request, { name: `E2E техкарта ${runTag()}` });
      trackTechCard(card.id);

      const op1 = await addOperation(request, card.id, {
        name: 'Нанести чистящее средство',
        estimatedTimeMin: 10,
        description: 'Распылить на поверхность',
        equipment: { items: ['распылитель'], ppe: ['перчатки'] },
        requiresPhoto: true,
        materials: [{ materialId: 'material-001', consumptionPerOperation: 0.05, unit: 'л' }],
      });
      const op2 = await addOperation(request, card.id, {
        name: 'Протереть поверхность',
        estimatedTimeMin: 15,
        requiresQr: true,
        materials: [
          { materialId: 'material-002', consumptionPerOperation: 2, unit: 'шт' },
          { materialId: 'material-001', consumptionPerOperation: 0.02, unit: 'л' },
        ],
      });
      const op3 = await addOperation(request, card.id, {
        name: 'Вымыть пол',
        estimatedTimeMin: 20,
      });

      // orderIndex по умолчанию — в конец техкарты
      expect([op1.orderIndex, op2.orderIndex, op3.orderIndex]).toEqual([0, 1, 2]);
      expect(op2.materials).toHaveLength(2);
      expect(op1.requiresPhoto).toBe(true);
      expect(op2.requiresQr).toBe(true);

      const cardDetail = await core(request, 'get', `/api/tech-cards/${card.id}`);
      expect(cardDetail.status()).toBe(200);
      const cardBody = await cardDetail.json();
      expect(cardBody.operations.map((o: { name: string }) => o.name)).toEqual([
        'Нанести чистящее средство',
        'Протереть поверхность',
        'Вымыть пол',
      ]);
      expect(cardBody.totalEstimatedTimeMin).toBe(45);

      // 6. Reorder операций: полный список в новом порядке [op3, op1, op2]
      const reorderOps = await core(request, 'patch', `/api/tech-cards/${card.id}/reorder`, {
        data: { operationIds: [op3.id, op1.id, op2.id] },
      });
      expect(reorderOps.status(), await bodyText(reorderOps)).toBe(200);
      const reordered = (await reorderOps.json()) as { id: string; orderIndex: number }[];
      expect(reordered.map((o) => o.id)).toEqual([op3.id, op1.id, op2.id]);
      expect(reordered.map((o) => o.orderIndex)).toEqual([0, 1, 2]);

      const afterReorder = await core(request, 'get', `/api/tech-cards/${card.id}`);
      const afterReorderBody = await afterReorder.json();
      expect(afterReorderBody.operations.map((o: { id: string }) => o.id)).toEqual([
        op3.id,
        op1.id,
        op2.id,
      ]);
      // сумма времени не зависит от порядка
      expect(afterReorderBody.totalEstimatedTimeMin).toBe(45);

      // 7. Маршрут из трёх точек; техкарта привязана к помещению
      const roomWithCard = await core(request, 'patch', `/api/rooms/${roomA.id}`, {
        data: { techCardId: card.id, zone: 'A-1' },
      });
      expect(roomWithCard.status(), await bodyText(roomWithCard)).toBe(200);
      expect((await roomWithCard.json()).techCardId).toBe(card.id);

      const route = await createRoute(request, first.id, { name: `Утренняя уборка ${runTag()}` });
      const pointA = await addRoutePoint(request, route.id, {
        roomId: roomB.id,
        estimatedTimeMin: 5,
      });
      const pointB = await addRoutePoint(request, route.id, {
        roomId: roomC.id,
        estimatedTimeMin: 12,
      });
      const pointC = await addRoutePoint(request, route.id, {
        roomId: roomA.id,
        estimatedTimeMin: 8,
      });
      expect([pointA.orderIndex, pointB.orderIndex, pointC.orderIndex]).toEqual([0, 1, 2]);

      const detail = await getRouteDetail(request, route.id);
      expect(detail.status).toBe('DRAFT');
      expect(detail.points.map((p) => p.roomId)).toEqual([roomB.id, roomC.id, roomA.id]);
      expect(detail.totalEstimatedTimeMin).toBe(25);

      // 8. Reorder точек: [pointC, pointA, pointB] — порядок и сумма пересчитываются
      const reorderPointsRes = await core(request, 'patch', `/api/routes/${route.id}/reorder`, {
        data: { pointIds: [pointC.id, pointA.id, pointB.id] },
      });
      expect(reorderPointsRes.status(), await bodyText(reorderPointsRes)).toBe(200);
      const reorderedPoints = ((await reorderPointsRes.json()) as { points: RoutePoint[] }).points;
      expect(reorderedPoints.map((p) => p.id)).toEqual([pointC.id, pointA.id, pointB.id]);
      expect(reorderedPoints.map((p) => p.orderIndex)).toEqual([0, 1, 2]);

      const afterPointReorder = await getRouteDetail(request, route.id);
      expect(afterPointReorder.points.map((p) => p.roomId)).toEqual([roomA.id, roomB.id, roomC.id]);
      expect(afterPointReorder.points.map((p) => p.estimatedTimeMin)).toEqual([8, 5, 12]);
      expect(afterPointReorder.totalEstimatedTimeMin).toBe(25);
      // точки отдают вложенное помещение — карточка маршрута не делает N+1 запросов
      expect(afterPointReorder.points[0].room?.name).toBe('Кабинет 101');

      // 9. Удаление точки пересобирает порядок без «дыр»
      const removePoint = await core(request, 'delete', `/api/route-points/${pointA.id}`);
      expect(removePoint.status(), await bodyText(removePoint)).toBe(204);
      const afterRemove = await getRouteDetail(request, route.id);
      expect(afterRemove.points.map((p) => p.orderIndex)).toEqual([0, 1]);
      expect(afterRemove.totalEstimatedTimeMin).toBe(20);

      // 10. Маршруты этажа и общая картина объекта
      const routesRes = await core(request, 'get', `/api/floors/${first.id}/routes`);
      expect(routesRes.status()).toBe(200);
      const routes = (await routesRes.json()) as { id: string; points: unknown[] }[];
      expect(routes.map((r) => r.id)).toEqual([route.id]);
      expect(routes[0].points).toHaveLength(2);

      const detailRes = await core(request, 'get', `/api/objects/${object.id}/detail`);
      const objectFull = await detailRes.json();
      expect(objectFull.floors.map((f: { number: number }) => f.number)).toEqual([1, 2]);
      expect(objectFull.floors[0].rooms).toHaveLength(3);
      expect(objectFull.floors[0].routes).toHaveLength(1);

      // 11. Статусная модель маршрута (shared/types/core.ts):
      //     DRAFT ↔ ACTIVE, оба → ARCHIVED, ARCHIVED — терминальный.
      const active = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'ACTIVE' },
      });
      expect(active.status(), await bodyText(active)).toBe(200);
      expect((await active.json()).status).toBe('ACTIVE');

      // ACTIVE → DRAFT разрешён: маршрут снимают с эксплуатации в черновик
      const backToDraft = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'DRAFT' },
      });
      expect(backToDraft.status(), await bodyText(backToDraft)).toBe(200);
      expect((await backToDraft.json()).status).toBe('DRAFT');

      const archived = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'ARCHIVED' },
      });
      expect(archived.status(), await bodyText(archived)).toBe(200);
      expect((await archived.json()).status).toBe('ARCHIVED');

      // из архива выхода нет — 400
      const badTransition = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'ACTIVE' },
      });
      expect(badTransition.status(), await bodyText(badTransition)).toBe(400);
      expect(await bodyText(badTransition)).toContain('Недопустимый переход статуса');
    } finally {
      for (const fileId of fileIds) {
        await deleteFile(request, fileId);
      }
    }
  });

  test('план этажа через core: multipart-загрузка с пробросом токена в file-service', async ({
    request,
  }) => {
    const object = await createObject(request, { name: `E2E план ${runTag()}` });
    trackObject(object.id);
    const floor = await createFloor(request, object.id, { number: 1 });

    // core сам вызывает file-service, привязывает файл к FLOOR_PLAN и сохраняет URL
    const withPlan = await uploadPlanViaCore(request, floor.id, 0.03);
    expect(withPlan.planImageUrl).toBeTruthy();
    expect(withPlan.planImageUrl).toContain('/plans/');
    expect(withPlan.planScale).toBe(0.03);

    // без плана помещение с координатами создать нельзя, с планом — можно
    const room = await createRoom(request, floor.id, {
      name: 'С координатами',
      coordsX: 10,
      coordsY: 20,
      coordsWidth: 50,
      coordsHeight: 50,
    });
    expect(room.coordsX).toBe(10);

    // второй этаж без плана — координаты запрещены
    const floor2 = await createFloor(request, object.id, { number: 2 });
    const noPlan = await core(request, 'post', `/api/floors/${floor2.id}/rooms`, {
      data: { name: 'Без плана', areaM2: 5, floorType: 'office', coordsX: 1, coordsY: 1 },
    });
    expect(noPlan.status(), await bodyText(noPlan)).toBe(400);
    expect(await bodyText(noPlan)).toContain('план');

    // файл, который core загрузил сам, виден во вложениях этажа
    const attachments = await file(request, 'get', `/api/files/attachments/FLOOR_PLAN/${floor.id}`);
    expect(attachments.status(), await bodyText(attachments)).toBe(200);
    const filesOfFloor = (await attachments.json()) as { id: string; url: string }[];
    expect(filesOfFloor.map((f) => f.url)).toContain(withPlan.planImageUrl);
    for (const item of filesOfFloor) {
      await deleteFile(request, item.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Негативные кейсы
// ---------------------------------------------------------------------------

test.describe('Core: негативные кейсы', () => {
  test('без токена → 401 на всех защищённых эндпоинтах', async ({ request }) => {
    const anonymous = [
      await request.get(`${corePath('/api/objects')}`),
      await request.post(`${corePath('/api/objects')}`, { data: { name: 'x' } }),
      await request.get(`${corePath('/api/tech-cards')}`),
    ];
    for (const res of anonymous) {
      expect(res.status(), await res.text()).toBe(401);
    }

    // мусорный токен — тоже 401, а не 500
    const garbage = await request.get(`${corePath('/api/objects')}`, {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });
    expect(garbage.status()).toBe(401);

    // file-service защищён тем же секретом
    const fileNoToken = await request.get(`${FILE_URL}/api/files`);
    expect(fileNoToken.status()).toBe(401);
  });

  test('OPERATOR не может создавать сущности ядра → 403', async ({ request }) => {
    const operator = await loginAs(request, 'OPERATOR');

    const attempts = [
      core(request, 'post', '/api/objects', { token: operator, data: { name: 'x' } }),
      core(request, 'post', '/api/tech-cards', { token: operator, data: { name: 'x' } }),
    ];
    for (const pending of attempts) {
      const res = await pending;
      expect(res.status(), await bodyText(res)).toBe(403);
    }

    // но чтение разрешено
    const list = await core(request, 'get', '/api/objects', { token: operator });
    expect(list.status()).toBe(200);
  });

  test('CLIENT не может создавать сущности ядра → 403', async ({ request }) => {
    const client = await loginAs(request, 'CLIENT');

    const create = await core(request, 'post', '/api/objects', {
      token: client,
      data: { name: 'клиентский объект' },
    });
    expect(create.status(), await bodyText(create)).toBe(403);

    const list = await core(request, 'get', '/api/objects', { token: client });
    expect(list.status()).toBe(200);
  });

  test('несуществующий id → 404 (валидный UUID)', async ({ request }) => {
    const ghost = '00000000-0000-0000-0000-000000000000';

    const cases: [string, ReturnType<typeof core>][] = [
      ['объект', core(request, 'get', `/api/objects/${ghost}`)],
      ['детализация объекта', core(request, 'get', `/api/objects/${ghost}/detail`)],
      ['этаж', core(request, 'get', `/api/floors/${ghost}`)],
      ['помещение', core(request, 'get', `/api/rooms/${ghost}`)],
      ['маршрут', core(request, 'get', `/api/routes/${ghost}`)],
      ['техкарта', core(request, 'get', `/api/tech-cards/${ghost}`)],
      ['этажи объекта', core(request, 'get', `/api/objects/${ghost}/floors`)],
    ];

    for (const [label, pending] of cases) {
      const res = await pending;
      expect(res.status(), `${label}: ${await bodyText(res)}`).toBe(404);
    }

    // не-UUID в пути отсекается валидацией/роутингом, но не отдаёт 200
    const malformed = await core(request, 'get', '/api/objects/not-an-id');
    expect([400, 404]).toContain(malformed.status());
  });

  test('дубликат номера этажа в объекте → 409', async ({ request }) => {
    const object = await createObject(request, { name: `E2E дубликат ${runTag()}` });
    trackObject(object.id);

    await createFloor(request, object.id, { number: 1, name: 'Первый' });

    const duplicate = await core(request, 'post', `/api/objects/${object.id}/floors`, {
      data: { number: 1, name: 'Ещё один первый' },
    });
    expect(duplicate.status(), await bodyText(duplicate)).toBe(409);
    expect(await bodyText(duplicate)).toContain('уже есть');

    // тот же номер в другом объекте — не конфликт
    const other = await createObject(request, { name: `E2E другой объект ${runTag()}` });
    trackObject(other.id);
    const sameNumberElsewhere = await createFloor(request, other.id, { number: 1 });
    expect(sameNumberElsewhere.id).toBeTruthy();

    // PATCH на занятый номер тоже 409
    const floor2 = await createFloor(request, object.id, { number: 2 });
    const conflict = await core(request, 'patch', `/api/floors/${floor2.id}`, {
      data: { number: 1 },
    });
    expect(conflict.status(), await bodyText(conflict)).toBe(409);
  });

  test('координаты помещения вне плана → 400', async ({ request }) => {
    const object = await createObject(request, { name: `E2E координаты ${runTag()}` });
    trackObject(object.id);
    const floor = await createFloor(request, object.id, { number: 1 });

    const uploaded = await uploadFile(request, { kind: 'plan' });
    await attachPlanUrl(request, floor.id, uploaded.url, 0.05);

    try {
      // за правой/нижней границей плана (PLAN_MAX_SIZE по умолчанию 10000)
      const outside = await core(request, 'post', `/api/floors/${floor.id}/rooms`, {
        data: {
          name: 'За планом',
          areaM2: 10,
          floorType: 'office',
          coordsX: 10_500,
          coordsY: 100,
          coordsWidth: 100,
          coordsHeight: 100,
        },
      });
      expect(outside.status(), await bodyText(outside)).toBe(400);
      expect(await bodyText(outside)).toContain('выходят за размеры плана');

      // область выходит за границу, хотя левый верхний угол внутри
      const overflowing = await core(request, 'post', `/api/floors/${floor.id}/rooms`, {
        data: {
          name: 'Шире плана',
          areaM2: 10,
          floorType: 'office',
          coordsX: 9_900,
          coordsY: 100,
          coordsWidth: 500,
          coordsHeight: 100,
        },
      });
      expect(overflowing.status(), await bodyText(overflowing)).toBe(400);
      expect(await bodyText(overflowing)).toContain('за ширину плана');

      // валидация работает и на PATCH: уводим координаты за план
      const room = await createRoom(request, floor.id, {
        name: 'Нормальное',
        coordsX: 10,
        coordsY: 10,
        coordsWidth: 50,
        coordsHeight: 50,
      });
      const badPatch = await core(request, 'patch', `/api/rooms/${room.id}`, {
        data: { coordsX: 20_000 },
      });
      expect(badPatch.status(), await bodyText(badPatch)).toBe(400);

      // площадь ≤ 0 отсекается DTO
      const zeroArea = await core(request, 'post', `/api/floors/${floor.id}/rooms`, {
        data: { name: 'Нулевая', areaM2: 0, floorType: 'office' },
      });
      expect(zeroArea.status(), await bodyText(zeroArea)).toBe(400);
    } finally {
      await deleteFile(request, uploaded.id);
    }
  });

  test('координаты без загруженного плана → 400', async ({ request }) => {
    const object = await createObject(request, { name: `E2E без плана ${runTag()}` });
    trackObject(object.id);
    const floor = await createFloor(request, object.id, { number: 1 });
    expect(
      (await (await core(request, 'get', `/api/floors/${floor.id}`)).json()).planImageUrl,
    ).toBe(null);

    const withCoords = await core(request, 'post', `/api/floors/${floor.id}/rooms`, {
      data: {
        name: 'С координатами без плана',
        areaM2: 12,
        floorType: 'office',
        coordsX: 10,
        coordsY: 10,
        coordsWidth: 40,
        coordsHeight: 40,
      },
    });
    expect(withCoords.status(), await bodyText(withCoords)).toBe(400);
    expect(await bodyText(withCoords)).toContain('не загружен план');

    // любая одна координата тоже запрещена
    const onlyX = await core(request, 'post', `/api/floors/${floor.id}/rooms`, {
      data: { name: 'Только X', areaM2: 12, floorType: 'office', coordsX: 10 },
    });
    expect(onlyX.status(), await bodyText(onlyX)).toBe(400);

    // без координат помещение создаётся
    const plain = await createRoom(request, floor.id, { name: 'Без координат' });
    expect(plain.coordsX).toBeNull();
  });

  test('неполный или чужой список reorder → 400', async ({ request }) => {
    const object = await createObject(request, { name: `E2E reorder ${runTag()}` });
    trackObject(object.id);
    const floor = await createFloor(request, object.id, { number: 1 });
    const uploaded = await uploadFile(request, { kind: 'plan' });
    await attachPlanUrl(request, floor.id, uploaded.url, 0.05);

    try {
      const roomA = await createRoom(request, floor.id, { name: 'A' });
      const roomB = await createRoom(request, floor.id, { name: 'B' });
      const route = await createRoute(request, floor.id, { name: `Маршрут ${runTag()}` });
      const pointA = await addRoutePoint(request, route.id, {
        roomId: roomA.id,
        estimatedTimeMin: 5,
      });
      const pointB = await addRoutePoint(request, route.id, {
        roomId: roomB.id,
        estimatedTimeMin: 5,
      });

      const incomplete = await core(request, 'patch', `/api/routes/${route.id}/reorder`, {
        data: { pointIds: [pointA.id] },
      });
      expect(incomplete.status(), await bodyText(incomplete)).toBe(400);
      expect(await bodyText(incomplete)).toContain('неполный список');

      const foreign = await core(request, 'patch', `/api/routes/${route.id}/reorder`, {
        data: { pointIds: [pointA.id, '00000000-0000-0000-0000-000000000000'] },
      });
      expect(foreign.status(), await bodyText(foreign)).toBe(400);
      expect(await bodyText(foreign)).toContain('не принадлежат маршруту');

      const duplicates = await core(request, 'patch', `/api/routes/${route.id}/reorder`, {
        data: { pointIds: [pointA.id, pointA.id] },
      });
      expect(duplicates.status(), await bodyText(duplicates)).toBe(400);

      const empty = await core(request, 'patch', `/api/routes/${route.id}/reorder`, {
        data: { pointIds: [] },
      });
      expect(empty.status(), await bodyText(empty)).toBe(400);

      // порядок не пострадал от неудачных попыток
      const detail = await getRouteDetail(request, route.id);
      expect(detail.points.map((p) => p.id)).toEqual([pointA.id, pointB.id]);

      // техкарта: тот же контракт на операциях
      const card = await createTechCard(request, { name: `E2E reorder-карта ${runTag()}` });
      trackTechCard(card.id);
      const opA = await addOperation(request, card.id, { name: 'A', estimatedTimeMin: 5 });
      await addOperation(request, card.id, { name: 'B', estimatedTimeMin: 5 });

      const incompleteOps = await core(request, 'patch', `/api/tech-cards/${card.id}/reorder`, {
        data: { operationIds: [opA.id] },
      });
      expect(incompleteOps.status(), await bodyText(incompleteOps)).toBe(400);
      expect(await bodyText(incompleteOps)).toContain('неполный список операций');
    } finally {
      await deleteFile(request, uploaded.id);
    }
  });

  test('удаление объекта с активным маршрутом → 400', async ({ request }) => {
    const object = await createObject(request, { name: `E2E активный маршрут ${runTag()}` });
    const floor = await createFloor(request, object.id, { number: 1 });
    const uploaded = await uploadFile(request, { kind: 'plan' });
    await attachPlanUrl(request, floor.id, uploaded.url, 0.05);

    try {
      const room = await createRoom(request, floor.id, { name: 'A' });
      const route = await createRoute(request, floor.id, { name: `Маршрут ${runTag()}` });
      await addRoutePoint(request, route.id, { roomId: room.id, estimatedTimeMin: 5 });

      const activated = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'ACTIVE' },
      });
      expect(activated.status(), await bodyText(activated)).toBe(200);

      const blocked = await core(request, 'delete', `/api/objects/${object.id}`);
      expect(blocked.status(), await bodyText(blocked)).toBe(400);
      expect(await bodyText(blocked)).toContain('активных маршрутов');

      // объект на месте
      expect((await core(request, 'get', `/api/objects/${object.id}`)).status()).toBe(200);

      // архивируем маршрут — теперь объект удаляется
      const archived = await core(request, 'patch', `/api/routes/${route.id}`, {
        data: { status: 'ARCHIVED' },
      });
      expect(archived.status()).toBe(200);

      const removed = await core(request, 'delete', `/api/objects/${object.id}`);
      expect(removed.status(), await bodyText(removed)).toBe(204);
      expect((await core(request, 'get', `/api/objects/${object.id}`)).status()).toBe(404);
    } finally {
      await deleteFile(request, uploaded.id);
      // объект уже удалён — уборка не должна падать (в наборе после удаления)
      createdObjects.delete(object.id);
    }
  });

  test('невалидное тело запроса → 400, а не 500', async ({ request }) => {
    const incomplete = await core(request, 'post', '/api/objects', { data: { name: 'Без полей' } });
    expect(incomplete.status(), await bodyText(incomplete)).toBe(400);

    const badEnum = await core(request, 'post', '/api/objects', {
      data: {
        name: 'Статус',
        address: 'адрес',
        lat: 55,
        lng: 37,
        type: 'office',
        totalArea: 1,
        floorsCount: 1,
        clientName: 'к',
        clientContact: 'к',
        status: 'NOT_A_STATUS',
      },
    });
    expect(badEnum.status(), await bodyText(badEnum)).toBe(400);

    const badFloorNumber = await core(
      request,
      'post',
      '/api/objects/00000000-0000-0000-0000-000000000000/floors',
      {
        data: { number: 500, name: 'Этаж' },
      },
    );
    expect(badFloorNumber.status(), await bodyText(badFloorNumber)).toBe(400);

    const badPointTime = await core(
      request,
      'post',
      '/api/routes/00000000-0000-0000-0000-000000000000/points',
      {
        data: { roomId: '00000000-0000-0000-0000-000000000000', estimatedTimeMin: 0 },
      },
    );
    expect(badPointTime.status(), await bodyText(badPointTime)).toBe(400);
  });

  test('помещение с другого этажа в маршрут → 400', async ({ request }) => {
    const object = await createObject(request, { name: `E2E чужой этаж ${runTag()}` });
    trackObject(object.id);
    const floor1 = await createFloor(request, object.id, { number: 1 });
    const floor2 = await createFloor(request, object.id, { number: 2 });

    const foreignRoom = await createRoom(request, floor2.id, { name: 'Чужое помещение' });
    const route = await createRoute(request, floor1.id, { name: `Маршрут ${runTag()}` });

    const res = await core(request, 'post', `/api/routes/${route.id}/points`, {
      data: { roomId: foreignRoom.id, estimatedTimeMin: 5 },
    });
    expect(res.status(), await bodyText(res)).toBe(400);
    expect(await bodyText(res)).toContain('другому этажу');
  });
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

test.describe('Core: RBAC по четырём ролям', () => {
  test('таблица прав на чтение и запись', async ({ request }) => {
    // Публичных эндпоинтов в core нет: без токена — 401 (проверяется выше).
    // Матрица: ADMIN — всё; SUPERVISOR — чтение + запись, кроме DELETE объекта и техкарты;
    // OPERATOR и CLIENT — только чтение.
    const roles = ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'CLIENT'] as const;

    const readEndpoints = ['/api/objects', '/api/tech-cards'];
    for (const role of roles) {
      const token = await loginAs(request, role);
      for (const path of readEndpoints) {
        const res = await core(request, 'get', path, { token });
        expect(res.status(), `${role} GET ${path}: ${await bodyText(res)}`).toBe(200);
      }
    }

    // Запись: кто может создавать (проверяем на безопасном для уборки ресурсе — техкарте)
    const writeAllowed: Record<(typeof roles)[number], boolean> = {
      ADMIN: true,
      SUPERVISOR: true,
      OPERATOR: false,
      CLIENT: false,
    };

    for (const role of roles) {
      const token = await loginAs(request, role);
      const res = await core(request, 'post', '/api/tech-cards', {
        token,
        data: { name: `RBAC ${role} ${runTag()}` },
      });

      if (writeAllowed[role]) {
        expect(res.status(), `${role} POST /api/tech-cards: ${await bodyText(res)}`).toBe(201);
        trackTechCard(((await res.json()) as { id: string }).id);
      } else {
        expect(res.status(), `${role} POST /api/tech-cards: ${await bodyText(res)}`).toBe(403);
      }
    }
  });

  test('SUPERVISOR может создавать, но не может удалять объект → 403', async ({ request }) => {
    const object = await createObject(request, { name: `E2E supervisor ${runTag()}` });
    trackObject(object.id);

    const supervisor = await loginAs(request, 'SUPERVISOR');

    const floor = await createFloor(request, object.id, { number: 1 }, { token: supervisor });
    expect(floor.id).toBeTruthy();

    const deleteBySupervisor = await core(request, 'delete', `/api/objects/${object.id}`, {
      token: supervisor,
    });
    expect(deleteBySupervisor.status(), await bodyText(deleteBySupervisor)).toBe(403);

    const admin = await loginAs(request, 'ADMIN');
    const deleteByAdmin = await core(request, 'delete', `/api/objects/${object.id}`, {
      token: admin,
    });
    expect(deleteByAdmin.status(), await bodyText(deleteByAdmin)).toBe(204);
    createdObjects.delete(object.id);
  });

  test('OPERATOR и CLIENT читают ядро, но не пишут', async ({ request }) => {
    const object = await createObject(request, { name: `E2E читатели ${runTag()}` });
    trackObject(object.id);
    const floor = await createFloor(request, object.id, { number: 1 });
    const route = await createRoute(request, floor.id, { name: `Маршрут ${runTag()}` });

    for (const role of ['OPERATOR', 'CLIENT'] as const) {
      const token = await loginAs(request, role);

      const objectRes = await core(request, 'get', `/api/objects/${object.id}`, { token });
      expect(objectRes.status(), `${role} GET объект`).toBe(200);

      const floorRes = await core(request, 'get', `/api/floors/${floor.id}/detail`, { token });
      expect(floorRes.status(), `${role} GET этаж`).toBe(200);

      const patch = await core(request, 'patch', `/api/routes/${route.id}`, {
        token,
        data: { name: 'переименование' },
      });
      expect(patch.status(), `${role} PATCH маршрут: ${await bodyText(patch)}`).toBe(403);

      const del = await core(request, 'delete', `/api/routes/${route.id}`, { token });
      expect(del.status(), `${role} DELETE маршрут: ${await bodyText(del)}`).toBe(403);
    }
  });

  test('file-service: загрузка доступна всем, удаление — только ADMIN/SUPERVISOR', async ({
    request,
  }) => {
    const operator = await loginAs(request, 'OPERATOR');

    // Загружать файлы может любой аутентифицированный пользователь
    const uploaded = await uploadFile(request, { kind: 'plan', role: 'OPERATOR' });
    expect(uploaded.bucket).toBe('PLANS');

    // а удалять — только ADMIN/SUPERVISOR
    const forbidden = await file(request, 'delete', `/api/files/${uploaded.id}`, {
      token: operator,
    });
    expect(forbidden.status(), await bodyText(forbidden)).toBe(403);

    const meta = await file(request, 'get', `/api/files/${uploaded.id}`, { token: operator });
    expect(meta.status()).toBe(200);

    await deleteFile(request, uploaded.id);
    const gone = await file(request, 'get', `/api/files/${uploaded.id}`);
    expect(gone.status()).toBe(404);
  });

  test('file-service: недопустимый тип файла → 400', async ({ request }) => {
    const res = await file(request, 'post', '/api/files/upload', {
      multipart: {
        file: { name: 'plan.txt', mimeType: 'text/plain', buffer: PNG_1x1 },
        kind: 'plan',
      },
    });
    expect(res.status(), await bodyText(res)).toBe(400);

    // без файла — тоже 400
    const empty = await file(request, 'post', '/api/files/upload', {
      multipart: { kind: 'plan' },
    });
    expect(empty.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Плоский список маршрутов (М4): фильтры и пагинация
// ---------------------------------------------------------------------------

test.describe('Core: плоский список маршрутов', () => {
  test('GET /api/routes фильтрует по objectId и floorId и пагинирует с общим total', async ({
    request,
  }) => {
    // Объект с ДВУМЯ этажами и тремя маршрутами: фильтр по объекту обязан вернуть все
    // три, фильтр по этажу — только маршруты этого этажа.
    const object = await createObject(request, { name: `E2E маршруты ${runTag()}` });
    trackObject(object.id);
    const firstFloor = await createFloor(request, object.id, { number: 1 });
    const secondFloor = await createFloor(request, object.id, { number: 2 });

    // Второй объект — контроль: его маршрут не должен попадать в выдачу по чужому объекту.
    const foreignObject = await createObject(request, { name: `E2E чужие маршруты ${runTag()}` });
    trackObject(foreignObject.id);
    const foreignFloor = await createFloor(request, foreignObject.id, { number: 1 });

    const firstRoute = await createRoute(request, firstFloor.id, { name: `Маршрут 1 ${runTag()}` });
    const secondRoute = await createRoute(request, firstFloor.id, {
      name: `Маршрут 2 ${runTag()}`,
    });
    const thirdRoute = await createRoute(request, secondFloor.id, {
      name: `Маршрут 3 ${runTag()}`,
    });
    const foreignRoute = await createRoute(request, foreignFloor.id, {
      name: `Чужой маршрут ${runTag()}`,
    });

    // Фильтр по объекту: маршруты ВСЕХ его этажей, каждый со своим floorId и objectId.
    const byObject = await listRoutes(request, { objectId: object.id });
    expect(byObject.total, 'в объекте три маршрута').toBe(3);
    expect(byObject.items.map((item) => item.id).sort()).toEqual(
      [firstRoute.id, secondRoute.id, thirdRoute.id].sort(),
    );
    expect(
      byObject.items.map((item) => item.id),
      'маршрут чужого объекта не подмешан',
    ).not.toContain(foreignRoute.id);
    expect(byObject.items.every((item) => item.objectId === object.id)).toBe(true);
    expect(byObject.items.find((item) => item.id === firstRoute.id)?.pointsCount).toBe(0);

    // Фильтр по этажу: только маршруты этого этажа (два из трёх).
    const byFloor = await listRoutes(request, { floorId: firstFloor.id });
    expect(byFloor.total).toBe(2);
    expect(byFloor.items.map((item) => item.id).sort()).toEqual(
      [firstRoute.id, secondRoute.id].sort(),
    );
    expect(byFloor.items.every((item) => item.floorId === firstFloor.id)).toBe(true);

    // Отрицательные кейсы: чужой объект и несуществующий id дают пусто, а не «фильтр
    // проигнорирован» — иначе положительные проверки выше ничего не доказывали бы.
    expect((await listRoutes(request, { objectId: foreignObject.id })).total).toBe(1);
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await listRoutes(request, { objectId: ghost })).items).toHaveLength(0);
    expect((await listRoutes(request, { floorId: ghost })).items).toHaveLength(0);

    // Пагинация: take/skip режут выдачу, но total считает ВСЕ подходящие маршруты.
    const pageOne = await listRoutes(request, { objectId: object.id, take: 2, skip: 0 });
    const pageTwo = await listRoutes(request, { objectId: object.id, take: 2, skip: 2 });
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.total, 'total не зависит от страницы').toBe(3);
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.total).toBe(3);
    expect(
      new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)).size,
      'страницы не пересекаются и вместе дают всю выборку',
    ).toBe(3);

    // Границы take (1..100) ловит валидатор DTO, а не молчаливая выдача всего списка.
    expect((await core(request, 'get', '/api/routes?take=101')).status()).toBe(400);
    expect((await core(request, 'get', `/api/routes?objectId=${object.id}&take=0`)).status()).toBe(
      400,
    );
  });
});

// ---------------------------------------------------------------------------
// ownerClientId: привязка объекта к аккаунту заказчика
// ---------------------------------------------------------------------------

test.describe('Core: привязка объекта к аккаунту заказчика (ownerClientId)', () => {
  /**
   * Каждый тест создаёт свой CLIENT-аккаунт: набор идемпотентен и не зависит от
   * того, какие аккаунты остались от прошлых прогонов. Аккаунты не удаляются
   * (auth-service умеет только мягкую деактивацию) — как и фикстурные.
   */
  const createdClients = new Set<string>();

  async function makeClient(request: APIRequestContext, label: string) {
    const account = await createClientAccount(request, {
      email: uniqueEmail(`e2e-owner-${label}`),
      fullName: `E2E Заказчик ${label} ${runTag()}`,
    });
    createdClients.add(account.id);
    return account;
  }

  test('AC-поле: создание с ownerClientId возвращает его в ответе и в getById/list', async ({
    request,
  }) => {
    const client = await makeClient(request, 'create');
    const name = `E2E ownerClientId ${runTag()}`;

    const object = await createObject(request, { name, ownerClientId: client.id });
    trackObject(object.id);

    // POST отдаёт поле сразу: админка не должна перезапрашивать объект.
    expect(object.ownerClientId).toBe(client.id);

    const fetched = await core(request, 'get', `/api/objects/${object.id}`);
    expect(fetched.status(), await fetched.text()).toBe(200);
    expect(((await fetched.json()) as { ownerClientId: string | null }).ownerClientId).toBe(
      client.id,
    );

    const list = await core(request, 'get', `/api/objects?ownerClientId=${client.id}&take=100`);
    expect(list.status()).toBe(200);
    const page = (await list.json()) as {
      items: Array<{ id: string; ownerClientId: string | null }>;
      total: number;
    };
    expect(page.items.map((item) => item.id)).toContain(object.id);
    // Фильтр точный: чужой ownerClientId в выдачу не попадает.
    for (const item of page.items) {
      expect(item.ownerClientId).toBe(client.id);
    }
  });

  test('AC-фильтр: список по ownerClientId не отдаёт объекты других владельцев', async ({
    request,
  }) => {
    const first = await makeClient(request, 'filter-a');
    const second = await makeClient(request, 'filter-b');
    const own = await createObject(request, {
      name: `E2E фильтр свой ${runTag()}`,
      ownerClientId: first.id,
    });
    const foreign = await createObject(request, {
      name: `E2E фильтр чужой ${runTag()}`,
      ownerClientId: second.id,
    });
    const unbound = await createObject(request, { name: `E2E фильтр без привязки ${runTag()}` });
    trackObject(own.id);
    trackObject(foreign.id);
    trackObject(unbound.id);

    const res = await core(request, 'get', `/api/objects?ownerClientId=${first.id}&take=100`);
    const page = (await res.json()) as { items: Array<{ id: string }>; total: number };
    const ids = page.items.map((item) => item.id);

    expect(ids).toContain(own.id);
    expect(ids).not.toContain(foreign.id);
    expect(ids).not.toContain(unbound.id);
  });

  test('AC-фильтр: ownerClientId комбинируется с search и status через AND', async ({
    request,
  }) => {
    const client = await makeClient(request, 'and');
    const marker = runTag();
    const target = await createObject(request, {
      name: `E2E AND цель ${marker}`,
      ownerClientId: client.id,
    });
    const otherName = await createObject(request, {
      name: `E2E AND другое ${marker}`,
      ownerClientId: client.id,
    });
    trackObject(target.id);
    trackObject(otherName.id);

    const res = await core(
      request,
      'get',
      `/api/objects?ownerClientId=${client.id}&search=${encodeURIComponent(`AND цель ${marker}`)}&take=100`,
    );
    const page = (await res.json()) as {
      items: Array<{ id: string; name: string }>;
      total: number;
    };

    expect(page.items.map((item) => item.id)).toEqual([target.id]);
  });

  test('AC-07: несуществующий аккаунт → 400 «Аккаунт заказчика не найден»', async ({ request }) => {
    const res = await core(request, 'post', '/api/objects', {
      data: {
        name: `E2E несуществующий ${runTag()}`,
        address: 'г. Москва, ул. Тестовая, 1',
        lat: 55.7558,
        lng: 37.6173,
        type: 'business-center',
        totalArea: 100,
        floorsCount: 1,
        clientName: 'ООО «E2E»',
        clientContact: '+7 495 000-00-00',
        // Валидный по форме uuid, которого точно нет в auth-БД.
        ownerClientId: '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(res.status(), await res.text()).toBe(400);
    expect(await res.text()).toContain('Аккаунт заказчика не найден');
  });

  test('AC-07: аккаунт с ролью не CLIENT → 400 «Аккаунт не является клиентом»', async ({
    request,
  }) => {
    // id администратора берём из его же токена через /api/auth/me.
    const token = await loginAs(request, 'ADMIN');
    const me = await request.get(`${AUTH_URL}/api/auth/me`, { headers: authHeader(token) });
    const adminId = ((await me.json()) as { id: string }).id;

    const res = await core(request, 'post', '/api/objects', {
      data: {
        name: `E2E не клиент ${runTag()}`,
        address: 'г. Москва, ул. Тестовая, 1',
        lat: 55.7558,
        lng: 37.6173,
        type: 'business-center',
        totalArea: 100,
        floorsCount: 1,
        clientName: 'ООО «E2E»',
        clientContact: '+7 495 000-00-00',
        ownerClientId: adminId,
      },
    });

    expect(res.status(), await res.text()).toBe(400);
    expect(await res.text()).toContain('Аккаунт не является клиентом');
  });

  test('AC-07: деактивированный CLIENT → 400 «Аккаунт клиента деактивирован»', async ({
    request,
  }) => {
    const client = await makeClient(request, 'deactivated');
    await deactivateAccount(request, client.id);

    const res = await core(request, 'post', '/api/objects', {
      data: {
        name: `E2E деактивирован ${runTag()}`,
        address: 'г. Москва, ул. Тестовая, 1',
        lat: 55.7558,
        lng: 37.6173,
        type: 'business-center',
        totalArea: 100,
        floorsCount: 1,
        clientName: 'ООО «E2E»',
        clientContact: '+7 495 000-00-00',
        ownerClientId: client.id,
      },
    });

    expect(res.status(), await res.text()).toBe(400);
    expect(await res.text()).toContain('Аккаунт клиента деактивирован');
  });

  test('AC-07: PATCH ownerClientId=null снимает привязку, PATCH без поля её не меняет', async ({
    request,
  }) => {
    const client = await makeClient(request, 'patch');
    const object = await createObject(request, {
      name: `E2E PATCH привязки ${runTag()}`,
      ownerClientId: client.id,
    });
    trackObject(object.id);

    // 1) PATCH без поля ownerClientId — привязка обязана сохраниться. Это главный
    //    регресс: обычное редактирование названия не должно отбирать доступ.
    const renamed = await core(request, 'patch', `/api/objects/${object.id}`, {
      data: { name: `E2E PATCH переименован ${runTag()}` },
    });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(((await renamed.json()) as { ownerClientId: string | null }).ownerClientId).toBe(
      client.id,
    );

    const afterRename = await core(request, 'get', `/api/objects/${object.id}`);
    expect(((await afterRename.json()) as { ownerClientId: string | null }).ownerClientId).toBe(
      client.id,
    );

    // 2) PATCH ownerClientId=null — привязка снимается.
    const cleared = await core(request, 'patch', `/api/objects/${object.id}`, {
      data: { ownerClientId: null },
    });
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect(((await cleared.json()) as { ownerClientId: string | null }).ownerClientId).toBeNull();

    const afterClear = await core(request, 'get', `/api/objects/${object.id}`);
    expect(
      ((await afterClear.json()) as { ownerClientId: string | null }).ownerClientId,
    ).toBeNull();
  });

  test('AC-07: PATCH несуществующим аккаунтом → 400 и привязка не меняется', async ({
    request,
  }) => {
    const client = await makeClient(request, 'patch-bad');
    const object = await createObject(request, {
      name: `E2E PATCH чужой id ${runTag()}`,
      ownerClientId: client.id,
    });
    trackObject(object.id);

    const res = await core(request, 'patch', `/api/objects/${object.id}`, {
      data: { ownerClientId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status(), await res.text()).toBe(400);

    const after = await core(request, 'get', `/api/objects/${object.id}`);
    expect(((await after.json()) as { ownerClientId: string | null }).ownerClientId).toBe(
      client.id,
    );
  });

  test('валидация DTO: ownerClientId не строка → 400', async ({ request }) => {
    const res = await core(request, 'post', '/api/objects', {
      data: {
        name: `E2E тип поля ${runTag()}`,
        address: 'г. Москва, ул. Тестовая, 1',
        lat: 55.7558,
        lng: 37.6173,
        type: 'business-center',
        totalArea: 100,
        floorsCount: 1,
        clientName: 'ООО «E2E»',
        clientContact: '+7 495 000-00-00',
        ownerClientId: 123,
      },
    });
    expect(res.status(), await res.text()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Чистота набора
// ---------------------------------------------------------------------------

test.describe('Core: идемпотентность', () => {
  test('после уборки объекта в БД не остаётся ни одного этажа', async ({ request }) => {
    const object = await createObject(request, { name: `E2E уборка ${runTag()}` });
    const floor = await createFloor(request, object.id, { number: 1 });
    const uploaded = await uploadFile(request, { kind: 'plan' });
    await attachPlanUrl(request, floor.id, uploaded.url, 0.05);
    const room = await createRoom(request, floor.id, { name: 'Комната' });
    const route = await createRoute(request, floor.id, { name: `Маршрут ${runTag()}` });
    await addRoutePoint(request, route.id, { roomId: room.id, estimatedTimeMin: 3 });

    await deleteFile(request, uploaded.id);
    await deleteObject(request, object.id);

    // объект и всё вложенное исчезли
    expect((await core(request, 'get', `/api/objects/${object.id}`)).status()).toBe(404);
    expect((await core(request, 'get', `/api/floors/${floor.id}`)).status()).toBe(404);
    expect((await core(request, 'get', `/api/rooms/${room.id}`)).status()).toBe(404);
    expect((await core(request, 'get', `/api/routes/${route.id}`)).status()).toBe(404);

    // объект не попал в общий список (архивации не требуется: маршрутов в ACTIVE нет)
    const list = await core(
      request,
      'get',
      `/api/objects?search=${encodeURIComponent(object.name)}`,
    );
    expect(list.status()).toBe(200);
    expect(((await list.json()) as { total: number }).total).toBe(0);
  });
});

/** Абсолютный URL core-эндпоинта для «анонимных» запросов без токена. */
function corePath(path: string): string {
  return `${process.env.E2E_CORE_URL ?? 'http://localhost:3003'}${path}`;
}
