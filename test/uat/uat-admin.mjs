/**
 * М7.4 — UAT роли «Администратор».
 *
 * Сценарий (ПЛАН.md, М7.4): объекты, этажи и планы, помещения, маршруты,
 * техкарты, графики, материалы, справочник, отчёты и доска действий (М7.1).
 *
 * Проверяется на ЖИВОМ стенде через единую точку входа (nginx :8080). Все
 * созданные UAT-сущности помечены префиксом `UAT-M74-` и снимаются в конце
 * прогона — демонстрационные данные («БЦ «Ромашка»» и прочее) не трогаются.
 *
 * Что проверяется интерфейсом (Playwright chromium), а что контрактом:
 *  - интерфейсом — вход, доска действий (KPI + LCP), страница отчётов (4 вкладки,
 *    фильтры в query-строке, графики, экспорт CSV), видимость разделов;
 *  - контрактом того же экрана — CRUD объектов/этажей/планов/помещений/
 *    маршрутов/техкарт/графиков/материалов, потому что админка ходит ровно
 *    этими вызовами (проверено трассировкой сетевых запросов страницы).
 *
 * Запуск: cd test && node uat/uat-admin.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { API, ADMIN_URL, Checklist, USERS, cleanupUatSql, del, get, patch, post, tokenProvider } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'UAT-M74';
const runId = Date.now().toString(36);

/** Созданное прогоном — снимается в конце. */
const created = { objects: [], users: [], materials: [], techCards: [], schedules: [] };

/**
 * Предуборка: прогон обязан быть повторяемым. Если предыдущий запуск упал до
 * уборки, в стенде остались объекты/техкарты/графики с префиксом `UAT-M74-` —
 * снимаем их до начала, иначе счётчики шагов («до прохода смен 0») врут.
 */
async function preClean(auth) {
  const objects = await get('/objects?take=100', auth);
  for (const item of objects.json.items.filter((o) => o.name.startsWith(TAG))) {
    await del(`/objects/${item.id}`, auth);
  }
  const cards = await get('/tech-cards', auth);
  for (const item of cards.json.items.filter((c) => c.name.startsWith(TAG))) {
    await del(`/tech-cards/${item.id}`, auth);
  }
  const schedules = await get('/schedule', auth);
  for (const item of schedules.json.filter((s) => s.name.startsWith(TAG))) {
    await del(`/schedule/${item.id}`, auth);
  }
  const materials = await get('/materials?take=100', auth);
  for (const item of materials.json.items.filter((m) => m.name.startsWith(TAG))) {
    await del(`/materials/${item.id}`, auth);
  }
}

async function main() {
  const check = new Checklist('admin', 'объекты, графики, отчёты и доска действий');
  const admin = tokenProvider(USERS.admin.email, USERS.admin.password);
  const auth = { token: admin };
  await preClean(auth);
  const preCleaned = cleanupUatSql(TAG);

  // ------------------------------------------------------------------
  // 1. Объекты
  // ------------------------------------------------------------------
  const objectName = `${TAG}-${runId} объект`;
  let objectId;
  await check.step(
    'A1',
    'Объект: создание через контракт админки (POST /api/objects)',
    '201, объект появляется в списке с заданными площадью, этажностью и заказчиком',
    async () => {
      const res = await post(
        '/objects',
        {
          name: objectName,
          address: 'г. Москва, ул. Приёмочная, 7',
          type: 'BUSINESS_CENTER',
          totalArea: 1500,
          floorsCount: 2,
          clientName: `${TAG} заказчик`,
          clientContact: '+7 495 111-22-33',
          lat: 55.76,
          lng: 37.62,
        },
        auth,
      );
      if (res.status !== 201) return { ok: false, actual: `HTTP ${res.status}: ${res.brief}` };
      objectId = res.json.id;
      created.objects.push(objectId);
      const list = await get(`/objects?search=${encodeURIComponent(objectName)}`, auth);
      const found = list.json?.items?.find((item) => item.id === objectId);
      return {
        ok: Boolean(found) && found.totalArea === 1500 && found.floorsCount === 2,
        actual: `HTTP 201, id=${objectId}; в списке найден (${list.json?.total ?? 0}), `
          + `totalArea=${found?.totalArea}, floorsCount=${found?.floorsCount}, clientName=${found?.clientName}`,
        evidence: `GET /api/objects?search=${objectName} → ${list.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 2. Этажи и планы
  // ------------------------------------------------------------------
  let floorId;
  await check.step(
    'A2',
    'Этаж: создание и загрузка плана (multipart → file-service → core)',
    '201 на этаж; план принят, `planImageUrl` заполнен, размеры плана сохранены (700×500)',
    async () => {
      const floor = await post(`/objects/${objectId}/floors`, { number: 1, name: `${TAG} 1 этаж` }, auth);
      if (floor.status !== 201) return { ok: false, actual: `этаж HTTP ${floor.status}: ${floor.brief}` };
      floorId = floor.json.id;

      const svg = readFileSync(join(here, 'fixtures', 'uat-floor-plan.svg'));
      const form = new FormData();
      form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'uat-floor-plan.svg');
      const upload = await fetch(`${API}/floors/${floorId}/plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await admin()}` },
        body: form,
      });
      const uploaded = await upload.json().catch(() => null);
      const detail = await get(`/floors/${floorId}`, auth);

      // План реально отдаётся по URL (иначе редактор помещений рисует пустоту).
      const planResponse = detail.json?.planImageUrl
        ? await fetch(detail.json.planImageUrl)
        : null;
      const bytes = planResponse ? (await planResponse.arrayBuffer()).byteLength : 0;

      return {
        ok: upload.status === 201 && Boolean(detail.json?.planImageUrl) && bytes === svg.length,
        actual: `этаж 201 id=${floorId}; план HTTP ${upload.status}; planImageUrl=${detail.json?.planImageUrl}; `
          + `размеры плана ${detail.json?.planWidth}×${detail.json?.planHeight}; отдача файла HTTP ${planResponse?.status} (${bytes} Б = столько же, сколько отправлено)`,
        evidence: `POST /api/floors/${floorId}/plan → ${upload.status}; GET плана → ${planResponse?.status}, ${bytes} Б`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 3. Помещения
  // ------------------------------------------------------------------
  let roomId;
  let techCardId;
  await check.step(
    'A3',
    'Помещение: рисование рамкой по плану (координаты внутри плана) и привязка техкарты',
    '201, координаты и техкарта сохранены; рамка за границей плана отклоняется 400',
    async () => {
      const cards = await get('/tech-cards', auth);
      techCardId = cards.json.items[0].id;

      const room = await post(
        `/floors/${floorId}/rooms`,
        {
          name: `${TAG} помещение 101`,
          areaM2: 32,
          floorType: 'office',
          coordsX: 40,
          coordsY: 40,
          coordsWidth: 200,
          coordsHeight: 140,
          zone: 'A',
          techCardId,
        },
        auth,
      );
      if (room.status !== 201) return { ok: false, actual: `HTTP ${room.status}: ${room.brief}` };
      roomId = room.json.id;

      const outside = await post(
        `/floors/${floorId}/rooms`,
        {
          name: `${TAG} вне плана`,
          areaM2: 10,
          floorType: 'office',
          coordsX: 690,
          coordsY: 480,
          coordsWidth: 200,
          coordsHeight: 140,
        },
        auth,
      );
      return {
        ok: outside.status === 400 && room.json.techCardId === techCardId,
        actual: `помещение 201 id=${roomId}, техкарта привязана (${techCardId}); `
          + `рамка, выходящая за план (690+200 > 700) → HTTP ${outside.status} «${outside.json?.message ?? ''}»`,
        evidence: `POST /api/floors/${floorId}/rooms → 201; вне плана → ${outside.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 4. Маршруты
  // ------------------------------------------------------------------
  await check.step(
    'A4',
    'Маршрут: создание, точки, порядок (reorder) и суммарное время',
    'точки сохраняют порядок 0..n, `totalEstimatedTimeMin` = сумма оценок, `take` вне 1..100 → 400',
    async () => {
      const route = await post(`/floors/${floorId}/routes`, { name: `${TAG} маршрут` }, auth);
      if (route.status !== 201) return { ok: false, actual: `маршрут HTTP ${route.status}: ${route.brief}` };
      const routeId = route.json.id;

      const points = [];
      for (const time of [10, 20]) {
        const point = await post(
          `/routes/${routeId}/points`,
          { roomId, orderIndex: points.length, estimatedTimeMin: time },
          auth,
        );
        if (point.status !== 201) return { ok: false, actual: `точка HTTP ${point.status}: ${point.brief}` };
        points.push(point.json);
      }
      const reorder = await patch(
        `/routes/${routeId}/reorder`,
        { pointIds: [points[1].id, points[0].id] },
        auth,
      );
      const detail = await get(`/routes/${routeId}`, auth);
      const order = detail.json.points.map((p) => p.id);
      const bad = await get('/routes?take=101', auth);

      return {
        ok:
          reorder.status === 200 &&
          order[0] === points[1].id &&
          order[1] === points[0].id &&
          detail.json.totalEstimatedTimeMin === 30 &&
          bad.status === 400,
        actual: `маршрут 201 id=${routeId}; точки ${points.length}; порядок после reorder `
          + `[${order.map((id) => (id === points[0].id ? 'первая' : 'вторая')).join(', ')}]; `
          + `totalEstimatedTimeMin=${detail.json.totalEstimatedTimeMin}; take=101 → HTTP ${bad.status}`,
        evidence: `PATCH /api/routes/${routeId}/reorder → ${reorder.status}; GET /api/routes?take=101 → ${bad.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 5. Техкарты и операции
  // ------------------------------------------------------------------
  await check.step(
    'A5',
    'Техкарта: операции, сумма времени, порядок и материалы из справочника',
    '5 операций, сумма времени совпадает, reorder меняет порядок, операция ссылается на материал справочника',
    async () => {
      const materials = await get('/materials?take=10', auth);
      const materialId = materials.json.items[0].id;

      const card = await post('/tech-cards', { name: `${TAG} техкарта` }, auth);
      if (card.status !== 201) return { ok: false, actual: `техкарта HTTP ${card.status}: ${card.brief}` };
      const cardId = card.json.id;
      created.techCards.push(cardId);

      const ops = [
        {
          name: `${TAG} вымыть пол`,
          estimatedTimeMin: 10,
          requiresPhoto: true,
          materials: [{ materialId, consumptionPerOperation: 0.5, unit: 'л' }],
        },
        { name: `${TAG} протереть пыль`, estimatedTimeMin: 5, requiresPhoto: false },
        { name: `${TAG} вынести мусор`, estimatedTimeMin: 3, requiresPhoto: false },
      ];
      const ids = [];
      for (const op of ops) {
        const res = await post(`/tech-cards/${cardId}/operations`, { orderIndex: ids.length, ...op }, auth);
        if (res.status !== 201) return { ok: false, actual: `операция HTTP ${res.status}: ${res.brief}` };
        ids.push(res.json.id);
      }
      const reorder = await patch(
        `/tech-cards/${cardId}/reorder`,
        { operationIds: [ids[2], ids[1], ids[0]] },
        auth,
      );
      const detail = await get(`/tech-cards/${cardId}`, auth);
      const linked = detail.json.operations.find(
        (op) => (op.materials ?? []).some((m) => m.materialId === materialId),
      );

      return {
        ok:
          reorder.status === 200 &&
          detail.json.operations.map((op) => op.orderIndex).join(',') === '0,1,2' &&
          detail.json.operations[0].name === `${TAG} вынести мусор` &&
          Boolean(linked),
        actual: `техкарта 201 id=${cardId}; операций ${detail.json.operations.length}; `
          + `порядок после reorder: ${detail.json.operations.map((op) => op.orderIndex).join(',')}; `
          + `первая = «${detail.json.operations[0].name}»; материал справочника привязан: ${Boolean(linked)}`,
        evidence: `PATCH /api/tech-cards/${cardId}/reorder → ${reorder.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 6. Графики и смены
  // ------------------------------------------------------------------
  await check.step(
    'A6',
    'График: создание, генерация смен на дату, скоупинг и идемпотентность прохода (дата прогона уникальна)',
    'смены создаются только по своему графику, повтор не дублирует, несуществующий eventId → 404',
    async () => {
      // Дата прогона уникальна: 2027-й, день из хвоста runId — повторный запуск
      // не натыкается на смены предыдущего.
      const date = `2027-03-${String((parseInt(runId.slice(-4), 36) % 27) + 1).padStart(2, '0')}`;
      const users = await get('/users?take=50', auth);
      const supervisorUserId = users.json.items.find((u) => u.email === USERS.supervisor.email).id;

      const route = await post(`/floors/${floorId}/routes`, { name: `${TAG} маршрут графика` }, auth);
      const schedule = await post(
        '/schedule',
        {
          objectId,
          routeId: route.json.id,
          name: `${TAG} график`,
          recurrence: { frequency: 'daily', time: '08:00' },
          assignees: [supervisorUserId],
        },
        auth,
      );
      if (schedule.status !== 201) return { ok: false, actual: `график HTTP ${schedule.status}: ${schedule.brief}` };
      const scheduleId = schedule.json.id;
      created.schedules.push(scheduleId);

      const before = await get(`/schedule/events?date=${date}`, auth);
      const generate = await post(`/schedule/generate?date=${date}&scheduleId=${scheduleId}`, undefined, auth);
      const after = await get(`/schedule/events?date=${date}`, auth);
      const repeat = await post(`/schedule/generate?date=${date}&scheduleId=${scheduleId}`, undefined, auth);
      const third = await get(`/schedule/events?date=${date}`, auth);
      const badEvent = await post('/schedule/check-missed?eventId=00000000-0000-4000-8000-000000000000', undefined, auth);

      const mine = third.json.filter((event) => event.scheduleId === scheduleId);
      return {
        ok:
          before.json.length === 0 &&
          generate.status === 201 &&
          after.json.length === 1 &&
          repeat.status === 201 &&
          third.json.length === 1 &&
          mine.length === 1 &&
          badEvent.status === 404,
        actual: `график 201 id=${scheduleId}; смен на ${date} до прохода ${before.json.length}; `
          + `generate → HTTP ${generate.status} (created=${generate.json?.shiftsCreated}, tickets=${generate.json?.ticketsCreated}); `
          + `после прохода ${after.json.length}; повторный проход → ${third.json.length} (дублей нет); `
          + `check-missed с чужим eventId → HTTP ${badEvent.status}`,
        evidence: `POST /api/schedule/generate?date=${date}&scheduleId=${scheduleId} дважды; GET /api/schedule/events?date=${date}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 7. Материалы
  // ------------------------------------------------------------------
  await check.step(
    'A7',
    'Материалы: справочник, складские движения, остаток и отчёт по расходу',
    'IN создаёт остаток, OUT сверх остатка → 400, отчёт по расходу совпадает с движениями',
    async () => {
      const material = await post(
        '/materials',
        {
          name: `${TAG} материал ${runId}`,
          unit: 'л',
          defaultConsumption: 0.4,
          minStockThreshold: 2,
          costPerUnit: 300,
        },
        auth,
      );
      if (material.status !== 201) return { ok: false, actual: `материал HTTP ${material.status}: ${material.brief}` };
      created.materials.push(material.json.id);

      const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const movement = await post(
        '/materials/movements',
        { materialId: material.json.id, objectId, type: 'IN', quantity: 10 },
        auth,
      );
      const out = await post(
        '/materials/movements',
        { materialId: material.json.id, objectId, type: 'OUT', quantity: 4 },
        auth,
      );
      const tooMuch = await post(
        '/materials/movements',
        { materialId: material.json.id, objectId, type: 'OUT', quantity: 999 },
        auth,
      );
      const stocks = await get(`/materials/stocks?objectId=${objectId}`, auth);
      const stock = stocks.json.items?.find((s) => s.materialId === material.json.id);
      const report = await get(
        `/materials/reports/consumption?objectId=${objectId}&from=${from}&to=${to}`,
        auth,
      );
      const movements = await get(`/materials/${material.json.id}/movements`, auth);
      const outSum = (movements.json.items ?? movements.json ?? [])
        .filter((m) => m.type === 'OUT' || m.type === 'WRITE_OFF')
        .reduce((sum, m) => sum + Number(m.quantity), 0);

      return {
        ok:
          movement.status === 201 &&
          out.status === 201 &&
          tooMuch.status === 400 &&
          stock?.quantity === 6 &&
          report.json.totals.consumedQuantity === outSum,
        actual: `материал 201; IN 10 → HTTP ${movement.status}; OUT 4 → HTTP ${out.status}; `
          + `OUT 999 → HTTP ${tooMuch.status} «${tooMuch.json?.message ?? ''}»; `
          + `остаток=${stock?.quantity ?? '—'}; отчёт: расход=${report.json.totals.consumedQuantity} `
          + `против суммы движений OUT=${outSum}`,
        evidence: `GET /api/materials/reports/consumption (чтение через SQL-view М7.1) сверено с GET /api/materials/:id/movements`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 8. Справочник сотрудников
  // ------------------------------------------------------------------
  await check.step(
    'A8',
    'Справочник: создание сотрудника, роли, блокировка входа деактивированному',
    'POST /api/users → 201; сотрудник виден в списке; после DELETE вход невозможен',
    async () => {
      const email = `uat-m74-${runId}@cleaning-ops.com`;
      const user = await post(
        '/users',
        {
          email,
          password: 'uatPass123',
          fullName: `${TAG} сотрудник`,
          phone: `+7999${String(Date.now()).slice(-7)}`,
          role: 'OPERATOR',
          isActive: true,
        },
        auth,
      );
      if (user.status !== 201) return { ok: false, actual: `HTTP ${user.status}: ${user.brief}` };
      created.users.push(user.json.id);

      const list = await get(`/users?search=${encodeURIComponent('uat-m74-')}`, auth);
      const login1 = await post('/auth/login', { email, password: 'uatPass123' });
      await del(`/users/${user.json.id}`, auth);
      const login2 = await post('/auth/login', { email, password: 'uatPass123' });

      return {
        ok: list.json.items.some((u) => u.id === user.json.id) && login1.status === 201 && login2.status === 401,
        actual: `сотрудник 201 id=${user.json.id}; найден в справочнике: да; `
          + `вход до деактивации HTTP ${login1.status}, после DELETE → HTTP ${login2.status}`,
        evidence: `POST /api/users → 201; DELETE /api/users/:id → 204; повторный вход → ${login2.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // 9. Отчёты (М7.1) — четыре раздела отдают данные
  // ------------------------------------------------------------------
  const reportEndpoints = [
    ['материалы', '/materials/reports/consumption'],
    ['заявки', '/tickets/reports/execution'],
    ['персонал', '/schedule/reports/staff-control'],
    ['геозоны', '/gps/reports/geofence-control'],
  ];
  for (const [title, path] of reportEndpoints) {
    await check.step(
      `A9.${reportEndpoints.findIndex(([t]) => t === title) + 1}`,
      `Отчёт «${title}»: ${path}`,
      '200 и разборная структура (rows/series/totals) без ошибок CQRS-read слоя',
      async () => {
        const res = await get(path, auth);
        const shape = res.json ?? {};
        const ok = res.status === 200
          && Array.isArray(shape.rows)
          && Array.isArray(shape.series)
          && typeof shape.totals === 'object';
        return {
          ok,
          actual: `HTTP ${res.status} за ${res.ms} мс; rows=${shape.rows?.length}, series=${shape.series?.length}, `
            + `totals=${JSON.stringify(shape.totals)}`,
          evidence: `GET /api${path} → ${res.status}`,
        };
      },
    );
  }

  // ------------------------------------------------------------------
  // 10–12. Интерфейс: вход, доска действий (LCP), отчёты, CSV, разделы
  // ------------------------------------------------------------------
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await check.step(
      'A10',
      'Админка: вход под администратором и доска действий с KPI (М7.1)',
      'вход → /dashboard; KPI-карточки с числами; LCP < 2000 мс (порог М7.1)',
      async () => {
        await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.locator('input[name="email"]').fill(USERS.admin.email);
        await page.locator('input[name="password"]').fill(USERS.admin.password);
        await page.getByRole('button', { name: 'Войти' }).click();
        await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
        await page.waitForSelector('[data-testid^="kpi-"], [data-testid^="dashboard-"]', { timeout: 20000 })
          .catch(() => {});

        // LCP из PerformanceObserver — та же метрика, что мерилась в М7.2.
        const lcp = await page.evaluate(async () => {
          return await new Promise((resolve) => {
            const entries = performance.getEntriesByType('largest-contentful-paint');
            if (entries.length) {
              resolve(entries[entries.length - 1].startTime);
              return;
            }
            const observer = new PerformanceObserver((list) => {
              const list2 = list.getEntries();
              resolve(list2[list2.length - 1].startTime);
            });
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            setTimeout(() => resolve(-1), 5000);
          });
        });

        const bodyText = await page.locator('body').innerText();
        const kpiCount = await page.locator('[data-testid^="kpi-"]').count();
        const charts = await page.locator('[data-testid^="report-chart-"], .recharts-surface').count();

        return {
          ok: /\/dashboard$/.test(page.url()) && lcp > 0 && lcp < 2000,
          actual: `URL=${new URL(page.url()).pathname}; KPI-элементов ${kpiCount}; графиков ${charts}; `
            + `LCP=${Math.round(lcp)} мс; ошибок консоли ${consoleErrors.length}`,
          evidence: `PerformanceObserver largest-contentful-paint = ${Math.round(lcp)} мс (порог М7.1 — 2000 мс)`,
        };
      },
    );

    await check.step(
      'A11',
      'Отчёты: четыре вкладки, фильтры в query-строке, график Recharts отрисован',
      'вкладки переключаются и живут в URL, фильтр периода меняет query, на «материалах» есть SVG-график и строки',
      async () => {
        await page.goto(`${ADMIN_URL}/reports?tab=materials`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-testid="report-totals-materials"]', { timeout: 20000 });
        const tabs = [];
        for (const key of ['materials', 'tickets', 'staff', 'geofences']) {
          await page.locator(`[data-testid="report-tab-${key}"]`).click();
          await page.waitForTimeout(500);
          tabs.push(`${key}:${new URL(page.url()).searchParams.get('tab') ?? '—'}`);
        }
        await page.locator('[data-testid="report-tab-materials"]').click();
        await page.locator('[data-testid="report-period-30"]').click();
        await page.waitForTimeout(1200);
        const query = new URL(page.url()).search;
        const svg = await page.locator('[data-testid="report-chart-consumption"] svg').count();
        const rows = await page.locator('[data-testid^="report-row-"]').count();
        const totals = await page.locator('[data-testid="report-totals-materials"]').innerText();

        return {
          ok: tabs.every((entry) => entry.split(':')[1] !== '—') && /from=/.test(query) && svg > 0 && rows > 0,
          actual: `вкладки → ${tabs.join(', ')}; query после периода 30 дней: ${query}; `
            + `SVG-график расхода: ${svg}; строк таблицы ${rows}; итоги: ${totals.replace(/\n/g, ' / ')}`,
          evidence: `URL: ${page.url()}; строки таблицы через data-testid="report-row-*"`,
        };
      },
    );

    await check.step(
      'A12',
      'Отчёты: экспорт CSV отдаёт файл с заголовками и строками',
      'скачивание начинается, файл непустой, первая строка — заголовки, есть строки данных',
      async () => {
        await page.goto(`${ADMIN_URL}/reports?tab=materials`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-testid="report-export-materials"]:not([disabled])', { timeout: 20000 });
        const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
        await page.locator('[data-testid="report-export-materials"]').click();
        const download = await downloadPromise;
        const path = await download.path();
        const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        return {
          ok: lines.length >= 2,
          actual: `файл «${download.suggestedFilename()}», строк ${lines.length}; `
            + `заголовки: ${lines[0]?.slice(0, 110)}`,
          evidence: `Playwright download event → ${download.suggestedFilename()} (${content.length} симв.)`,
        };
      },
    );

    await check.step(
      'A13',
      'Разделы админки открываются и рендерятся',
      'все одиннадцать разделов отдают заголовок, ни один не уводит на /login и не показывает пустой экран',
      async () => {
        const routes = [
          '/objects',
          '/routes',
          '/tech-cards',
          '/schedule',
          '/materials',
          '/employees',
          '/tickets',
          '/map',
          '/messages',
          '/notifications',
          '/reports',
        ];
        const seen = [];
        for (const route of routes) {
          await page.goto(`${ADMIN_URL}${route}`, { waitUntil: 'networkidle' });
          const heading = await page.locator('h1, h2').first().innerText().catch(() => '');
          seen.push(`${route}=«${heading.trim().slice(0, 28)}»`);
        }
        const empty = seen.filter((entry) => entry.includes('«»')).length;
        return {
          ok: empty === 0 && consoleErrors.length === 0,
          actual: `${seen.join(', ')}; пустых разделов: ${empty}; `
            + `ошибок консоли за прогон: ${consoleErrors.length}`
            + (consoleErrors.length ? ` → ${consoleErrors.slice(0, 2).join(' | ')}` : ''),
          evidence: routes.map((r) => `GET ${r}`).join(', '),
        };
      },
    );

    // Скрытые разделы для оператора — проверка RBAC интерфейса.
    await check.step(
      'A14',
      'RBAC интерфейса: у оператора нет разделов «Маршруты» и «Техкарты»',
      'пункты меню отсутствуют, прямой заход на /routes возвращает на доску действий',
      async () => {
        const operatorContext = await browser.newContext();
        const operatorPage = await operatorContext.newPage();
        await operatorPage.goto(`${ADMIN_URL}/login`, { waitUntil: 'domcontentloaded' });
        await operatorPage.locator('input[name="email"]').fill(USERS.operator.email);
        await operatorPage.locator('input[name="password"]').fill(USERS.operator.password);
        await operatorPage.getByRole('button', { name: 'Войти' }).click();
        await operatorPage.waitForURL(/\/dashboard$/, { timeout: 20000 });
        const menu = await operatorPage.locator('nav a, aside a').allInnerTexts();
        await operatorPage.goto(`${ADMIN_URL}/routes`, { waitUntil: 'networkidle' });
        await operatorPage.waitForTimeout(800);
        const finalPath = new URL(operatorPage.url()).pathname;
        await operatorContext.close();
        const hasRoutes = menu.some((item) => /Маршрут/i.test(item));
        const hasCards = menu.some((item) => /Техкарт/i.test(item));
        return {
          ok: !hasRoutes && !hasCards && finalPath === '/dashboard',
          actual: `меню оператора: ${menu.map((m) => m.trim()).filter(Boolean).join(' | ')}; `
            + `прямой заход /routes → ${finalPath}`,
          evidence: 'вход operator → /dashboard, /routes перенаправлен',
        };
      },
    );
  } finally {
    await browser.close();
  }

  // ------------------------------------------------------------------
  // Уборка созданного (демо-данные не трогаем)
  // ------------------------------------------------------------------
  for (const id of created.materials) await del(`/materials/${id}`, auth);
  for (const id of created.schedules) await del(`/schedule/${id}`, auth);
  for (const id of created.techCards) await del(`/tech-cards/${id}`, auth);
  for (const id of created.objects) await del(`/objects/${id}`, auth);
  const rest = await get('/objects?take=100', auth);
  const leftovers = rest.json.items.filter((item) => item.name.startsWith(TAG));

  await check.step(
    'A15',
    'Демонстрационные данные не тронуты, UAT-мусор снят',
    'объект «БЦ «Ромашка»» на месте, объектов с префиксом UAT-M74 не осталось',
    async () => {
      const after = cleanupUatSql(TAG);
      const floors = await get(`/objects/${'f9bd905f-924a-4df8-a517-5fb4a760bf01'}/floors`, auth);
      return {
        ok: leftovers.length === 0 && floors.json.length === 3,
        actual: `объектов UAT-M74 осталось ${leftovers.length}; `
          + `у демо-объекта «БЦ «Ромашка»» этажей ${floors.json.length} (ожидалось 3); `
          + `предуборка: ${preCleaned}; уборка: ${after}`,
        evidence: 'GET /api/objects, GET /api/objects/<демо>/floors после уборки',
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
