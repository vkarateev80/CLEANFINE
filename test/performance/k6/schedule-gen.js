// Нагрузочный сценарий М7.2: пик генерации смен в 00:00 (ПЛАН.md → М7.2).
//
// Запуск: ~/.local/bin/k6 run test/performance/k6/schedule-gen.js
//
// Что за пик. В 00:00 UTC периодический проход schedule-service генерирует смены на
// наступившую дату ПО ВСЕМ активным графикам: на каждый график/исполнителя — запись
// ScheduleEvent, на каждую смену — REST-вызов ticket-service за плановой заявкой
// (последовательно, график за графиком). Поэтому сценарий измеряет две разные вещи:
//   individual — 100 параллельных триггеров генерации, по одному на график. Это верхняя
//                граница «сколько запросов в минуту пика придёт», если генерацию дёргают
//                по каждому графику отдельно;
//   sweep      — ОДИН проход по всем 100 графикам подряд, как это делает cron (без
//                scheduleId). Главное число вехи: сколько занимает сам проход в 00:00.
//
// Две фазы разведены во времени намеренно. Между ними нужно удалить смены, созданные
// фазой individual, иначе sweep увидит их и отработает «всё пропущено» — время будет
// измерено на пути идемпотентности, а не на пути генерации. Команда удаления печатается
// в консоль по завершении individual (см. `--pause` в test/performance/README.md);
// пауза задаётся K6_SWEEP_GAP (по умолчанию 60s).
//
// Данные и уборка. В setup создаются SCHEDULES временных графиков (имя «М7.2 k6 <runId> #NNN»),
// в teardown печатается команда их удаления. objectId у графиков НЕ задаётся, поэтому
// сценарий сам заявок не создаёт; демонстрационные графики и 21 заявка «БЦ «Ромашка»»
// не изменяются. Проход без scheduleId идёт и по демо-графикам — он идемпотентен
// (на дату генерации у них либо уже есть смены, либо создаются такие же штатные).
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.K6_BASE_URL || 'http://127.0.0.1:8080';
// Логин всегда идёт в auth-service (3001). Отдельная переменная нужна при прямом вызове
// целевого сервиса по host-loopback (BASE_URL = http://127.0.0.1:3004 и т. п.):
// обоснование — раздел «Ретранслятор nginx → хост» в docs/PERFORMANCE_REPORT.md.
const AUTH_BASE_URL = __ENV.K6_AUTH_BASE_URL || (BASE_URL.includes(':8080') ? BASE_URL : 'http://127.0.0.1:3001');
const EMAIL = __ENV.K6_EMAIL || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin123';
const OPERATOR_EMAIL = __ENV.K6_OPERATOR_EMAIL || 'operator';
const OPERATOR_PASSWORD = __ENV.K6_OPERATOR_PASSWORD || 'oper123';
const SCHEDULES = Number(__ENV.K6_SCHED_COUNT || 100);
// Параллелизм фазы individual. По умолчанию 20, а не SCHEDULES: ручной триггер — не штатный
// путь (штатный — один cron-проход, фаза sweep). Смоук-прогон при 100 одновременных
// триггерах упёрся в пул соединений сервиса: 6 % запросов легли в 5-секундный таймаут.
const CONCURRENCY = Number(__ENV.K6_SCHED_CONCURRENCY || 20);
const SHIFT_TIME = __ENV.K6_SCHED_SHIFT_TIME || '08:00';
// Пауза между фазами: за неё удаляются смены individual (см. шапку файла).
const SWEEP_GAP = __ENV.K6_SCHED_SWEEP_GAP || '60s';
// Рукопожатие между фазами — через данные стенда, а не по времени.
// Почему не по времени: k6 буферизует console.log до конца прогона (проверено: строки
// setup/individual/teardown в логе имеют одну метку — конец прогона), поэтому внешний
// watcher не может узнать по логу момент окончания фазы individual.
// Почему не через файл: в k6 `fs.open()` доступен только в init-контексте, а `stat()`
// доступен в VU-контексте только на чтение. Поэтому схема такая:
//   setup   → печатает id графиков (их читает watcher из лога с --log-format=raw)
//   watcher → удаляет смены этих графиков;
//   sweep   → ждёт, пока API покажет 0 смен на дату генерации у тестовых графиков,
//             и только потом запускает проход. Таймаут ожидания — аргумент.
const SWEEP_WAIT_MS = Number(__ENV.K6_SCHED_SWEEP_WAIT_MS || 180000);

const shiftsCreated = new Counter('schedule_shifts_created');
const shiftsSkipped = new Counter('schedule_shifts_skipped');
const generationOk = new Counter('schedule_generation_ok');
const sweepDuration = new Trend('schedule_sweep_duration', true);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 201));

function tomorrowUtc() {
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/**
 * JWT payload → объект. В k6-рантайме нет Node/Buffer и нет atob, поэтому используется
 * встроенный модуль encoding: base64url без паддинга — это 'rawurl'.
 */
function decodeJwtPayload(token) {
  const payload = token.split('.')[1];
  return JSON.parse(encoding.b64decode(payload, 'rawurl', 's'));
}

export const options = {
  scenarios: {
    individual: {
      executor: 'shared-iterations',
      vus: CONCURRENCY,
      iterations: SCHEDULES,
      maxDuration: '90s',
      gracefulStop: '10s',
      exec: 'generateOne',
    },
    sweep: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      startTime: SWEEP_GAP,
      maxDuration: '90s',
      exec: 'generateSweep',
    },
  },
  thresholds: {
    // Каждый график дал ровно одну смену, ни одного пропуска и ни одной ошибки.
    schedule_shifts_created: [`count==${SCHEDULES}`],
    schedule_shifts_skipped: ['count==0'],
    schedule_generation_ok: [`count==${SCHEDULES}`],
    'http_req_failed{scenario:individual}': ['rate<0.01'],
    /*
     * Латентность. Порог p95<500 мс план М7.2 задаёт ТОЛЬКО для листинга заявок
     * (tickets.js); для schedule-gen требование плана — «пик генерации в 00:00»,
     * то есть время ОДНОГО прохода, и оно проверяется порогом schedule_sweep_duration
     * ниже. Поэтому здесь порога на латентность нет осознанно.
     *
     * Замеренная правда про фазу individual (20 одновременных ручных триггеров):
     * p95 ≈ 0,6 с при пуле 8 и ≈ 1,2 с при пуле 16 соединений; ошибок 0 %. Упирается
     * не в пул и не в код, а в эмулированный Postgres (образ x86_64 на aarch64-ВМ,
     * 2 vCPU): больше одновременных запросов — выше хвост. Штатный путь генерации
     * последовательный (cron-проход), поэтому параллельные ручные триггеры — стресс,
     * а не целевой режим. Число зафиксировано в docs/PERFORMANCE_REPORT.md.
     */
    'iterations{scenario:individual}': [`count>=${SCHEDULES}`],
    // Проход в 00:00 по 100 графикам должен укладываться в бюджет минуты пика.
    schedule_sweep_duration: ['p(95)<5000'],
    // Время самого прохода (один запрос) — прямое измерение, не только Trend.
    'http_req_duration{scenario:sweep}': ['p(95)<5000'],
  },
};

export function setup() {
  const login = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } },
  );
  if (login.status !== 201) {
    throw new Error(`setup: логин администратора вернул ${login.status}`);
  }
  const token = login.json('accessToken');

  const operator = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } },
  );
  if (operator.status !== 201) {
    throw new Error(`setup: логин ${OPERATOR_EMAIL} вернул ${operator.status}`);
  }
  const operatorId = decodeJwtPayload(operator.json('accessToken')).sub;

  const date = __ENV.K6_SCHED_DATE || tomorrowUtc();
  // Без внешних библиотек (k6-utils тянется по сети) — свой короткий идентификатор прогона.
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const scheduleIds = [];

  for (let i = 0; i < SCHEDULES; i += 1) {
    const res = http.post(
      `${BASE_URL}/api/schedule`,
      JSON.stringify({
        name: `М7.2 k6 ${runId} #${String(i).padStart(3, '0')}`,
        recurrence: { frequency: 'daily', time: SHIFT_TIME },
        assignees: [operatorId],
        isActive: true,
      }),
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        tags: { phase: 'setup', name: 'POST /api/schedule' },
      },
    );
    if (res.status !== 201) {
      throw new Error(`setup: создание графика #${i} вернуло ${res.status}: ${String(res.body).slice(0, 160)}`);
    }
    scheduleIds.push(res.json('id'));
  }

  console.log(`setup: создано графиков ${scheduleIds.length}, дата генерации ${date}, runId ${runId}`);
  return { token, date, runId, scheduleIds };
}

/** Один триггер генерации по конкретному графику (scope: scheduleId). */
export function generateOne(data) {
  // Номер итерации в сценарии уникален на весь прогон (в отличие от __ITER, который
  // в shared-iterations равен 0 у каждого VU) — так каждый VU берёт свой график.
  const scheduleId = data.scheduleIds[exec.scenario.iterationInTest % data.scheduleIds.length];
  const res = http.post(
    `${BASE_URL}/api/schedule/generate?date=${data.date}&scheduleId=${scheduleId}`,
    null,
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { name: 'POST /api/schedule/generate (one)' },
    },
  );

  let body = null;
  if (res.status === 201) {
    try {
      body = res.json();
    } catch {
      body = null;
    }
  }
  if (body) {
    shiftsCreated.add(Number(body.shiftsCreated || 0));
    shiftsSkipped.add(Number(body.shiftsSkipped || 0));
    if (Number(body.shiftsCreated) === 1 && Number(body.ticketsFailed) === 0) {
      generationOk.add(1);
    } else {
      console.error(`generate one: неожиданная сводка ${JSON.stringify(body)}`);
    }
  }

  check(res, {
    'generate status is 201': (r) => r.status === 201,
    'one shift created': () => body !== null && Number(body.shiftsCreated) === 1,
    'no ticket failures': () => body !== null && Number(body.ticketsFailed) === 0,
    'duration < 500ms': (r) => r.timings.duration < 500,
  }, { check: 'gen-one-ok' });
}

/**
 * Ждёт, пока смены фазы individual исчезнут из БД (их удаляет watcher между фазами).
 * Считаем именно смены ТЕСТОВЫХ графиков: GET /api/schedule/events?date= возвращает смены
 * демо-графиков тоже, поэтому фильтруем по списку scheduleId из setup.
 */
function waitForEventsDrop(data) {
  const deadline = Date.now() + SWEEP_WAIT_MS;
  let last = -1;
  while (Date.now() < deadline) {
    const res = http.get(`${BASE_URL}/api/schedule/events?date=${data.date}`, {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { phase: 'handoff', name: 'GET /api/schedule/events' },
    });
    if (res.status === 200) {
      let mine = -1;
      try {
        const events = res.json();
        mine = events.filter((e) => data.scheduleIds.includes(e.scheduleId)).length;
      } catch {
        mine = -1;
      }
      if (mine === 0) {
        return true;
      }
      if (mine !== last) {
        console.log(`ожидание уборки смен individual: осталось ${mine}`);
        last = mine;
      }
    }
    sleep(1);
  }
  return false;
}

/** Полный проход без scheduleId — то, что делает cron в 00:00. */
export function generateSweep(data) {
  const dropped = waitForEventsDrop(data);
  check(dropped, { 'смены individual удалены до прохода': (v) => v === true });
  if (!dropped) {
    throw new Error(
      `смены фазы individual не удалены за ${SWEEP_WAIT_MS} мс — проход измерил бы путь ` +
        'идемпотентности (все пропуски), а не генерацию. Уборка: ' +
        'test/performance/cleanup-stand.sh events --ids <из лога setup>',
    );
  }

  const res = http.post(
    `${BASE_URL}/api/schedule/generate?date=${data.date}`,
    null,
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { name: 'POST /api/schedule/generate (sweep)' },
    },
  );

  sweepDuration.add(res.timings.duration);

  let body = null;
  if (res.status === 201) {
    try {
      body = res.json();
    } catch {
      body = null;
    }
  }

  if (body) {
    console.log(
      `sweep: графиков ${body.schedulesMatched}, смен создано ${body.shiftsCreated}, ` +
        `пропущено ${body.shiftsSkipped}, заявок ${body.ticketsCreated}, ` +
        `ошибок ${body.ticketsFailed}, ${res.timings.duration.toFixed(0)} мс`,
    );
  }

  check(res, {
    'sweep status is 201': (r) => r.status === 201,
    'sweep has no errors': () => body !== null && body.errors.length === 0,
    'sweep created shifts': () => body !== null && Number(body.shiftsCreated) > 0,
    'sweep duration < 5000ms': (r) => r.timings.duration < 5000,
  }, { check: 'gen-sweep-ok' });
}

/** Печатает id временных графиков — аргументы для cleanup-stand.sh. */
export function teardown(data) {
  console.log(`CLEANUP schedules ${data.scheduleIds.join(',')}`);
  console.log(
    `Пауза sweep: bash test/performance/cleanup-stand.sh events --ids ${data.scheduleIds.join(',')}`,
  );
  console.log(
    `Уборка: bash test/performance/cleanup-stand.sh schedules ` +
      `--ids ${data.scheduleIds.join(',')} --run-tag 'М7.2 k6 ${data.runId}'`,
  );
}
