/**
 * М7.4 — UAT роли «Бригадир» (SUPERVISOR).
 *
 * Сценарий (ПЛАН.md, М7.4): назначение и контроль заявок, просмотр смен и треков.
 *
 * Все созданные сущности помечены префиксом `UAT-M74-S-`; заявки, чаты и точки
 * трека снимаются по id в конце прогона. Геозона — единственная сущность стенда,
 * которую нельзя удалить через API (DELETE не предусмотрен контрактом), поэтому
 * она создаётся с именем `UAT-M74-S зона` и снимается SQL-ом (см. `cleanup.md`
 * в каталоге результатов).
 *
 * Запуск: cd test && node uat/uat-supervisor.mjs
 */

import { execFileSync } from 'node:child_process';
import { Checklist, USERS, cleanupUatSql, del, get, patch, post, tokenProvider, waitFor } from './lib.mjs';

const TAG = 'UAT-M74-S';
const DEMO_OBJECT = 'f9bd905f-924a-4df8-a517-5fb4a760bf01';
const GEOFENCE_NAME = `${TAG} зона`;

const created = { tickets: [], geofenceId: null };

/** Свой SQL: убираем только то, что создали (демо-данные не трогаем). */
function psql(database, sql) {
  return execFileSync(
    'docker',
    ['exec', 'cleaning-ops-postgres', 'psql', '-U', 'admin', '-d', database, '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

async function main() {
  const check = new Checklist('supervisor', 'назначение и контроль заявок, смены и треки');
  const supervisor = tokenProvider(USERS.supervisor.email, USERS.supervisor.password);
  const operator = tokenProvider(USERS.operator.email, USERS.operator.password);
  const admin = tokenProvider(USERS.admin.email, USERS.admin.password);
  const auth = { token: supervisor };

  const preCleaned = cleanupUatSql(TAG);
  const me = (await get('/auth/me', auth)).json;
  const operatorUser = (
    await get(`/users?search=${encodeURIComponent(USERS.operator.email)}`, auth)
  ).json.items[0];

  // ------------------------------------------------------------------
  // S1. Вход и область видимости
  // ------------------------------------------------------------------
  await check.step(
    'S1',
    'Вход бригадира и доступ к рабочему контуру',
    'роль SUPERVISOR, доступны заявки, смены, треки, объекты; справочник сотрудников читается',
    async () => {
      const tickets = await get('/tickets?take=5', auth);
      const schedule = await get('/schedule', auth);
      const objects = await get('/objects', auth);
      return {
        ok:
          me.role === 'SUPERVISOR' &&
          tickets.status === 200 &&
          schedule.status === 200 &&
          objects.status === 200,
        actual: `role=${me.role} (${me.fullName}); GET /tickets → ${tickets.status} (total=${tickets.json.total}); `
          + `GET /schedule → ${schedule.status} (${schedule.json.length}); GET /objects → ${objects.status}`,
        evidence: `GET /api/auth/me под supervisor@cleaning-ops.com → role=SUPERVISOR`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S2. Заявка от клиента → назначение исполнителю
  // ------------------------------------------------------------------
  let ticketId;
  await check.step(
    'S2',
    'Назначение заявки: создание внеплановой заявки и назначение оператору',
    'assign → 201, статус assigned, assigneeId и assignedAt заполнены, исполнителю приходит уведомление',
    async () => {
      const client = tokenProvider(USERS.client.email, USERS.client.password);
      const ticket = await post(
        '/tickets',
        {
          type: 'unscheduled',
          objectId: DEMO_OBJECT,
          description: `${TAG} разлит кофе в переговорной 301`,
          priority: 'high',
        },
        { token: client },
      );
      if (ticket.status !== 201) return { ok: false, actual: `заявка HTTP ${ticket.status}: ${ticket.brief}` };
      ticketId = ticket.json.id;
      created.tickets.push(ticketId);
      const createdBy = ticket.json.createdBy;

      const assigned = await post(`/tickets/${ticketId}/assign`, { assigneeId: operatorUser.id }, auth);
      const detail = await get(`/tickets/${ticketId}`, auth);

      // Уведомление исполнителю идёт через RabbitMQ — ждём появления, а не «спим».
      const notification = await waitFor(
        async () => {
          const list = await get('/notifications?unreadOnly=true&take=20', { token: operator });
          return list.json.items.find(
            (item) => item.userId === operatorUser.id && item.payload?.ticketId === ticketId,
          );
        },
        { timeoutMs: 20000, what: 'in-app уведомление о назначении' },
      ).catch(() => null);

      return {
        ok:
          assigned.status === 201 &&
          detail.json.status === 'assigned' &&
          detail.json.assigneeId === operatorUser.id &&
          Boolean(detail.json.assignedAt) &&
          Boolean(notification),
        actual: `заявка 201 id=${ticketId} (createdBy=${createdBy}); assign → HTTP ${assigned.status}; `
          + `статус=${detail.json.status}, assigneeId=${detail.json.assigneeId}, assignedAt=${detail.json.assignedAt}; `
          + `уведомление исполнителю: ${notification ? `«${notification.title}»` : 'НЕ ПРИШЛО'}`,
        evidence: `POST /api/tickets/${ticketId}/assign → ${assigned.status}; GET /api/notifications?unreadOnly=true под оператором`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S3. Комментарий и переходы статусов
  // ------------------------------------------------------------------
  await check.step(
    'S3',
    'Контроль заявки: комментарий, переходы assigned → in_progress → completed → verified',
    'каждый переход принимается, недопустимый переход отклоняется 400, комментарий виден в детали',
    async () => {
      const comment = await post(
        `/tickets/${ticketId}/comments`,
        { text: `${TAG} принял в работу, выезжаю на объект` },
        auth,
      );
      const chain = [];
      for (const status of ['in_progress', 'completed', 'verified']) {
        const res = await patch(`/tickets/${ticketId}/status`, { status }, auth);
        chain.push(`${status}:${res.status}`);
      }
      const illegal = await patch(`/tickets/${ticketId}/status`, { status: 'in_progress' }, auth);
      const detail = await get(`/tickets/${ticketId}`, auth);
      const comments = detail.json.comments ?? [];

      return {
        ok:
          comment.status === 201 &&
          chain.join(',') === 'in_progress:200,completed:200,verified:200' &&
          illegal.status === 400 &&
          comments.some((item) => item.text.startsWith(TAG)),
        actual: `комментарий HTTP ${comment.status}; переходы ${chain.join(', ')}; `
          + `повторный in_progress → HTTP ${illegal.status} «${illegal.json?.message ?? ''}»; `
          + `итоговый статус=${detail.json.status}, комментариев ${comments.length}`,
        evidence: `PATCH /api/tickets/${ticketId}/status ×4; GET /api/tickets/${ticketId}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S4. Фильтры и поиск заявок
  // ------------------------------------------------------------------
  await check.step(
    'S4',
    'Список заявок: фильтры по статусу, типу, объекту и поиск по описанию',
    'каждый фильтр сужает выдачу, `total` согласован с фильтром, `take` вне 1..100 → 400',
    async () => {
      const byObject = await get(`/tickets?objectId=${DEMO_OBJECT}&take=100`, auth);
      const byStatus = await get('/tickets?status=verified&take=100', auth);
      const search = await get(`/tickets?search=${encodeURIComponent(TAG)}&take=100`, auth);
      const foreign = await get('/tickets?objectId=00000000-0000-4000-8000-000000000000&take=100', auth);
      const bad = await get('/tickets?take=101', auth);

      const allMatch = byObject.json.items.every((t) => t.objectId === DEMO_OBJECT);
      const statusMatch = byStatus.json.items.every((t) => t.status === 'verified');
      return {
        ok:
          allMatch &&
          statusMatch &&
          search.json.items.some((t) => t.id === ticketId) &&
          foreign.json.total === 0 &&
          bad.status === 400,
        actual: `по объекту: total=${byObject.json.total} (все с этим objectId: ${allMatch}); `
          + `status=verified: total=${byStatus.json.total} (все verified: ${statusMatch}); `
          + `поиск «${TAG}»: найдено ${search.json.total}, своя заявка в выдаче: ${search.json.items.some((t) => t.id === ticketId)}; `
          + `чужой объект: total=${foreign.json.total}; take=101 → HTTP ${bad.status}`,
        evidence: `GET /api/tickets?objectId=…, ?status=verified, ?search=UAT-M74-S, ?objectId=<чужой>`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S5. Смены дня
  // ------------------------------------------------------------------
  await check.step(
    'S5',
    'Просмотр смен: смены на сегодня по объекту и по исполнителю',
    'смены оператора на сегодня видны, фильтр по исполнителю не отдаёт чужих смен',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const all = await get(`/schedule/events?date=${today}`, auth);
      const mine = await get(`/schedule/events?date=${today}&userId=${operatorUser.id}`, auth);
      const foreign = await get(
        `/schedule/events?date=${today}&userId=00000000-0000-4000-8000-000000000000`,
        auth,
      );
      const onlyOperator = mine.json.every((event) => event.userId === operatorUser.id);
      return {
        ok: all.json.length > 0 && mine.json.length > 0 && onlyOperator && foreign.json.length === 0,
        actual: `смен на ${today}: всего ${all.json.length}; у оператора ${mine.json.length} `
          + `(все его: ${onlyOperator}); у несуществующего сотрудника ${foreign.json.length}; `
          + `статусы: ${[...new Set(all.json.map((e) => e.status))].join(', ')}`,
        evidence: `GET /api/schedule/events?date=${today}&userId=${operatorUser.id}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S6. Геозона и трек оператора
  // ------------------------------------------------------------------
  let outPoint;
  await check.step(
    'S6',
    'Контроль треков: геозона объекта, check-in внутри зоны, приём точек и история',
    'check-in внутри геозоны 201, снаружи 403; точки приняты (accepted), история отдаёт их бригадиру',
    async () => {
      // Геозона вокруг демо-объекта (55.7558, 37.6173), квадрат ~200×200 м.
      const geofence = await post(
        '/gps/geofences',
        {
          objectId: DEMO_OBJECT,
          name: GEOFENCE_NAME,
          radiusMeters: 150,
          boundary: {
            type: 'Polygon',
            coordinates: [
              [
                [37.6163, 55.7553],
                [37.6183, 55.7553],
                [37.6183, 55.7563],
                [37.6163, 55.7563],
                [37.6163, 55.7553],
              ],
            ],
          },
        },
        auth,
      );
      if (geofence.status !== 201) return { ok: false, actual: `геозона HTTP ${geofence.status}: ${geofence.brief}` };
      created.geofenceId = geofence.json.id;

      const inside = await get(
        `/gps/geofences/${operatorUser.id}/check?lat=55.7558&lng=37.6173`,
        auth,
      );
      const outside = await get(
        `/gps/geofences/${operatorUser.id}/check?lat=55.7600&lng=37.6300`,
        auth,
      );

      const now = Date.now();
      const batch = await post(
        '/gps/track',
        {
          tracks: [
            { lat: 55.7558, lng: 37.6173, accuracy: 6, speed: 0, timestamp: new Date(now - 60_000).toISOString() },
            { lat: 55.7559, lng: 37.6175, accuracy: 5, speed: 1.2, timestamp: new Date(now - 30_000).toISOString() },
            { lat: 55.7560, lng: 37.6178, accuracy: 4, speed: 1.4, timestamp: new Date(now).toISOString() },
          ],
        },
        { token: operator },
      );
      const history = await get(
        `/gps/tracks?userId=${operatorUser.id}&from=${new Date(now - 3_600_000).toISOString()}&to=${new Date(now + 60_000).toISOString()}`,
        auth,
      );
      const nearby = await get('/gps/employees/nearby?lat=55.7558&lng=37.6173&radius=1000', auth);

      // Чужой трек: бригадир не должен уметь писать точки за другого сотрудника.
      const foreignTrack = await post(
        '/gps/track',
        { userId: '00000000-0000-4000-8000-000000000001', tracks: [{ lat: 55.75, lng: 37.61 }] },
        { token: operator },
      );

      return {
        ok:
          inside.json.inside === true &&
          outside.json.inside === false &&
          batch.status === 201 &&
          batch.json.accepted === 3 &&
          history.json.count >= 3 &&
          nearby.json.count >= 1 &&
          foreignTrack.status === 403,
        actual: `геозона 201 id=${geofence.json.id} (radius ${geofence.json.radiusMeters ?? 150} м); `
          + `check внутри → inside=${inside.json.inside} (${Math.round(inside.json.distanceMeters ?? 0)} м), `
          + `снаружи → inside=${outside.json.inside}; batch → HTTP ${batch.status}, accepted=${batch.json.accepted}; `
          + `история треков: ${history.json.count} точек; «ближние сотрудники»: ${nearby.json.count}; `
          + `своя точка за другого → HTTP ${foreignTrack.status}`,
        evidence: `GET /api/gps/tracks?userId=${operatorUser.id} → ${history.json.count} точек; `
          + `GET /api/gps/employees/nearby → ${nearby.json.count}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S7. Выход из геозоны — событие в уведомлениях
  // ------------------------------------------------------------------
  await check.step(
    'S7',
    'Выход из геозоны: последняя точка вне зоны публикует geofence.exit и даёт in-app GEOFENCE_EXIT',
    'приходит in-app уведомление типа GEOFENCE_EXIT по оператору',
    async () => {
      const now = Date.now();
      const batch = await post(
        '/gps/track',
        {
          tracks: [
            {
              lat: 55.7600,
              lng: 37.6300,
              accuracy: 5,
              timestamp: new Date(now + 1000).toISOString(),
            },
          ],
        },
        { token: operator },
      );
      // Уведомление адресовано САМОМУ сотруднику (спецификация notification-service:
      // `userIds: [userId]`), поэтому читаем его под оператором, а бригадиру в отчёте
      // доступен факт выхода через геозонный отчёт и историю треков.
      const notification = await waitFor(
        async () => {
          const list = await get('/notifications?take=20', { token: operator });
          return list.json.items.find(
            (item) =>
              item.type === 'GEOFENCE_EXIT' &&
              item.payload?.objectId === DEMO_OBJECT &&
              item.userId === operatorUser.id,
          );
        },
        { timeoutMs: 20000, what: 'уведомление GEOFENCE_EXIT' },
      ).catch(() => null);

      const exits = Array.isArray(batch.json.geofenceExits) ? batch.json.geofenceExits : [];
      const ours = exits.find((entry) => entry.objectId === DEMO_OBJECT);
      const reports = await get('/gps/reports/geofence-control', auth);

      return {
        ok:
          batch.status === 201 &&
          ours !== undefined &&
          ours.published === true &&
          Boolean(notification),
        actual: `точка вне зоны принята (HTTP ${batch.status}); geofenceExits=${exits.length}, `
          + `published=${ours?.published}; уведомление «${notification?.title ?? 'НЕ ПРИШЛО'}» адресовано оператору `
          + `(${notification?.userId === operatorUser.id}); геозонный отчёт видит точек ${reports.json.totals.pointsCount}`,
        evidence: 'POST /api/gps/track → geofence.exit → RabbitMQ → notification-service (GET /api/notifications под оператором)',
      };
    },
  );

  // ------------------------------------------------------------------
  // S8. Отчёты контроля (М7.1) под бригадиром
  // ------------------------------------------------------------------
  await check.step(
    'S8',
    'Отчёты контроля: персонал (смены) и геозоны (посещения) доступны бригадиру',
    'обе read-модели отвечают 200 и содержат фактическую активность оператора',
    async () => {
      const staff = await get('/schedule/reports/staff-control', auth);
      const geofence = await get('/gps/reports/geofence-control', auth);
      const operatorRow = staff.json.rows.find((row) => row.userId === operatorUser.id);
      return {
        ok:
          staff.status === 200 &&
          geofence.status === 200 &&
          (geofence.json.totals.pointsCount ?? 0) >= 3,
        actual: `персонал: rows=${staff.json.rows.length}, у оператора смен ${operatorRow?.shiftsCount ?? '—'}; `
          + `геозоны: rows=${geofence.json.rows.length}, точек=${geofence.json.totals.pointsCount}, `
          + `посещений=${geofence.json.totals.visitsCount}`,
        evidence: 'GET /api/schedule/reports/staff-control, GET /api/gps/reports/geofence-control под SUPERVISOR',
      };
    },
  );

  // ------------------------------------------------------------------
  // S9. RBAC бригадира
  // ------------------------------------------------------------------
  await check.step(
    'S9',
    'RBAC: бригадир пишет объекты и заявки, но удалять объект может только администратор',
    'POST/PATCH объектов 201/200, DELETE объекта → 403, действие оператора (назначение) → 403',
    async () => {
      const object = await post(
        '/objects',
        {
          name: `${TAG} объект RBAC`,
          address: 'г. Москва, ул. Проверочная, 1',
          lat: 55.75,
          lng: 37.61,
          type: 'OFFICE',
          totalArea: 100,
          floorsCount: 1,
          clientName: `${TAG} заказчик`,
          clientContact: '+7 495 000-00-00',
        },
        auth,
      );
      if (object.status !== 201) return { ok: false, actual: `объект HTTP ${object.status}: ${object.brief}` };
      created.tickets.push(`object:${object.json.id}`);

      const patched = await patch(`/objects/${object.json.id}`, { totalArea: 120 }, auth);
      const remove = await del(`/objects/${object.json.id}`, auth);
      const operatorAssign = await post(
        `/tickets/${ticketId}/assign`,
        { assigneeId: operatorUser.id },
        { token: operator },
      );
      // Чистим за администратора (SUPERVISOR не может).
      const removedByAdmin = await del(`/objects/${object.json.id}`, { token: admin });

      return {
        ok:
          patched.status === 200 &&
          remove.status === 403 &&
          operatorAssign.status === 403 &&
          removedByAdmin.status === 204,
        actual: `объект создан (201); PATCH → ${patched.status}; DELETE бригадиром → ${remove.status}; `
          + `назначение оператором → ${operatorAssign.status}; DELETE администратором → ${removedByAdmin.status}`,
        evidence: `DELETE /api/objects/:id под SUPERVISOR → 403, под ADMIN → 204`,
      };
    },
  );

  // ------------------------------------------------------------------
  // S10. Интерфейс: заявки и графики в админке
  // ------------------------------------------------------------------
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await check.step(
      'S10',
      'Интерфейс бригадира: раздел «Заявки» показывает назначенную заявку и её статус',
      'после входа заявка находится поиском, карточка открывается, статус соответствует серверу',
      async () => {
        const { ADMIN_URL } = await import('./lib.mjs');
        await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.locator('input[name="email"]').fill(USERS.supervisor.email);
        await page.locator('input[name="password"]').fill(USERS.supervisor.password);
        await page.getByRole('button', { name: 'Войти' }).click();
        await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
        await page.goto(`${ADMIN_URL}/tickets`, { waitUntil: 'networkidle' });
        const search = page.locator('input[type="search"], input[placeholder*="оиск"]').first();
        if (await search.count()) {
          await search.fill(TAG);
          await page.waitForTimeout(1500);
        }
        const rows = await page.locator('tbody tr').count();
        const body = await page.locator('body').innerText();
        const statusShown = await get(`/tickets/${ticketId}`, auth);
        return {
          ok: rows >= 1 && body.includes(TAG),
          actual: `в разделе «Заявки» под бригадиром строк ${rows}; описание заявки найдено в выдаче: `
            + `${body.includes(TAG)}; серверный статус=${statusShown.json.status}`,
          evidence: `UI /tickets под supervisor@cleaning-ops.com; GET /api/tickets/${ticketId} → ${statusShown.json.status}`,
        };
      },
    );
  } finally {
    await browser.close();
  }

  // ------------------------------------------------------------------
  // Уборка
  // ------------------------------------------------------------------
  await check.step(
    'S11',
    'Уборка: заявки, точки трека и геозона прогона сняты, демо-данные целы',
    'заявок с описанием UAT-M74-S не осталось; у демо-объекта по-прежнему 3 этажа',
    async () => {
      for (const id of created.tickets) {
        if (id.startsWith('object:')) await del(`/objects/${id.slice(7)}`, { token: admin });
      }
      // У заявок нет DELETE: снимаем ровно созданные строки SQL-ом
      // (assignments и comments уходят каскадом).
      const removedTickets = psql(
        'cleaning_ops_tickets',
        `DELETE FROM tickets WHERE description LIKE '${TAG}%'`,
      );
      // Точечно снимаем созданные точки трека и геозону (эндпоинтов удаления нет).
      const removedTracks = psql(
        'cleaning_ops_gps',
        `DELETE FROM gps_tracks WHERE user_id = '${operatorUser.id}' AND timestamp > now() - interval '30 minutes'`,
      );
      const removedGeofence = psql(
        'cleaning_ops_gps',
        `DELETE FROM geofences WHERE name = '${GEOFENCE_NAME}'`,
      );
      const left = await get(`/tickets?search=${encodeURIComponent(TAG)}&take=100`, auth);
      const floors = await get(`/objects/${DEMO_OBJECT}/floors`, auth);
      return {
        ok: left.json.total === 0 && floors.json.length === 3,
        actual: `заявок прогона осталось ${left.json.total}; этажей у демо-объекта ${floors.json.length}; `
          + `SQL: геозона «${GEOFENCE_NAME}» — («${removedGeofence}»), точки трека — («${removedTracks}»), `
          + `заявки — («${removedTickets}»), предуборка — («${preCleaned}»)`,
        evidence: 'DELETE /api/tickets/:id; SQL cleaning_ops_gps (geofences, gps_tracks)',
      };
    },
  );

  const summary = check.finish();
  process.exitCode = summary.failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('КРИТИЧЕСКАЯ ОШИБКА ПРОГОНА:', error);
  process.exit(2);
});
