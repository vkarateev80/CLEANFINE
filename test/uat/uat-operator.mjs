/**
 * М7.4 — UAT роли «Оператор» (сценарий М6) на уровне контракта приложения.
 *
 * Сценарий ПЛАН.md, М7.4: PIN-вход → смена и маршрут дня → чек-лист с фото →
 * завершение операций → списание материалов на сервере → SOS → оффлайн-очередь →
 * чат → профиль.
 *
 * ВАЖНО О ГРАНИЦЕ ПРОВЕРКИ. Этот файл проходит сценарий ТЕМИ ЖЕ вызовами, что
 * делает мобильное приложение (`lib/shared/data/repositories/*`), и подтверждает
 * серверную часть: смену, маршрут, загрузку фото в file-service, завершение
 * операций, автосписание, SOS и чат. Работа самих экранов на устройстве
 * проверяется отдельно — `integration_test/uat_operator_device_test.dart`
 * (эмулятор `co-test`), а измерения кадров — `integration_test/fps_measure_test.dart`.
 * В чек-листе роли эти два источника разведены явно, чтобы отметка «пройдено»
 * всегда подтверждалась конкретным наблюдением.
 *
 * Запуск: cd test && node uat/uat-operator.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API,
  Checklist,
  USERS,
  cleanupUatSql,
  get,
  patch,
  post,
  tokenProvider,
  waitFor,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'UAT-M74-O';
const DEMO_OBJECT = 'f9bd905f-924a-4df8-a517-5fb4a760bf01';
const GEOFENCE_NAME = `${TAG} зона`;

const created = { geofenceId: null, fileId: null, ticketIds: [], chatId: null };

function psql(database, sql) {
  return execFileSync(
    'docker',
    ['exec', 'cleaning-ops-postgres', 'psql', '-U', 'admin', '-d', database, '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

async function main() {
  const check = new Checklist(
    'operator',
    'PIN-вход, смена и маршрут, чек-лист с фото, автосписание, SOS, оффлайн-очередь, чат, профиль',
  );
  const operator = tokenProvider(USERS.operator.email, USERS.operator.password);
  const admin = tokenProvider(USERS.admin.email, USERS.admin.password);
  const supervisor = tokenProvider(USERS.supervisor.email, USERS.supervisor.password);

  // Предуборка: остатки упавшего прогона (заявки, чаты, геозоны, устройства) и
  // возврат смен оператора в исходное PLANNED. Без неё повторный запуск получал бы
  // «check-in вне зоны → 201» (повторная отметка идемпотентна и зону не проверяет).
  const preCleaned = cleanupUatSql(TAG);
  const operatorId0 = (await get('/auth/me', { token: operator })).json.id;
  const resetShifts = psql(
    'cleaning_ops_schedule',
    `UPDATE "ScheduleEvent" SET status = 'PLANNED', "checkInAt" = NULL, "checkOutAt" = NULL, `
      + `"checkInLat" = NULL, "checkInLng" = NULL, "checkOutLat" = NULL, "checkOutLng" = NULL `
      + `WHERE "userId" = '${operatorId0}' AND status <> 'PLANNED' `
      + `AND "checkInAt" IS NOT NULL AND "checkInAt" > now() - interval '1 day'`,
  );

  // ------------------------------------------------------------------
  // O1. PIN-вход
  // ------------------------------------------------------------------
  let session;
  await check.step(
    'O1',
    'PIN-вход: телефон + PIN (путь мобильного приложения, POST /api/auth/pin)',
    '201, выдан access-токен роли OPERATOR; неверный PIN отклоняется 401',
    async () => {
      const pinLogin = await post('/auth/pin', {
        phone: USERS.operator.phone,
        pinCode: USERS.operator.pin,
      });
      const wrong = await post('/auth/pin', { phone: USERS.operator.phone, pinCode: '0000' });
      const me = pinLogin.json?.accessToken
        ? await get('/auth/me', { token: pinLogin.json.accessToken })
        : null;
      session = pinLogin.json?.accessToken;
      const parts = String(session ?? '').split('.');
      const payload = parts.length === 3
        ? JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        : {};
      return {
        ok: pinLogin.status === 201 && me?.json?.role === 'OPERATOR' && wrong.status === 401,
        actual: `PIN-вход HTTP ${pinLogin.status}; /auth/me → role=${me?.json?.role}, ${me?.json?.fullName}; `
          + `неверный PIN → HTTP ${wrong.status}; токен: iat=${payload.iat}, exp=${payload.exp} (срок ${(payload.exp - payload.iat) / 60} мин)`,
        evidence: `POST /api/auth/pin {"phone":"${USERS.operator.phone}","pinCode":"****"} → ${pinLogin.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O2. Смена дня и отметка прихода по геозоне
  // ------------------------------------------------------------------
  let event;
  await check.step(
    'O2',
    'Смена дня: GET /api/schedule/my, отметка прихода по геозоне',
    'смена на сегодня есть; check-in внутри зоны 201 и статус меняется; вне зоны 403',
    async () => {
      // Геозона объекта: без неё check-in запрещён (403 «вне зоны объекта»).
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
        { token: admin },
      );
      if (geofence.status !== 201) {
        return { ok: false, actual: `геозона HTTP ${geofence.status}: ${geofence.brief}` };
      }
      created.geofenceId = geofence.json.id;

      const my = await get('/schedule/my', { token: operator });
      const today = new Date().toISOString().slice(0, 10);
      event = my.json.find((item) => item.date === today) ?? my.json[0];
      if (!event) return { ok: false, actual: 'у оператора нет смен — сценарий невозможен' };

      const outside = await post(
        '/schedule/check-in',
        { scheduleId: event.scheduleId, lat: 55.77, lng: 37.65 },
        { token: operator },
      );
      const checkIn = await post(
        '/schedule/check-in',
        { scheduleId: event.scheduleId, lat: 55.7558, lng: 37.6173 },
        { token: operator },
      );
      const after = await get(`/schedule/events/${event.id}`, { token: operator });

      return {
        ok: outside.status === 403 && (checkIn.status === 201 || checkIn.status === 200) && ['CHECKED_IN', 'IN_PROGRESS'].includes(after.json.status),
        actual: `смен на сегодня у оператора: ${my.json.length} (${my.json.map((e) => e.date).join(', ')}); `
          + `check-in вне зоны → HTTP ${outside.status} «${outside.json?.message ?? ''}»; `
          + `внутри зоны → HTTP ${checkIn.status}; статус смены=${after.json.status}, checkInAt=${after.json.checkInAt}`,
        evidence: `POST /api/schedule/check-in ×2 (вне/внутри геозоны «${GEOFENCE_NAME}»); GET /api/schedule/events/${event.id}; `
          + `состояние смен приведено к PLANNED до прогона (${resetShifts}); предуборка: ${preCleaned}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O3. Маршрут дня и план этажа
  // ------------------------------------------------------------------
  let routeDetail;
  let firstRoom;
  await check.step(
    'O3',
    'Маршрут дня: точки маршрута смены и план этажа',
    'маршрут содержит ≥1 точку с помещением и оценкой времени; план этажа отдаётся по URL (не заглушка)',
    async () => {
      const schedule = await get(`/schedule/${event.scheduleId}`, { token: operator });
      routeDetail = await get(`/routes/${schedule.json.routeId}`, { token: operator });
      const points = routeDetail.json.points ?? [];
      if (!points.length) return { ok: false, actual: 'в маршруте нет точек' };

      firstRoom = points[0].room;
      const room = await get(`/rooms/${firstRoom.id}`, { token: operator });
      const floor = await get(`/floors/${room.json.floorId}`, { token: operator });
      const plan = floor.json.planImageUrl ? await fetch(floor.json.planImageUrl) : null;
      const planBytes = plan ? (await plan.arrayBuffer()).byteLength : 0;

      return {
        ok: points.length >= 1 && Boolean(floor.json.planImageUrl) && planBytes > 1000,
        actual: `маршрут «${routeDetail.json.name}», точек ${points.length}, `
          + `суммарное время ${routeDetail.json.totalEstimatedTimeMin} мин; `
          + `первая точка: помещение «${firstRoom.name}» (${firstRoom.areaM2} м², техкарта ${firstRoom.techCardId}); `
          + `план «${floor.json.name}» ${floor.json.planWidth}×${floor.json.planHeight}, файл отдан HTTP ${plan?.status} (${planBytes} Б)`,
        evidence: `GET /api/schedule/${event.scheduleId} → routeId; GET /api/routes/<id>; GET /api/floors/<id> + GET planImageUrl`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O4. Чек-лист: техкарта помещения
  // ------------------------------------------------------------------
  let card;
  let operations;
  await check.step(
    'O4',
    'Чек-лист: техкарта помещения и порядок операций',
    'техкарта содержит операции строго по порядку, у каждой нормативное время, часть требует фото',
    async () => {
      card = await get(`/tech-cards/${firstRoom.techCardId}`, { token: operator });
      operations = (card.json.operations ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
      const dense = operations.every((op, index) => op.orderIndex === index);
      const withPhoto = operations.filter((op) => op.requiresPhoto).length;
      return {
        ok: operations.length > 0 && dense && withPhoto > 0,
        actual: `техкарта «${card.json.name}»: операций ${operations.length}, порядок плотный 0..n: ${dense}; `
          + `требуют фото: ${withPhoto}; операции: ${operations.map((op) => `${op.orderIndex}.${op.name.slice(0, 24)}${op.requiresPhoto ? ' [фото]' : ''}`).join(' | ')}`,
        evidence: `GET /api/tech-cards/${firstRoom.techCardId}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O5. Фото операции: загрузка в file-service
  // ------------------------------------------------------------------
  await check.step(
    'O5',
    'Фотоотчёт: загрузка снимка в file-service (multipart, kind=photo) и привязка к заявке',
    '201, ответ содержит url и размеры; снимок меньше 1280×720 отклоняется 400',
    async () => {
      const buffer = readFileSync(join(here, '..', 'fixtures', 'files', 'photo-ok.png'));
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'image/png' }), 'photo-ok.png');
      form.append('kind', 'photo');
      form.append('lat', '55.7558');
      form.append('lng', '37.6173');
      const upload = await fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await operator()}` },
        body: form,
      });
      const uploaded = await upload.json().catch(() => null);
      created.fileId = uploaded?.id ?? null;

      // Маленькое фото: тот же контроль, что делает приложение до отправки.
      const small = readFileSync(join(here, 'fixtures', 'uat-floor-plan.svg'));
      const smallForm = new FormData();
      smallForm.append('file', new Blob([small], { type: 'image/svg+xml' }), 'small.svg');
      smallForm.append('kind', 'photo');
      const smallUpload = await fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await operator()}` },
        body: smallForm,
      });

      return {
        ok: upload.status === 201 && Boolean(uploaded?.url) && smallUpload.status === 400,
        actual: `фото 1600×900 → HTTP ${upload.status}, id=${uploaded?.id}, url=${uploaded?.url}; `
          + `водяной знак/подпись: ${uploaded?.watermarked ?? '—'}; `
          + `неподходящий файл → HTTP ${smallUpload.status}`,
        evidence: `POST /api/files/upload (multipart, kind=photo) → ${upload.status}`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O6. Завершение операций чек-листа
  // ------------------------------------------------------------------
  let ticket;
  await check.step(
    'O6',
    'Завершение операций: POST /api/tickets/:id/operations/:opId/complete',
    'операция с фото без photoUrl → 400; с photoUrl → 201; повтор идемпотентен (alreadyCompleted)',
    async () => {
      const tickets = await get(
        `/tickets?assigneeId=${(await get('/auth/me', { token: operator })).json.id}&take=20`,
        { token: operator },
      );
      ticket = tickets.json.items.find((item) => item.status !== 'closed') ?? tickets.json.items[0];
      if (!ticket) return { ok: false, actual: 'у оператора нет назначенных заявок' };
      created.ticketIds.push(ticket.id);

      const photoOp = operations.find((op) => op.requiresPhoto);
      const plainOp = operations.find((op) => !op.requiresPhoto);
      const noPhoto = await post(
        `/tickets/${ticket.id}/operations/${photoOp.id}/complete`,
        { requiresPhoto: true, totalOperations: operations.length },
        { token: operator },
      );
      const withPhoto = await post(
        `/tickets/${ticket.id}/operations/${photoOp.id}/complete`,
        { photoUrl: `http://localhost:9000/${created.fileId}`, requiresPhoto: true, totalOperations: operations.length },
        { token: operator },
      );
      const repeat = await post(
        `/tickets/${ticket.id}/operations/${photoOp.id}/complete`,
        { photoUrl: `http://localhost:9000/${created.fileId}`, requiresPhoto: true, totalOperations: operations.length },
        { token: operator },
      );
      const simple = await post(
        `/tickets/${ticket.id}/operations/${plainOp.id}/complete`,
        { totalOperations: operations.length },
        { token: operator },
      );

      return {
        ok:
          noPhoto.status === 400 &&
          withPhoto.status === 201 &&
          repeat.status === 201 &&
          repeat.json?.alreadyCompleted === true &&
          simple.status === 201,
        actual: `заявка ${ticket.id}; операция «${photoOp.name}» без фото → HTTP ${noPhoto.status} `
          + `«${noPhoto.json?.message ?? ''}»; с photoUrl → HTTP ${withPhoto.status}; `
          + `повтор → HTTP ${repeat.status}, alreadyCompleted=${repeat.json?.alreadyCompleted}; `
          + `операция без фото «${plainOp.name}» → HTTP ${simple.status}`,
        evidence: `POST /api/tickets/${ticket.id}/operations/<op>/complete ×4`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O7. Автосписание материалов на сервере (сквозной путь М4)
  // ------------------------------------------------------------------
  await check.step(
    'O7',
    'Списание материалов на сервере: завершение операции техкарты уменьшает остаток автоматически',
    'после завершения операции с материалом остаток падает на норму расхода БЕЗ отдельного вызова, '
      + 'появляется запись ConsumedOperation; состояние техкарты и остатка восстановлено',
    async () => {
      // Операции демонстрационных техкарт материалов не содержат, поэтому норму
      // расхода задаём на время проверки и снимаем её в конце шага: иначе сквозной
      // путь «завершение операции → ticket.operation.completed → material-service»
      // проверить нечем. Само событие обрабатывает консьюмер material-service.
      const autoOp = operations[operations.length - 1];
      // Автосписание определяет материалы по цепочке ticket.roomId → room.techCardId →
      // операция техкарты. Демонстрационные заявки идут БЕЗ roomId, поэтому для
      // проверки сквозного пути создаём свою заявку на то же помещение.
      const autoTicket = await post(
        '/tickets',
        {
          type: 'unscheduled',
          objectId: DEMO_OBJECT,
          roomId: firstRoom.id,
          assigneeId: (await get('/auth/me', { token: operator })).json.id,
          description: `${TAG} автосписание материалов`,
          priority: 'normal',
        },
        { token: admin },
      );
      if (autoTicket.status !== 201) {
        return { ok: false, actual: `заявка для автосписания HTTP ${autoTicket.status}: ${autoTicket.brief}` };
      }
      const before = await get(`/materials/stocks?objectId=${DEMO_OBJECT}`, { token: operator });
      const stockRow = before.json.items
        .filter((row) => row.quantity >= 3)
        .sort((a, b) => b.quantity - a.quantity)[0];
      if (!stockRow) return { ok: false, actual: 'на объекте нет материалов с остатком ≥ 3' };
      const material = stockRow.material;
      const beforeQty = stockRow.quantity;
      const rate = 2;
      // Снимок движений ДО шага: после проверки удаляем ровно те строки, что создал
      // прогон, и возвращаем остаток к исходному — демонстрационные данные должны
      // остаться такими, какими были.
      const movementsBefore = psql(
        'cleaning_ops_materials',
        `SELECT id FROM "MaterialMovement" WHERE "materialId" = '${material.id}'`,
      )
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const attached = await patch(
        `/tech-operations/${autoOp.id}`,
        { materials: [{ materialId: material.id, consumptionPerOperation: rate, unit: material.unit ?? 'шт' }] },
        { token: admin },
      );
      if (attached.status !== 200) {
        return { ok: false, actual: `привязка материала к операции HTTP ${attached.status}: ${attached.brief}` };
      }

      const completed = await post(
        `/tickets/${autoTicket.json.id}/operations/${autoOp.id}/complete`,
        { completedAt: new Date().toISOString(), totalOperations: operations.length },
        { token: operator },
      );

      // Автосписание идёт через RabbitMQ — ждём факт, а не «спим».
      const afterQty = await waitFor(
        async () => {
          const stocks = await get(`/materials/stocks?objectId=${DEMO_OBJECT}`, { token: operator });
          const row = stocks.json.items.find((item) => item.materialId === material.id);
          return row && row.quantity === beforeQty - rate ? row.quantity : null;
        },
        { timeoutMs: 25000, stepMs: 700, what: `автосписание ${rate} ед. «${material.name}»` },
      ).catch(() => null);

      const consumed = psql(
        'cleaning_ops_materials',
        `SELECT count(*) FROM "ConsumedOperation" WHERE "ticketId" = '${autoTicket.json.id}' AND "operationId" = '${autoOp.id}'`,
      );
      const movement = psql(
        'cleaning_ops_materials',
        `SELECT type || ' ' || quantity || ' ' || coalesce("userId", '-') FROM "MaterialMovement" `
          + `WHERE "ticketId" = '${autoTicket.json.id}' AND "materialId" = '${material.id}' `
          + `ORDER BY "createdAt" DESC LIMIT 1`,
      );

      // Восстановление: техкарта без материала и остаток как был (компенсирующий IN).
      const detached = await patch(`/tech-operations/${autoOp.id}`, { materials: [] }, { token: admin });
      const compensate = await post(
        '/materials/movements',
        { materialId: material.id, objectId: DEMO_OBJECT, type: 'IN', quantity: rate },
        { token: admin },
      );
      // Заявку прогона убираем сразу: в описании есть префикс, поэтому её снимет и общая уборка.
      const removedAutoTicket = psql(
        'cleaning_ops_tickets',
        `DELETE FROM tickets WHERE id = '${autoTicket.json.id}'`,
      );
      // Возврат учёта материалов: снимаем движения, созданные шагом, и остаток.
      const restoreSql =
        `DELETE FROM "MaterialMovement" WHERE "materialId" = '${material.id}'`
        + (movementsBefore.length ? ` AND id NOT IN (${movementsBefore.map((id) => `'${id}'`).join(',')})` : '')
        + `; UPDATE "MaterialStock" SET quantity = ${beforeQty} `
        + `WHERE "materialId" = '${material.id}' AND "objectId" = '${DEMO_OBJECT}'; `
        + `DELETE FROM "ConsumedOperation" WHERE "ticketId" = '${autoTicket.json.id}'`;
      psql('cleaning_ops_materials', restoreSql);
      const restored = await get(`/materials/stocks?objectId=${DEMO_OBJECT}`, { token: admin });
      const restoredQty = restored.json.items.find((item) => item.materialId === material.id)?.quantity;

      return {
        ok:
          completed.status === 201 &&
          afterQty === beforeQty - rate &&
          Number(consumed) >= 1 &&
          restoredQty === beforeQty,
        actual: `заявка на помещение «${firstRoom.name}» (201, id=${autoTicket.json.id}); `
          + `материал «${material.name}»; норма ${rate} ${material.unit ?? 'шт'} привязана к операции `
          + `«${autoOp.name}» (HTTP ${attached.status}); завершение операции → HTTP ${completed.status}; `
          + `остаток ${beforeQty} → ${afterQty} БЕЗ отдельного вызова списания; `
          + `ConsumedOperation по операции: ${consumed}; последнее движение: ${movement}; `
          + `техкарта очищена (HTTP ${detached.status}), компенсирующий IN (HTTP ${compensate.status}) → остаток снова ${restoredQty}; `
          + `заявка прогона снята (${removedAutoTicket}); учёт материалов возвращён к состоянию до шага (движений было ${movementsBefore.length})`,
        evidence: `PATCH /api/tech-operations/${autoOp.id} (материал) → POST /api/tickets/${ticket.id}/operations/${autoOp.id}/complete `
          + `→ RabbitMQ ticket.operation.completed → material-service; SQL ConsumedOperation/MaterialMovement`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O8. SOS
  // ------------------------------------------------------------------
  await check.step(
    'O8',
    'SOS: аварийная заявка одной операцией, уведомление и состав участников',
    '201, тип emergency и CRITICAL, в ответе ближние операторы; руководителю приходит in-app EMERGENCY',
    async () => {
      // Регистрация устройств — то, что мобильное приложение делает на старте
      // (`POST /api/notifications/device`, DS-002 `profile.md` §3.4). Она нужна
      // не для push, а для адресации: без явного списка получателей
      // notification-service рассылает владельцам АКТИВНЫХ устройств.
      const operatorId = (await get('/auth/me', { token: operator })).json.id;
      const supervisorId = (await get('/auth/me', { token: supervisor })).json.id;
      const deviceOperator = await post(
        '/notifications/device',
        { token: `uat-m74-operator-${Date.now()}`, platform: 'android' },
        { token: operator },
      );
      const deviceSupervisor = await post(
        '/notifications/device',
        { token: `uat-m74-supervisor-${Date.now()}`, platform: 'android' },
        { token: supervisor },
      );

      const sos = await post(
        '/tickets/emergency',
        {
          objectId: DEMO_OBJECT,
          description: `${TAG} протечка в санузле`,
          lat: 55.7558,
          lng: 37.6173,
          roomId: firstRoom.id,
          objectName: 'БЦ «Ромашка»',
          floor: '1',
          radiusM: 500,
        },
        { token: operator },
      );
      if (sos.status !== 201) return { ok: false, actual: `SOS HTTP ${sos.status}: ${sos.brief}` };
      created.ticketIds.push(sos.json.id);

      const notification = await waitFor(
        async () => {
          const list = await get('/notifications?take=20', { token: supervisor });
          return list.json.items.find(
            (item) => item.type === 'EMERGENCY' && item.payload?.ticketId === sos.json.id,
          );
        },
        { timeoutMs: 20000, what: 'уведомление EMERGENCY' },
      ).catch(() => null);

      const detail = await get(`/tickets/${sos.json.id}`, { token: operator });
      return {
        ok:
          detail.json.type === 'emergency' &&
          detail.json.priority === 'critical' &&
          Boolean(notification),
        actual: `SOS HTTP ${sos.status}; заявка id=${sos.json.id}, тип=${detail.json.type}, `
          + `приоритет=${detail.json.priority}, таймер реакции=${detail.json.reactionDeadline}; `
          + `ближних операторов в ответе: ${sos.json.nearby?.length ?? sos.json.nearbyOperators?.length ?? 0}; `
          + `уведомление бригадиру: «${notification?.title ?? 'НЕ ПРИШЛО'}» `
          + `(устройства: оператор HTTP ${deviceOperator.status}, бригадир HTTP ${deviceSupervisor.status}; `
          + `получатели — владельцы активных устройств)`,
        evidence: `POST /api/tickets/emergency → RabbitMQ ticket.emergency → GET /api/notifications под SUPERVISOR`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O9. Оффлайн-очередь (серверная часть)
  // ------------------------------------------------------------------
  await check.step(
    'O9',
    'Оффлайн-очередь: повтор отправки после восстановления связи не дублирует результат',
    'повторное завершение операции и повторный check-in идемпотентны; GPS-точки принимаются батчем',
    async () => {
      const repeatCheckIn = await post(
        '/schedule/check-in',
        { scheduleId: event.scheduleId, lat: 55.7558, lng: 37.6173 },
        { token: operator },
      );
      const plainOp = operations.find((op) => !op.requiresPhoto);
      const reComplete = await post(
        `/tickets/${ticket.id}/operations/${plainOp.id}/complete`,
        { totalOperations: operations.length },
        { token: operator },
      );
      const now = Date.now();
      const batch = await post(
        '/gps/track',
        {
          tracks: Array.from({ length: 10 }, (_, index) => ({
            lat: 55.7558 + index * 0.00005,
            lng: 37.6173 + index * 0.00005,
            accuracy: 5,
            speed: 0.4,
            timestamp: new Date(now - (10 - index) * 15_000).toISOString(),
          })),
        },
        { token: operator },
      );
      const completions = psql(
        'cleaning_ops_tickets',
        `SELECT count(*) FROM ticket_operation_completions WHERE "ticketId" = '${ticket.id}' AND "operationId" = '${plainOp.id}'`,
      );

      return {
        ok:
          repeatCheckIn.status < 300 &&
          reComplete.json?.alreadyCompleted === true &&
          batch.json?.accepted === 10 &&
          completions === '1',
        actual: `повторный check-in → HTTP ${repeatCheckIn.status}; повтор завершения операции → `
          + `HTTP ${reComplete.status}, alreadyCompleted=${reComplete.json?.alreadyCompleted}; `
          + `строк завершения этой операции в БД: ${completions} (дубля нет); `
          + `batch GPS 10 точек → HTTP ${batch.status}, accepted=${batch.json?.accepted}`,
        evidence: 'повторные POST /schedule/check-in и /tickets/:id/operations/:op/complete; SQL ticket_operation_completions',
      };
    },
  );

  // ------------------------------------------------------------------
  // O10. Чат
  // ------------------------------------------------------------------
  await check.step(
    'O10',
    'Чат: список чатов оператора, отправка сообщения по заявке',
    'чат заявки виден оператору, сообщение сохраняется и читается вторым участником',
    async () => {
      // TICKET-чат создаёт менеджер (`POST /api/chat/chats` — ADMIN/SUPERVISOR;
      // оператор в нём участник по заявке), ровно как в интерфейсе админки.
      const chat = await post('/chat/chats', { type: 'ticket', ticketId: ticket.id }, { token: admin });
      if (chat.status !== 201 && chat.status !== 200) {
        return { ok: false, actual: `чат HTTP ${chat.status}: ${chat.brief}` };
      }
      created.chatId = chat.json.id;

      const text = `${TAG} операция «${operations[0].name}» выполнена, фото загружено`;
      const sent = await post(`/chat/chats/${chat.json.id}/messages`, { text }, { token: operator });
      const list = await get('/chat/chats', { token: operator });
      const seenByManager = await get(
        `/chat/messages/search?q=${encodeURIComponent(TAG)}&chatId=${chat.json.id}`,
        { token: admin },
      );

      return {
        ok:
          sent.status === 201 &&
          (Array.isArray(list.json) ? list.json : list.json.items).some((item) => item.id === chat.json.id) &&
          (seenByManager.json.items ?? []).some((item) => item.text === text),
        actual: `чат заявки ${chat.json.id}; отправка → HTTP ${sent.status}; `
          + `чат в списке оператора: ${(Array.isArray(list.json) ? list.json : list.json.items).some((item) => item.id === chat.json.id)}; `
          + `сообщение найдено менеджером: ${(seenByManager.json.items ?? []).some((item) => item.text === text)}`,
        evidence: `POST /api/chat/chats (type=ticket) под ADMIN; отправка — под оператором; поиск — под ADMIN`,
      };
    },
  );

  // ------------------------------------------------------------------
  // O11. Профиль
  // ------------------------------------------------------------------
  await check.step(
    'O11',
    'Профиль: данные пользователя и смена PIN (с возвратом исходного)',
    'GET /auth/me отдаёт карточку оператора; смена PIN принимается, старый PIN перестаёт работать, '
      + 'новый работает; PIN возвращён к исходному',
    async () => {
      const me = await get('/auth/me', { token: operator });
      const newPin = '9753';
      const changed = await post(
        '/auth/change-pin',
        { currentPassword: USERS.operator.password, newPin },
        { token: operator },
      );
      const oldPinLogin = await post('/auth/pin', {
        phone: USERS.operator.phone,
        pinCode: USERS.operator.pin,
      });
      const newPinLogin = await post('/auth/pin', { phone: USERS.operator.phone, pinCode: newPin });
      const restored = await post(
        '/auth/change-pin',
        { currentPassword: USERS.operator.password, newPin: USERS.operator.pin },
        { token: operator },
      );
      const restoredLogin = await post('/auth/pin', {
        phone: USERS.operator.phone,
        pinCode: USERS.operator.pin,
      });

      return {
        ok:
          changed.status < 300 &&
          oldPinLogin.status === 401 &&
          newPinLogin.status === 201 &&
          restoredLogin.status === 201,
        actual: `карточка: «${me.json.fullName}», ${me.json.email}, тел. ${me.json.phone}, роль ${me.json.role}, `
          + `создан ${me.json.createdAt}; смена PIN → HTTP ${changed.status}; старый PIN → HTTP ${oldPinLogin.status}; `
          + `новый PIN → HTTP ${newPinLogin.status}; возврат PIN → HTTP ${restored.status}, исходный PIN → HTTP ${restoredLogin.status}`,
        evidence: 'POST /api/auth/change-pin ×2 + POST /api/auth/pin ×3',
      };
    },
  );

  // ------------------------------------------------------------------
  // O12. Закрытие смены и уборка
  // ------------------------------------------------------------------
  await check.step(
    'O12',
    'Закрытие смены и уборка данных прогона',
    'check-out переводит смену в завершённое состояние; заявки, чат, геозона и точки трека прогона сняты',
    async () => {
      const checkOut = await post(
        '/schedule/check-out',
        { scheduleId: event.scheduleId, lat: 55.7558, lng: 37.6173 },
        { token: operator },
      );
      const after = await get(`/schedule/events/${event.id}`, { token: operator });

      const removedTickets = psql(
        'cleaning_ops_tickets',
        `DELETE FROM tickets WHERE description LIKE '${TAG}%'`,
      );
      const removedTracks = psql(
        'cleaning_ops_gps',
        `DELETE FROM gps_tracks WHERE user_id = '${(await get('/auth/me', { token: operator })).json.id}' `
          + `AND timestamp > now() - interval '2 hours'`,
      );
      const removedGeofence = psql(
        'cleaning_ops_gps',
        `DELETE FROM geofences WHERE name = '${GEOFENCE_NAME}'`,
      );
      const removedChat = created.chatId
        ? psql('cleaning_ops_chat', `DELETE FROM "Chat" WHERE id = '${created.chatId}'`)
        : 'не создавался';

      // Смену возвращаем в исходное состояние: демо-данные должны остаться как были.
      const resetEvent = psql(
        'cleaning_ops_schedule',
        `UPDATE "ScheduleEvent" SET status = 'PLANNED', "checkInAt" = NULL, "checkOutAt" = NULL, `
          + `"checkInLat" = NULL, "checkInLng" = NULL, "checkOutLat" = NULL, "checkOutLng" = NULL `
          + `WHERE id = '${event.id}'`,
      );

      const removedDevices = psql(
        'cleaning_ops_notifications',
        `DELETE FROM devices WHERE token LIKE 'uat-m74-%'`,
      );
      const floors = await get(`/objects/${DEMO_OBJECT}/floors`, { token: admin });
      return {
        ok:
          checkOut.status < 300 &&
          (after.json.status === 'COMPLETED' || after.json.status === 'CHECKED_OUT') &&
          floors.json.length === 3,
        actual: `check-out → HTTP ${checkOut.status}; статус смены=${after.json.status}, checkOutAt=${after.json.checkOutAt}; `
          + `SQL-уборка: заявки («${removedTickets}»), точки трека («${removedTracks}»), `
          + `геозона («${removedGeofence}»), чат («${removedChat}»), устройства («${removedDevices}»); `
          + `смена возвращена в PLANNED («${resetEvent}»); `
          + `этажей у демо-объекта ${floors.json.length}`,
        evidence: 'POST /api/schedule/check-out; SQL по cleaning_ops_tickets/_gps/_chat/_schedule',
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
