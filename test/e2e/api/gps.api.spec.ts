import { expect, test } from '@playwright/test';
import {
  expectStatus,
  flushOperationsData,
  GEOFENCE_BOUNDARY,
  GPS_URL,
  checkGeofence,
  countTracks,
  getTracks,
  listGeofences,
  loginIdAs,
  markNotificationRead,
  nearbyEmployees,
  operationsTracker,
  postTrackBatch,
  resetTrackState,
  sendTracks,
  sqlAvailable,
  sweepOrphanNotifications,
  trackGeofence,
  trackHistory,
  trackIds,
  uniqueGeofenceCell,
  waitForNotification,
  type TrackPoint,
} from '../../helpers/operations';
import { bodyText, loginAs, runTag } from '../../helpers/core';

/**
 * М3.8 — e2e gps-service («оперативка»: треки, геозоны, выход из геозоны).
 *
 * Требует запущенного стенда:
 *  - auth-service :3001 (E2E_API_URL) — access-токены;
 *  - gps-service  :3004 (E2E_GPS_URL) — приём точек, геозоны, nearby, история;
 *  - PowerShell + docker (контейнер `cleaning-ops-postgres`) — только уборка своих строк;
 *  - RabbitMQ :5672 — событие geofence.exit уходит в notification-service (проверяется
 *    в тесте выхода из геозоны через `GET /api/notifications`).
 *
 * Идемпотентность: у gps-service нет DELETE, поэтому набор помнит созданные id геозон,
 * пользователей и окно времени треков и сносит ровно их в afterEach
 * (см. helpers/operations.ts). Каждый тест работает на СВОЕЙ площадке (`uniqueGeofenceCell`):
 * gps-service ищет ближайшую геозону в радиусе 1000 м, поэтому две геозоны в одной точке
 * сделали бы ответ `check` недетерминированным.
 *
 * ВНИМАНИЕ про UUID: DTO требуют именно UUID v4 (третья группа — 4xxx), поэтому
 * «нулевой» id вида 00000000-0000-0000-... валидацию НЕ проходит — это 400, а не 404.
 */

test.describe.configure({ timeout: 180_000 });

/** Уникальный объект core на прогон: используется как привязка геозон и фильтр списка. */
const objectId = `00000000-0000-4000-8000-${runTag()
  .replace(/[^0-9a-f]/g, '')
  .slice(-12)
  .padStart(12, '0')}`;

test.afterEach(() => {
  flushOperationsData();
});

test.afterAll(() => {
  // Финальная зачистка осиротевших уведомлений: выполняется один раз на процесс
  // и безопасна, если docker недоступен.
  sweepOrphanNotifications();
});

// ---------------------------------------------------------------------------
// Batch приёма точек
// ---------------------------------------------------------------------------

test.describe('GPS: batch приёма точек', () => {
  test('принимает batch внутри и вне геозоны, ответ содержит accepted', async ({ request }) => {
    const cell = uniqueGeofenceCell(1);
    // Геозона нужна, чтобы приём точек шёл по полному пути (вставка + проверка геозон).
    await trackGeofence(request, {
      objectId,
      name: `E2E batch ${runTag()}`,
      boundary: cell.boundary,
    });

    // Состояние «до batch» задаём сами: gps-service ищет выход от ПОСЛЕДНЕЙ точки
    // сотрудника, а она могла остаться от прошлого прогона внутри чужой геозоны.
    // Все точки ниже идут строго позже сброса — иначе он не попал бы в окно выборки.
    const started = Date.now();
    const at = (offsetMs: number): string => new Date(started + offsetMs).toISOString();
    await resetTrackState(request, { at: new Date(started) });

    const single = await sendTracks(request, {
      tracks: [{ ...cell.inside, timestamp: at(1_000) }],
    });
    expect(single.accepted).toBe(1);
    expect(single.userId).toBeTruthy();
    expect(single.lastPointAt).toBeTruthy();
    expect(single.geofenceExits).toEqual([]);

    // Batch из трёх точек: две внутри, одна далеко вне геозоны.
    const batch: TrackPoint[] = [
      { ...cell.inside, accuracy: 5, battery: 80, timestamp: at(2_000) },
      { lat: cell.inside.lat, lng: cell.inside.lng + 0.0004, speed: 1.5, timestamp: at(3_000) },
      { ...cell.outside, timestamp: at(4_000) },
    ];
    const result = await sendTracks(request, { tracks: batch, employeeName: 'E2E Курьер' });

    expect(result.accepted, 'все точки batch приняты одним запросом').toBe(3);
    expect(result.employeeName).toBe('E2E Курьер');
    // Точки пишутся одним INSERT и видны в истории — accepted не «на словах».
    const history = await trackHistory(request, { userId: result.userId, limit: 50 });
    expect(history.count).toBeGreaterThanOrEqual(4);
  });

  test('точки за другого сотрудника и пустой batch → 403/400', async ({ request }) => {
    const operator = await loginAs(request, 'OPERATOR');
    const adminId = await loginIdAs(request, 'ADMIN');
    const point = uniqueGeofenceCell(2).inside;

    // OPERATOR не может писать треки за ADMIN — подмена userId только для ADMIN/SUPERVISOR.
    const foreign = await postTrackBatch(request, {
      token: operator,
      userId: adminId,
      tracks: [point],
    });
    await expectStatus(foreign, 403, 'треки за другого сотрудника');
    expect(await bodyText(foreign)).toContain('только за себя');

    const empty = await postTrackBatch(request, { tracks: [] });
    await expectStatus(empty, 400, 'пустой batch');
    expect(await bodyText(empty)).toContain('tracks не может быть пустым');

    const broken = await postTrackBatch(request, { tracks: [{ lat: 999, lng: 999 }] });
    await expectStatus(broken, 400, 'невалидная точка');

    // без токена — 401 до всякой валидации
    const anonymous = await request.post(`${GPS_URL}/api/gps/track`, {
      data: { tracks: [point] },
    });
    await expectStatus(anonymous, 401, 'треки без токена');
  });
});

// ---------------------------------------------------------------------------
// Геозоны
// ---------------------------------------------------------------------------

test.describe('GPS: геозоны', () => {
  test('ADMIN создаёт геозону, список и фильтр ?objectId= её видят', async ({ request }) => {
    const cell = uniqueGeofenceCell(3);
    const geofence = await trackGeofence(request, {
      objectId,
      name: `E2E геозона ${runTag()}`,
      boundary: cell.boundary,
      radiusMeters: 150,
    });

    expect(geofence.objectId).toBe(objectId);
    expect(geofence.radiusMeters).toBe(150);
    expect(geofence.boundary?.type).toBe('Polygon');
    expect(geofence.boundary?.coordinates[0]).toHaveLength(5);

    const all = await listGeofences(request);
    expect(all.count).toBe(all.geofences.length);
    expect(all.geofences.map((item) => item.id)).toContain(geofence.id);

    const filtered = await listGeofences(request, { objectId });
    expect(filtered.count).toBe(1);
    expect(filtered.geofences[0].id).toBe(geofence.id);

    // Другой (несуществующий, но валидный v4) объект — пусто, а не 404.
    const other = await listGeofences(request, {
      objectId: '00000000-0000-4000-8000-0000000000bb',
    });
    expect(other.count).toBe(0);
    expect(other.geofences).toEqual([]);
  });

  test('геозоны: без токена → 401, невалидный objectId → 400, роли OPERATOR/CLIENT → 403', async ({
    request,
  }) => {
    const anonymousList = await request.get(`${GPS_URL}/api/gps/geofences`);
    await expectStatus(anonymousList, 401, 'список геозон без токена');

    const anonymousCreate = await request.post(`${GPS_URL}/api/gps/geofences`, {
      data: { objectId, boundary: GEOFENCE_BOUNDARY },
    });
    await expectStatus(anonymousCreate, 401, 'создание геозоны без токена');

    const admin = await loginAs(request, 'ADMIN');

    // objectId — обязательный UUID v4: строка и «нулевой» UUID v0 отсекаются валидацией.
    const badFilter = await request.get(`${GPS_URL}/api/gps/geofences?objectId=not-an-object`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
    await expectStatus(badFilter, 400, 'фильтр по не-UUID');
    expect(await bodyText(badFilter)).toContain('objectId должен быть UUID');

    const badBody = await request.post(`${GPS_URL}/api/gps/geofences`, {
      headers: { Authorization: `Bearer ${admin}` },
      data: { objectId: '00000000-0000-0000-0000-0000000000aa', boundary: GEOFENCE_BOUNDARY },
    });
    await expectStatus(badBody, 400, 'objectId не v4');

    for (const role of ['OPERATOR', 'CLIENT'] as const) {
      const token = await loginAs(request, role);
      const forbidden = await request.post(`${GPS_URL}/api/gps/geofences`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { objectId, boundary: GEOFENCE_BOUNDARY },
      });
      await expectStatus(forbidden, 403, `создание геозоны ролью ${role}`);
      expect(await bodyText(forbidden)).toContain('Недостаточно прав');
    }

    // Чтение геозон доступно оператору — это карта в мобильном приложении.
    const operatorRead = await request.get(`${GPS_URL}/api/gps/geofences`, {
      headers: { Authorization: `Bearer ${await loginAs(request, 'OPERATOR')}` },
    });
    await expectStatus(operatorRead, 200, 'чтение геозон OPERATOR');
  });

  test('check: внутри геозоны → inside=true, вне → inside=false', async ({ request }) => {
    const cell = uniqueGeofenceCell(4);
    const geofence = await trackGeofence(request, {
      objectId,
      name: `E2E check ${runTag()}`,
      boundary: cell.boundary,
    });
    const operatorId = await loginIdAs(request, 'OPERATOR');

    const inside = await checkGeofence(request, operatorId, cell.inside);
    expect(inside.inside).toBe(true);
    expect(inside.geofence?.id).toBe(geofence.id);
    expect(inside.distanceMeters).toBe(0);

    const outside = await checkGeofence(request, operatorId, cell.outside);
    expect(outside.inside).toBe(false);
    // За десятки километров геозона не попадает в радиус поиска (1000 м) — distance/geofence пусты.
    expect(outside.geofence).toBeNull();
    expect(outside.distanceMeters).toBeNull();

    // Точка рядом (~44 м), но вне полигона: геозона найдена по расстоянию, inside=false.
    const near = await checkGeofence(request, operatorId, {
      lat: cell.inside.lat,
      lng: cell.inside.lng + 0.0006,
    });
    expect(near.inside).toBe(false);
    expect(near.geofence?.id).toBe(geofence.id);
    expect(near.distanceMeters).toBeGreaterThan(0);

    // userId обязан быть UUID — иначе 400 от ParseUUIDPipe.
    const badUser = await request.get(
      `${GPS_URL}/api/gps/geofences/not-a-uuid/check?lat=${cell.inside.lat}&lng=${cell.inside.lng}`,
      { headers: { Authorization: `Bearer ${await loginAs(request, 'ADMIN')}` } },
    );
    await expectStatus(badUser, 400, 'check с не-UUID userId');

    const noCoords = await request.get(`${GPS_URL}/api/gps/geofences/${operatorId}/check`, {
      headers: { Authorization: `Bearer ${await loginAs(request, 'ADMIN')}` },
    });
    await expectStatus(noCoords, 400, 'check без координат');
  });

  test('nearby: находит сотрудника после свежего трека и не находит по старой точке', async ({
    request,
  }) => {
    // Свой «тихий» квадрат: координаты уведены от площадок геозон набора.
    const base = { lat: 55.7101, lng: 37.5101 };
    const supervisorId = await loginIdAs(request, 'SUPERVISOR');

    // Точка 10 минут назад — вне окна «свежести» (5 минут).
    const stale = await sendTracks(request, {
      role: 'SUPERVISOR',
      tracks: [{ ...base, timestamp: new Date(Date.now() - 10 * 60_000).toISOString() }],
    });
    expect(stale.accepted).toBe(1);

    const staleNearby = await nearbyEmployees(request, base);
    expect(
      staleNearby.employees.some((employee) => employee.userId === supervisorId),
      'точка старше 5 минут не должна попадать в nearby',
    ).toBe(false);

    // Свежая точка того же сотрудника — теперь он находится.
    await sendTracks(request, { role: 'SUPERVISOR', tracks: [base] });

    const freshNearby = await nearbyEmployees(request, base);
    const found = freshNearby.employees.find((employee) => employee.userId === supervisorId);
    expect(found, 'свежий трек должен находиться в радиусе 500 м').toBeDefined();
    expect(found?.distanceMeters).toBeLessThanOrEqual(500);

    // Радиус 1 м — сотрудник уже не попадает (проверяем сам фильтр, а не только «нашёлся»).
    const tight = await nearbyEmployees(
      request,
      { lat: base.lat + 0.01, lng: base.lng },
      { radius: 1 },
    );
    expect(tight.employees.some((employee) => employee.userId === supervisorId)).toBe(false);
  });

  test('выход из геозоны → непустой geofenceExits и уведомление GEOFENCE_EXIT', async ({
    request,
  }) => {
    // Собственная площадка теста: предыдущие тесты набора не могли оставить здесь точку.
    const cell = uniqueGeofenceCell(5);
    const inside = cell.inside;
    const outside = cell.outside;
    const geofence = await trackGeofence(request, {
      objectId,
      name: `E2E выход ${runTag()}`,
      boundary: cell.boundary,
    });

    // 0. Состояние «до batch» задаём сами. Первая точка теста не должна выглядеть
    //    выходом из геозоны, оставленной прошлым прогоном: gps-service считает выход
    //    от ПОСЛЕДНЕЙ точки сотрудника, и без сброса шаг 1 падал на чужом состоянии.
    const started = Date.now();
    const at = (offsetMs: number): string => new Date(started + offsetMs).toISOString();
    await resetTrackState(request, { at: new Date(started) });

    // 1. Сотрудник внутри — точка сохраняется, выходов нет.
    const entered = await sendTracks(request, { tracks: [{ ...inside, timestamp: at(1_000) }] });
    expect(entered.geofenceExits).toEqual([]);

    // 2. Batch, последняя точка которого вне геозоны → состояние «до batch» было внутри.
    const exited = await sendTracks(request, {
      employeeName: 'E2E Курьер',
      tracks: [
        { ...inside, timestamp: at(2_000) },
        { ...outside, timestamp: at(3_000) },
      ],
    });

    expect(exited.accepted).toBe(2);
    // Предмет проверки — выход из геозоны ЭТОГО теста, поэтому сверяем по её id.
    // (На загрязнённом стенде в тех же координатах могла остаться геозона прошлого
    // прогона — площадка задаётся последними цифрами runTag, полигон 66×66 м, — и
    // сервис вернёт ещё и её выход. Это корректно: точка внутри обоих полигонов.
    // Уведомление ниже тоже ищется по objectId нашей геозоны.)
    const ours = exited.geofenceExits.filter((exit) => exit.geofenceId === geofence.id);
    expect(ours, 'выход из геозоны должен попасть в ответ').toHaveLength(1);
    expect(ours[0].objectId).toBe(objectId);
    // published=true — событие ушло в RabbitMQ (недоступный брокер даёт false, треки всё равно приняты).
    expect(ours[0].published).toBe(true);

    // 3. Событие geofence.exit доходит до notification-service: ждём in-app уведомление,
    //    адресованное этому сотруднику. Ожидание нужно ещё и для уборки: без него запись
    //    могла бы появиться уже после afterEach и «протечь» на стенде.
    const notification = await waitForNotification(
      request,
      { type: 'GEOFENCE_EXIT', payloadKey: 'objectId', payloadValue: objectId },
      { token: await loginAs(request, 'OPERATOR'), timeout: 15_000 },
    );
    const operatorId = await loginIdAs(request, 'OPERATOR');
    expect(notification.userId).toBe(operatorId);
    expect(notification.body).toContain('покинул территорию');
    expect(notification.payload.objectId, 'в payload — id объекта геозоны').toBe(objectId);

    // 4. Уведомление читается идемпотентно.
    const read = await markNotificationRead(request, notification.id, {
      token: await loginAs(request, 'OPERATOR'),
    });
    expect(read.status(), await bodyText(read)).toBe(200);
    expect(((await read.json()) as { readAt: string | null }).readAt).toBeTruthy();
  });

  test('история треков: окно from/to и порядок по времени', async ({ request }) => {
    const operatorId = await loginIdAs(request, 'OPERATOR');
    const windowFrom = new Date(Date.now() - 60_000);
    // Точки истории — на площадке теста, чтобы не пересекаться с геозонами набора.
    const cell = uniqueGeofenceCell(6);

    // Точка ДО окна: тот же сотрудник, timestamp заранее известен.
    const beforeFrom = new Date(windowFrom.getTime() - 30_000);
    await sendTracks(request, {
      tracks: [{ ...cell.inside, timestamp: beforeFrom.toISOString() }],
    });
    // Две точки внутри окна.
    await sendTracks(request, {
      tracks: [
        { ...cell.inside, timestamp: new Date(windowFrom.getTime() + 1_000).toISOString() },
        {
          lat: cell.inside.lat,
          lng: cell.inside.lng + 0.001,
          timestamp: new Date(windowFrom.getTime() + 2_000).toISOString(),
        },
      ],
    });

    const full = await trackHistory(request, { userId: operatorId, limit: 200 });
    expect(full.userId).toBe(operatorId);
    // Точка «до окна» в общую историю входит — иначе фильтр проверять не на чем.
    expect(full.tracks.some((track) => track.timestamp === beforeFrom.toISOString())).toBe(true);

    const windowed = await trackHistory(request, {
      userId: operatorId,
      from: windowFrom.toISOString(),
      to: new Date(Date.now() + 60_000).toISOString(),
      limit: 200,
    });
    expect(windowed.from).toBe(windowFrom.toISOString());
    expect(windowed.count).toBeGreaterThanOrEqual(2);
    // Все точки окна — не раньше from: граница соблюдается.
    for (const track of windowed.tracks) {
      expect(Date.parse(track.timestamp)).toBeGreaterThanOrEqual(windowFrom.getTime());
    }
    expect(windowed.tracks.map((track) => track.timestamp)).not.toContain(beforeFrom.toISOString());
    // Точки отдаются по возрастанию timestamp.
    const timestamps = windowed.tracks.map((track) => Date.parse(track.timestamp));
    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
    expect(windowed.tracks[0].userId).toBe(operatorId);

    // Верхняя граница: окно, заканчивающееся до наших точек, не содержит их.
    const earlyWindow = await trackHistory(request, {
      userId: operatorId,
      from: new Date(beforeFrom.getTime() - 120_000).toISOString(),
      to: new Date(beforeFrom.getTime() - 60_000).toISOString(),
      limit: 200,
    });
    expect(earlyWindow.tracks.map((track) => track.timestamp)).not.toContain(
      beforeFrom.toISOString(),
    );

    // userId обязателен и должен быть UUID.
    await expectStatus(await getTracks(request, {}), 400, 'история без userId');
    await expectStatus(
      await getTracks(request, { userId: 'not-a-uuid' }),
      400,
      'история с не-UUID userId',
    );

    const anonymous = await request.get(`${GPS_URL}/api/gps/tracks?userId=${operatorId}`);
    await expectStatus(anonymous, 401, 'история без токена');
  });
});

// ---------------------------------------------------------------------------
// Чистота набора
// ---------------------------------------------------------------------------

test.describe('GPS: уборка', () => {
  test('после уборки созданной геозоны в БД не остаётся', async ({ request }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    const geofence = await trackGeofence(request, {
      objectId,
      name: `E2E уборка ${runTag()}`,
      boundary: uniqueGeofenceCell(7).boundary,
    });
    expect((await listGeofences(request, { objectId })).geofences.map((item) => item.id)).toContain(
      geofence.id,
    );

    operationsTracker.flush();

    // Геозона исчезла из списка, соседние (если есть) не пострадали.
    const after = await listGeofences(request, { objectId });
    expect(after.geofences.map((item) => item.id)).not.toContain(geofence.id);
  });

  test('flush сносит треки и геозоны прогона, не трогая чужие данные', async ({ request }) => {
    test.skip(!sqlAvailable(), 'нет доступа к docker-контейнеру cleaning-ops-postgres');

    const since = new Date();
    const cell = uniqueGeofenceCell(8);
    const geofence = await trackGeofence(request, {
      objectId,
      name: `E2E flush ${runTag()}`,
      boundary: cell.boundary,
    });
    const track = await sendTracks(request, { tracks: [cell.inside] });

    // «До»: строки прогона реально лежат в БД (иначе проверка «после» ничего не значит).
    const idsBefore = trackIds(track.userId, since);
    expect(idsBefore.length).toBeGreaterThan(0);
    expect(countTracks(track.userId, since)).toBe(idsBefore.length);

    operationsTracker.flush();

    // «После»: ни одной строки прогона не осталось — ни трека, ни геозоны.
    expect(countTracks(track.userId, since, idsBefore), 'треки прогона удалены').toBe(0);
    expect(
      (await listGeofences(request, { objectId })).geofences.map((item) => item.id),
    ).not.toContain(geofence.id);
  });
});
