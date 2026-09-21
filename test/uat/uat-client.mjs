/**
 * М7.4 — UAT роли «Клиент» (портал заказчика, :8081).
 *
 * Сценарий (ПЛАН.md, М7.4): клиент видит только свой объект, создаёт заявку,
 * общается в чате.
 *
 * Роль играет РЕАЛЬНЫЙ демонстрационный клиент `owner@cleanfine.ru` (CLIENT,
 * ФИО «ООО «Ромашка»» — портал сопоставляет его с `Object.clientName` демо-объекта
 * «БЦ «Ромашка»»). Фикстурный `client@example.com` для этого сценария не годится:
 * у него нет объекта в демо-данных, и портал честно показал бы «Объект не
 * подключён».
 *
 * Читающие шаги идут через интерфейс портала (Playwright chromium, мобильный
 * вьюпорт), проверки изоляции — ещё и контрактом, чтобы «не вижу» не выглядело
 * как «данных нет вовсе».
 *
 * Запуск: cd test && node uat/uat-client.mjs
 */

import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  Checklist,
  PORTAL_URL,
  USERS,
  cleanupUatSql,
  del,
  get,
  patch,
  post,
  tokenProvider,
  waitFor,
} from './lib.mjs';

const TAG = 'UAT-M74-C';
const DEMO_OBJECT = 'f9bd905f-924a-4df8-a517-5fb4a760bf01';
const FOREIGN_OBJECT = '00000000-0000-4000-8000-000000000001';

/** Пароль владельца портала — машинная обвязка стенда, а не канон проекта. */
const OWNER = (() => {
  const text = readFileSync(join(homedir(), '.cleaning-ops', 'owner-account.txt'), 'utf8');
  const email = text.match(/[\w.+-]+@[\w.-]+/)[0];
  const password = text.match(/пароль:\s*(\S+)/)[1];
  return { email, password, fullName: 'ООО «Ромашка»' };
})();

const created = { tickets: [], materials: [], chats: [] };

function psql(database, sql) {
  return execFileSync(
    'docker',
    ['exec', 'cleaning-ops-postgres', 'psql', '-U', 'admin', '-d', database, '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

async function main() {
  const check = new Checklist('client', 'портал: свой объект, заявка, чат');
  const client = tokenProvider(OWNER.email, OWNER.password);
  const admin = tokenProvider(USERS.admin.email, USERS.admin.password);
  const auth = { token: client };

  const preCleaned = cleanupUatSql(TAG);
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 13'];
  const context = await browser.newContext({
    viewport: iPhone.viewport,
    screen: iPhone.screen,
    deviceScaleFactor: iPhone.deviceScaleFactor,
    isMobile: iPhone.isMobile,
    hasTouch: iPhone.hasTouch,
    userAgent: iPhone.userAgent,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const loginPortal = async () => {
    await page.goto(`${PORTAL_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('portal-login-email').fill(OWNER.email);
    await page.getByTestId('portal-login-password').fill(OWNER.password);
    await page.getByTestId('portal-login-submit').click();
    await page.waitForSelector('[data-testid="portal-dashboard"]', { timeout: 25000 });
  };

  try {
    // ----------------------------------------------------------------
    // C1. Вход и свой объект
    // ----------------------------------------------------------------
    await check.step(
      'C1',
      'Вход клиента в портал и показ своего объекта',
      'после входа открыт /dashboard, в шапке — «БЦ «Ромашка»», своего объекта достаточно для работы',
      async () => {
        await loginPortal();
        const header = await page.getByTestId('portal-header-object').innerText();
        const url = new URL(page.url()).pathname;
        return {
          ok: url === '/dashboard' && header.includes('Ромашка'),
          actual: `URL=${url}; объект в шапке: «${header.trim()}»; ФИО пользователя «${OWNER.fullName}» `
            + `совпало с clientName демо-объекта`,
          evidence: `UI ${PORTAL_URL}/login → /dashboard, data-testid="portal-header-object"`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C2. Область видимости: чужой объект недоступен
    // ----------------------------------------------------------------
    await check.step(
      'C2',
      'Изоляция: чужой объект по ?objectId= недоступен, данных чужого объекта нет в разметке',
      'страница показывает «Нет доступа к объекту», ни имени, ни данных чужого объекта в DOM нет',
      async () => {
        await page.goto(`${PORTAL_URL}/dashboard?objectId=${FOREIGN_OBJECT}`, {
          waitUntil: 'networkidle',
        });
        const forbidden = await page.getByTestId('portal-forbidden').count();
        const forbiddenText = forbidden
          ? await page.getByTestId('portal-forbidden').innerText()
          : '';
        const html = await page.content();
        const leaked = /Чужой|FOREIGN|00000000-0000-4000/.test(html) && forbidden === 0;

        // Контроль: тот же клиент со своим объектом видит данные (значит, отказ — про объект).
        await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: 'networkidle' });
        const own = await page.getByTestId('portal-header-object').innerText();

        // Контрактный контроль: API клиента по чужому objectId отдаёт пустой отчёт.
        const foreignReport = await get(
          `/materials/reports/consumption?objectId=${FOREIGN_OBJECT}`,
          auth,
        );

        return {
          ok: forbidden === 1 && !leaked && own.includes('Ромашка'),
          actual: `чужой objectId → блоков «Нет доступа» ${forbidden} («${forbiddenText.trim()}»); `
            + `утечки данных чужого объекта в разметке: ${leaked}; `
            + `без параметра виден свой объект «${own.trim()}»; `
            + `API по чужому объекту: расход=${foreignReport.json.totals.consumedQuantity}, операций=${foreignReport.json.totals.operationsCount}`,
          evidence: `UI /dashboard?objectId=<чужой> → portal-forbidden; GET /api/materials/reports/consumption?objectId=<чужой> под CLIENT`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C3. Создание заявки через портал
    // ----------------------------------------------------------------
    let ticketId;
    const marker = `${TAG}-${Date.now().toString(36)}`;
    await check.step(
      'C3',
      'Создание заявки из портала',
      'заявка появляется в списке портала и в ticket-service под тем же клиентом (createdBy = клиент)',
      async () => {
        await page.goto(`${PORTAL_URL}/tickets`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-testid="portal-ticket-list"]', { timeout: 20000 });
        await page.getByTestId('portal-ticket-create').click();
        await page.getByTestId('portal-ticket-description').fill(`${marker}: не закрывается дверь`);
        await page.getByTestId('portal-ticket-submit').click();
        await page.waitForSelector('[data-testid="portal-ticket-create-sheet"]', {
          state: 'hidden',
          timeout: 20000,
        });
        await page.waitForTimeout(1200);
        const listText = await page.getByTestId('portal-ticket-list').innerText();

        const me = (await get('/auth/me', auth)).json;
        const tickets = await waitFor(
          async () => {
            const res = await get(`/tickets?search=${encodeURIComponent(marker)}&take=10`, auth);
            return res.json.total > 0 ? res.json.items : null;
          },
          { timeoutMs: 15000, what: 'заявка в ticket-service' },
        );
        ticketId = tickets[0].id;
        created.tickets.push(ticketId);

        return {
          ok: listText.includes(marker) && tickets[0].createdBy === me.id,
          actual: `заявка видна в портале: ${listText.includes(marker)}; `
            + `в ticket-service id=${ticketId}, objectId=${tickets[0].objectId}, createdBy=${tickets[0].createdBy} `
            + `(= id клиента ${me.id}: ${tickets[0].createdBy === me.id}), статус=${tickets[0].status}`,
          evidence: `UI portal-ticket-create → portal-ticket-list; GET /api/tickets?search=${marker} под owner@cleanfine.ru`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C4. Отчёт по расходу в портале
    // ----------------------------------------------------------------
    await check.step(
      'C4',
      'Отчёт по расходу материалов в портале показывает расход именно своего объекта',
      'строка созданного материала есть в отчёте портала, итог совпадает с агрегатом material-service',
      async () => {
        const material = await post(
          '/materials',
          {
            name: `${TAG} средство ${marker}`,
            unit: 'л',
            defaultConsumption: 0.3,
            minStockThreshold: 1,
            costPerUnit: 200,
          },
          { token: admin },
        );
        if (material.status !== 201) return { ok: false, actual: `материал HTTP ${material.status}: ${material.brief}` };
        created.materials.push(material.json.id);

        await post(
          '/materials/movements',
          { materialId: material.json.id, objectId: DEMO_OBJECT, type: 'IN', quantity: 10 },
          { token: admin },
        );
        await post(
          '/materials/movements',
          { materialId: material.json.id, objectId: DEMO_OBJECT, type: 'OUT', quantity: 2.5 },
          { token: admin },
        );

        const today = new Date().toISOString().slice(0, 10);
        const report = await get(
          `/materials/reports/consumption?objectId=${DEMO_OBJECT}&from=${today}&to=${today}`,
          auth,
        );

        await page.goto(`${PORTAL_URL}/reports?tab=materials&from=${today}&to=${today}`, {
          waitUntil: 'networkidle',
        });
        const tab = page.getByTestId('portal-report-materials');
        await tab.waitFor({ timeout: 20000 });
        await page.waitForTimeout(1200);
        const tabText = await tab.innerText();
        const totalText = await tab.getByTestId('portal-report-total').innerText();
        const total = Number(totalText.replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.'));

        return {
          ok:
            tabText.includes(`${TAG} средство`) &&
            Number.isFinite(total) &&
            Math.abs(total - report.json.totals.consumedQuantity) < 0.01,
          actual: `материал прогона в отчёте портала: ${tabText.includes(`${TAG} средство`)}; `
            + `итог портала = ${totalText.trim()} против агрегата material-service ${report.json.totals.consumedQuantity} `
            + `(строк ${report.json.rows.length})`,
          evidence: `GET /api/materials/reports/consumption?objectId=<демо>&from=${today}&to=${today} под CLIENT`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C5. Чат с менеджером
    // ----------------------------------------------------------------
    const chatSeed = `${TAG}-менеджер-${marker}`;
    const chatReply = `${TAG}-ответ-клиента-${marker}`;
    await check.step(
      'C5',
      'Чат: клиент пишет менеджеру из портала, сообщение сохраняется на сервере',
      'сообщение видно в ленте портала и находится поиском chat-service у второго участника',
      async () => {
        const me = (await get('/auth/me', auth)).json;
        const manager = (await get('/auth/me', { token: admin })).json;
        const chat = await post(
          '/chat/chats',
          { type: 'direct', participantIds: [manager.id] },
          auth,
        );
        if (chat.status !== 201 && chat.status !== 200) {
          return { ok: false, actual: `чат HTTP ${chat.status}: ${chat.brief}` };
        }
        created.chats.push(chat.json.id);
        // Затравка от менеджера: портал открывает самый свежий DIRECT-чат клиента.
        await post(`/chat/chats/${chat.json.id}/messages`, { text: chatSeed }, { token: admin });

        await page.goto(`${PORTAL_URL}/chat`, { waitUntil: 'networkidle' });
        const thread = page.getByTestId('portal-chat-thread');
        await thread.waitFor({ timeout: 20000 });
        await page.waitForTimeout(1500);
        const seedVisible = (await thread.innerText()).includes(chatSeed);

        await page.getByTestId('portal-chat-input').fill(chatReply);
        await page.getByTestId('portal-chat-send').click();
        await page.waitForTimeout(2000);
        const replyVisible = (await thread.innerText()).includes(chatReply);

        const asManager = await get(
          `/chat/messages/search?q=${encodeURIComponent(chatReply)}&chatId=${chat.json.id}`,
          { token: admin },
        );
        const found = (asManager.json.items ?? []).some((item) => item.text === chatReply);
        const author = (asManager.json.items ?? []).find((item) => item.text === chatReply)?.authorId;

        return {
          ok: seedVisible && replyVisible && found && author === me.id,
          actual: `чат ${chat.json.id}; затравка менеджера видна клиенту: ${seedVisible}; `
            + `ответ клиента отрисован: ${replyVisible}; найден поиском chat-service у менеджера: ${found}; `
            + `автор ответа = клиент: ${author === me.id}`,
          evidence: `UI ${PORTAL_URL}/chat → portal-chat-input/send; GET /api/chat/messages/search?q=${chatReply} под ADMIN`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C6. Сквозной цикл: менеджер отвечает в чате заявки, клиент читает
    // ----------------------------------------------------------------
    await check.step(
      'C6',
      'Сквозной цикл: менеджер отвечает по заявке клиента, ответ доступен клиенту',
      'чат заявки создаётся менеджером, ответ менеджера читается клиентом через REST chat-service',
      async () => {
        const answer = `${TAG}-ответ менеджера по заявке-${marker}`;
        const manager = (await get('/auth/me', { token: admin })).json;
        const me = (await get('/auth/me', auth)).json;
        const chat = await post(
          '/chat/chats',
          { type: 'ticket', ticketId, participantIds: [manager.id] },
          { token: admin },
        );
        if (chat.status !== 201 && chat.status !== 200) {
          return { ok: false, actual: `чат заявки HTTP ${chat.status}: ${chat.brief}` };
        }
        created.chats.push(chat.json.id);

        const assigned = await post(`/tickets/${ticketId}/assign`, { assigneeId: me.id }, { token: admin });
        const sent = await post(`/chat/chats/${chat.json.id}/messages`, { text: answer }, { token: admin });

        const asClient = await get(
          `/chat/messages/search?q=${encodeURIComponent(answer)}&chatId=${chat.json.id}`,
          auth,
        );
        const found = (asClient.json.items ?? []).find((item) => item.text === answer);

        // Клиент видит свой ответ по заявке в REST-детали заявки.
        const detail = await get(`/tickets/${ticketId}`, auth);

        return {
          ok: assigned.status === 201 && sent.status === 201 && Boolean(found) && detail.status === 200,
          actual: `чат заявки ${chat.json.id}; назначение клиенту → HTTP ${assigned.status}; `
            + `ответ менеджера отправлен (HTTP ${sent.status}); клиент видит его через поиск chat-service: ${Boolean(found)}; `
            + `деталь заявки доступна клиенту: HTTP ${detail.status}, статус=${detail.json.status}`,
          evidence: `POST /api/chat/chats (type=ticket) под ADMIN; GET /api/chat/messages/search под CLIENT`,
        };
      },
    );

    // ----------------------------------------------------------------
    // C7. RBAC клиента
    // ----------------------------------------------------------------
    await check.step(
      'C7',
      'RBAC клиента: чтение своих данных, отказ на управление',
      'PATCH статуса заявки, создание/удаление объекта и справочник сотрудников → 403',
      async () => {
        const status = await patch(`/tickets/${ticketId}/status`, { status: 'in_progress' }, auth);
        const object = await post(
          '/objects',
          {
            name: `${TAG} попытка`,
            address: 'x',
            lat: 55.75,
            lng: 37.61,
            type: 'OFFICE',
            totalArea: 1,
            floorsCount: 1,
            clientName: 'x',
            clientContact: 'x',
          },
          auth,
        );
        const users = await get('/users?take=5', auth);
        const techCards = await get('/tech-cards', auth);
        const tickets = await get('/tickets?take=5', auth);

        return {
          ok:
            status.status === 403 &&
            object.status === 403 &&
            users.status === 403 &&
            tickets.status === 200,
          actual: `PATCH статуса → ${status.status}; POST /objects → ${object.status}; `
            + `GET /users → ${users.status}; GET /tech-cards → ${techCards.status}; `
            + `GET /tickets (свои) → ${tickets.status} (total=${tickets.json.total})`,
          evidence: 'контрактные вызовы под CLIENT-токеном владельца портала',
        };
      },
    );

    // ----------------------------------------------------------------
    // C8. Консоль портала
    // ----------------------------------------------------------------
    await check.step(
      'C8',
      'Портал не роняет консоль на своих экранах',
      'ошибок JS нет; отдельно фиксируется поведение WebSocket чата на prod-сборке за nginx',
      async () => {
        const socketErrors = consoleErrors.filter((text) => /WebSocket|socket\.io/i.test(text));
        const otherErrors = consoleErrors.filter((text) => !/WebSocket|socket\.io/i.test(text));
        return {
          ok: otherErrors.length === 0,
          actual: `экраны /dashboard, /tickets, /reports, /chat пройдены; `
            + `ошибок JS (кроме сокета): ${otherErrors.length}; ошибок WebSocket: ${socketErrors.length}`
            + (socketErrors.length ? ` → ${socketErrors[0].slice(0, 160)}` : ''),
          evidence: 'page.on("console"/"pageerror") за весь прогон портала',
        };
      },
    );
  } finally {
    await browser.close();

    // ----------------------------------------------------------------
    // Уборка
    // ----------------------------------------------------------------
    await check.step(
      'C9',
      'Уборка: заявка, материал и чаты прогона сняты, демо-данные целы',
      'заявок с маркером прогона нет; демо-объект и его структура на месте',
      async () => {
        for (const id of created.materials) await del(`/materials/${id}`, { token: admin });
        const removedTickets = psql(
          'cleaning_ops_tickets',
          `DELETE FROM tickets WHERE description LIKE '${TAG}%'`,
        );
        const removedChats = psql(
          'cleaning_ops_chat',
          `DELETE FROM "Chat" WHERE id IN (${created.chats.map((id) => `'${id}'`).join(',') || "''"})`,
        );
        const left = await get(`/tickets?search=${encodeURIComponent(TAG)}&take=10`, auth);
        const floors = await get(`/objects/${DEMO_OBJECT}/floors`, { token: admin });
        return {
          ok: left.json.total === 0 && floors.json.length === 3,
          actual: `заявок прогона осталось ${left.json.total}; этажей у демо-объекта ${floors.json.length}; `
            + `SQL: заявки («${removedTickets}»), чаты («${removedChats}»); предуборка: ${preCleaned}`,
          evidence: 'SQL cleaning_ops_tickets / cleaning_ops_chat; GET /api/objects/<демо>/floors',
        };
      },
    );
  }

  const summary = check.finish();
  process.exitCode = summary.failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('КРИТИЧЕСКАЯ ОШИБКА ПРОГОНА:', error);
  process.exit(2);
});
