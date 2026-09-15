/**
 * Живая проверка schedule-service (М4.4–М4.5) на dev-стенде.
 * Запуск из backend/schedule-service: node tools/live-verify.js
 *
 * Сценарий: график → generate → смена + плановая заявка в ticket-service →
 * check-in вне зоны (403) → check-in внутри зоны (создаёт геозону при необходимости) →
 * check-out → график без check-in → check-missed → MISSED → удаление тестовых данных.
 *
 * Если пароль существующего оператора неизвестен, тест создаёт временного OPERATOR
 * через auth-service (ADMIN) и деактивирует его в конце — иначе check-in не пройдёт,
 * потому что смена принадлежит конкретному исполнителю из графика.
 */
const SCHEDULE = process.env.SCHEDULE_URL || 'http://localhost:3008';
const TICKET = process.env.TICKET_URL || 'http://localhost:3005';
const GPS = process.env.GPS_URL || 'http://localhost:3004';
const AUTH = process.env.AUTH_URL || 'http://localhost:3001';

const OBJECT_ID = 'dc7991c5-fafd-4744-a2b7-b930d180ae24';
const OBJECT_LAT = 55.75;
const OBJECT_LNG = 37.61;
const SEED_OPERATOR_ID = '9174ffd1-7c65-4c8e-8b82-5baf89fd5d88';
const TEST_EMAIL = `schedule.e2e.${Date.now()}@cleaning-ops.com`;

const log = (...args) => console.log(...args);
const section = (title) => log(`\n===== ${title} =====`);
const today = () => new Date().toISOString().slice(0, 10);

async function call(method, url, { token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

/** Кольцо геозоны ~220x220 м вокруг точки. */
function polygonAround(lat, lng) {
  const d = 0.001;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

/** Создаёт временного оператора (или логинится существующим, если пароль известен). */
async function resolveOperator(admin) {
  for (const password of ['operator123', 'admin123', 'password1']) {
    const attempt = await call('POST', `${AUTH}/api/auth/login`, {
      body: { email: 'operator@cleaning-ops.com', password },
    });
    if (attempt.payload?.accessToken) {
      log('seed-оператор залогинился, пароль из типовых');
      return { token: attempt.payload.accessToken, id: SEED_OPERATOR_ID, temporary: false };
    }
  }

  const created = await call('POST', `${AUTH}/api/users`, {
    token: admin,
    body: {
      email: TEST_EMAIL,
      password: 'scheduleE2e123',
      fullName: 'E2E Schedule Operator',
      role: 'OPERATOR',
    },
  });
  if (created.status !== 201) {
    throw new Error(`не удалось создать временного оператора: ${JSON.stringify(created.payload)}`);
  }
  const login = await call('POST', `${AUTH}/api/auth/login`, {
    body: { email: TEST_EMAIL, password: 'scheduleE2e123' },
  });
  log('временный оператор:', created.payload.id, '| логин:', login.status);
  return { token: login.payload.accessToken, id: created.payload.id, temporary: true };
}

async function main() {
  const createdSchedules = [];
  const createdTickets = [];
  const createdGeofence = { id: null };
  let adminToken = null;
  let temporaryOperatorId = null;

  try {
    section('0. Логин admin и исполнитель смены');
    const adminLogin = await call('POST', `${AUTH}/api/auth/login`, {
      body: { email: 'admin@cleaning-ops.com', password: 'admin123' },
    });
    const admin = adminLogin.payload.accessToken;
    adminToken = admin;
    log('admin token:', admin.slice(0, 16) + '…');

    const operator = await resolveOperator(admin);
    if (operator.temporary) {
      temporaryOperatorId = operator.id;
    }
    log('operatorId смены:', operator.id, operator.temporary ? '(временный)' : '(seed)');

    section('1. Геозона объекта (gps-service)');
    const list = await call('GET', `${GPS}/api/gps/geofences?objectId=${OBJECT_ID}`, { token: admin });
    if (list.payload?.count > 0) {
      log('геозона уже есть:', JSON.stringify(list.payload.geofences[0]));
    } else {
      const created = await call('POST', `${GPS}/api/gps/geofences`, {
        token: admin,
        body: {
          objectId: OBJECT_ID,
          name: 'E2E schedule-service',
          boundary: polygonAround(OBJECT_LAT, OBJECT_LNG),
          radiusMeters: 120,
        },
      });
      createdGeofence.id = created.payload?.id ?? null;
      log('геозона создана:', created.status, JSON.stringify(created.payload));
    }

    section('2. CRUD графика (М4.4)');
    const scheduleA = await call('POST', `${SCHEDULE}/api/schedule`, {
      token: admin,
      body: {
        objectId: OBJECT_ID,
        name: 'E2E проверка графика (check-in/out)',
        recurrence: { frequency: 'daily', time: '08:00' },
        assignees: [operator.id],
        isActive: true,
      },
    });
    log('POST /api/schedule →', scheduleA.status, JSON.stringify(scheduleA.payload));
    if (scheduleA.status !== 201) {
      throw new Error(`график не создан: ${JSON.stringify(scheduleA.payload)}`);
    }
    createdSchedules.push(scheduleA.payload.id);

    const patched = await call('PATCH', `${SCHEDULE}/api/schedule/${scheduleA.payload.id}`, {
      token: admin,
      body: { name: 'E2E проверка графика (check-in/out) — правка' },
    });
    log('PATCH →', patched.status, patched.payload?.name);

    section('3. Генерация смен и плановой заявки (М4.4)');
    const generated = await call('POST', `${SCHEDULE}/api/schedule/generate?date=${today()}`, {
      token: admin,
    });
    log('POST /generate →', generated.status, JSON.stringify(generated.payload));

    const events = await call('GET', `${SCHEDULE}/api/schedule/events?date=${today()}`, {
      token: admin,
    });
    const shift = (events.payload || []).find((e) => e.scheduleId === scheduleA.payload.id);
    log('смена:', JSON.stringify(shift));
    if (!shift) {
      throw new Error('смена не найдена после генерации');
    }
    if (shift.ticketId) {
      createdTickets.push(shift.ticketId);
    }

    section('4. Плановая заявка в ticket-service');
    if (shift.ticketId) {
      const ticket = await call('GET', `${TICKET}/api/tickets/${shift.ticketId}`, { token: admin });
      log(
        'GET /api/tickets/:id →',
        ticket.status,
        JSON.stringify({
          id: ticket.payload?.id,
          type: ticket.payload?.type,
          priority: ticket.payload?.priority,
          status: ticket.payload?.status,
          objectId: ticket.payload?.objectId,
          assigneeId: ticket.payload?.assigneeId,
          description: ticket.payload?.description,
        }),
      );
    } else {
      log('! ticketId не проставлен — заявка не создана');
    }

    section('5. Идемпотентность генерации: повторный generate');
    const generatedAgain = await call('POST', `${SCHEDULE}/api/schedule/generate?date=${today()}`, {
      token: admin,
    });
    log('повторный /generate →', generatedAgain.status, JSON.stringify(generatedAgain.payload));

    section('6. Check-in вне зоны → 403');
    const outside = await call('POST', `${SCHEDULE}/api/schedule/check-in`, {
      token: operator.token,
      body: { scheduleId: scheduleA.payload.id, lat: 0, lng: 0 },
    });
    log('check-in вне зоны →', outside.status, JSON.stringify(outside.payload));

    section('7. Check-in внутри зоны (М4.5)');
    const inside = await call('POST', `${SCHEDULE}/api/schedule/check-in`, {
      token: operator.token,
      body: { scheduleId: scheduleA.payload.id, lat: OBJECT_LAT, lng: OBJECT_LNG },
    });
    log('check-in внутри →', inside.status, JSON.stringify(inside.payload));

    section('8. Идемпотентность check-in');
    const again = await call('POST', `${SCHEDULE}/api/schedule/check-in`, {
      token: operator.token,
      body: { scheduleId: scheduleA.payload.id, lat: OBJECT_LAT, lng: OBJECT_LNG },
    });
    log('повторный check-in →', again.status, JSON.stringify(again.payload));

    section('9. GET /api/schedule/my');
    const mine = await call('GET', `${SCHEDULE}/api/schedule/my`, { token: operator.token });
    log('my →', mine.status, JSON.stringify(mine.payload));

    section('10. Check-out');
    const checkOut = await call('POST', `${SCHEDULE}/api/schedule/check-out`, {
      token: operator.token,
      body: { scheduleId: scheduleA.payload.id, lat: OBJECT_LAT, lng: OBJECT_LNG },
    });
    log('check-out →', checkOut.status, JSON.stringify(checkOut.payload));

    section('11. Неявка: смена без check-in → check-missed → MISSED + событие');
    const scheduleB = await call('POST', `${SCHEDULE}/api/schedule`, {
      token: admin,
      body: {
        objectId: OBJECT_ID,
        name: 'E2E проверка неявки',
        recurrence: { frequency: 'daily', time: '00:05' },
        assignees: [operator.id],
        isActive: true,
      },
    });
    createdSchedules.push(scheduleB.payload.id);
    await call('POST', `${SCHEDULE}/api/schedule/generate?date=${today()}`, { token: admin });

    const beforeMissed = await call('GET', `${SCHEDULE}/api/schedule/events?date=${today()}`, {
      token: admin,
    });
    const pending = (beforeMissed.payload || []).find((e) => e.scheduleId === scheduleB.payload.id);
    log('смена до check-missed:', JSON.stringify(pending));
    if (pending?.ticketId) {
      createdTickets.push(pending.ticketId);
    }

    const missed = await call('POST', `${SCHEDULE}/api/schedule/check-missed?date=${today()}`, {
      token: admin,
    });
    log('check-missed →', missed.status, JSON.stringify(missed.payload));

    const afterMissed = await call('GET', `${SCHEDULE}/api/schedule/events?date=${today()}`, {
      token: admin,
    });
    const missedEvent = (afterMissed.payload || []).find(
      (e) => e.scheduleId === scheduleB.payload.id,
    );
    log('смена после check-missed:', JSON.stringify(missedEvent));

    section('12. Авто check-out: check-in без закрытия смены');
    const scheduleC = await call('POST', `${SCHEDULE}/api/schedule`, {
      token: admin,
      body: {
        objectId: OBJECT_ID,
        name: 'E2E проверка авто check-out',
        recurrence: { frequency: 'daily', time: '00:05' },
        assignees: [operator.id],
        isActive: true,
      },
    });
    createdSchedules.push(scheduleC.payload.id);
    await call('POST', `${SCHEDULE}/api/schedule/generate?date=${today()}`, { token: admin });
    const checkInForAuto = await call('POST', `${SCHEDULE}/api/schedule/check-in`, {
      token: operator.token,
      body: { scheduleId: scheduleC.payload.id, lat: OBJECT_LAT, lng: OBJECT_LNG },
    });
    log('check-in для авто-закрытия →', checkInForAuto.status, checkInForAuto.payload?.status);
    const autoScan = await call('POST', `${SCHEDULE}/api/schedule/check-missed?date=${today()}`, {
      token: admin,
    });
    log('проход (авто check-out) →', autoScan.status, JSON.stringify(autoScan.payload?.autoCheckout));
    const afterAuto = await call('GET', `${SCHEDULE}/api/schedule/events?date=${today()}`, {
      token: admin,
    });
    const autoClosed = (afterAuto.payload || []).find((e) => e.scheduleId === scheduleC.payload.id);
    log('смена после авто check-out:', JSON.stringify(autoClosed));

    section('13. Состояние проходов');
    const state = await call('GET', `${SCHEDULE}/api/schedule/scheduler/state`, { token: admin });
    log('scheduler/state →', state.status, JSON.stringify(state.payload));

    section('ИТОГ');
    log(
      JSON.stringify(
        {
          scheduleCreated: scheduleA.status === 201,
          shiftCreated: Boolean(shift),
          plannedTicketCreated:
            shift?.ticketId && shift.ticketId.length > 0 ? shift.ticketId : false,
          idempotentGenerate:
            generatedAgain.payload?.shiftsCreated === 0 && generatedAgain.payload?.shiftsSkipped > 0,
          outsideGeofence403:
            outside.status === 403 && outside.payload?.message === 'Вы находитесь вне зоны объекта',
          outsideMessage: outside.payload?.message,
          insideCheckIn: inside.status === 201 && inside.payload?.status === 'CHECKED_IN',
          checkInIdempotent: again.status === 201 && again.payload?.id === inside.payload?.id,
          myEvents: (mine.payload || []).length,
          checkedOut: checkOut.payload?.status === 'CHECKED_OUT',
          missedDetected: missedEvent?.status === 'MISSED',
          missedEvents: missed.payload?.missed?.eventIds,
          autoCheckoutClosed: autoClosed?.status === 'CHECKED_OUT' && Boolean(autoClosed?.checkOutReason),
          autoCheckoutReason: autoClosed?.checkOutReason ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    section('Очистка тестовых данных');
    for (const id of createdSchedules) {
      const removed = await call('DELETE', `${SCHEDULE}/api/schedule/${id}`, { token: adminToken });
      log('DELETE /api/schedule/' + id, '→', removed.status);
    }
    for (const id of createdTickets) {
      const rejected = await call('PATCH', `${TICKET}/api/tickets/${id}/status`, {
        token: adminToken,
        body: { status: 'rejected' },
      });
      log('ticket', id, '→ rejected:', rejected.status);
    }
    if (temporaryOperatorId) {
      const off = await call('DELETE', `${AUTH}/api/users/${temporaryOperatorId}`, {
        token: adminToken,
      });
      log('временный оператор деактивирован:', temporaryOperatorId, '→', off.status);
    }
    if (createdGeofence.id) {
      log('геозона, созданная тестом:', createdGeofence.id, '— удалить SQL (не API-зона schedule-service)');
    }
  }
}

main().catch((error) => {
  console.error('LIVE VERIFY FAILED:', error);
  process.exitCode = 1;
});
