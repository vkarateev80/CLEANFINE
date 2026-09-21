// Нагрузочный сценарий М7.2: приём GPS-треков — чек-лист GPS «batch-приём координат
// работает (1000 точек/с)» (УСТАВ.md → Агент Backend GPS; ПЛАН.md → М7.2).
//
// Запуск: ~/.local/bin/k6 run test/performance/k6/gps-track.js
//
// Профиль нагрузки. 1000 точек/с — это пропускная способность по ТОЧКАМ, а не по HTTP:
// мобильный клиент буферизует треки оффлайна и отдаёт их batch-ом (POST /api/gps/track,
// ArrayMaxSize = MAX_TRACK_BATCH = 1000). Поэтому сценарий держит 5 запросов/с
// по 250 точек = 1250 точек/с: цель 1000 точек/с выполняется с запасом 25 %,
// а не «в ноль», иначе порог срабатывал бы на округлениях вниз.
//
// Данные: точки пишутся на оператора из seed (K6_TRACK_EMAIL). До и после прогона треки
// этого оператора чистятся скриптом `test/performance/cleanup-stand.sh`; демонстрационная
// среда («БЦ «Ромашка»», 21 заявка) не затрагивается — удаляются строки только этого
// пользователя и только внутри окна прогона.
import http from 'k6/http';
import { check } from 'k6';
import encoding from 'k6/encoding';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.K6_BASE_URL || 'http://127.0.0.1:8080';
// Логин всегда идёт в auth-service (3001). Отдельная переменная нужна при прямом вызове
// целевого сервиса по host-loopback (BASE_URL = http://127.0.0.1:3004 и т. п.):
// обоснование — раздел «Ретранслятор nginx → хост» в docs/PERFORMANCE_REPORT.md.
const AUTH_BASE_URL = __ENV.K6_AUTH_BASE_URL || (BASE_URL.includes(':8080') ? BASE_URL : 'http://127.0.0.1:3001');
const EMAIL = __ENV.K6_EMAIL || 'admin@cleaning-ops.com';
const PASSWORD = __ENV.K6_PASSWORD || 'admin123';
// Сотрудник, за которого пишутся треки: передавать userId вправе только ADMIN/SUPERVISOR,
// поэтому пишет администратор, а userId берётся из токена самого сотрудника.
const TRACK_EMAIL = __ENV.K6_TRACK_EMAIL || 'operator@cleaning-ops.com';
const TRACK_PASSWORD = __ENV.K6_TRACK_PASSWORD || 'oper123';
const BATCH_SIZE = Number(__ENV.K6_GPS_BATCH || 250);
const RATE = Number(__ENV.K6_GPS_RATE || 5); // запросов/с
// ВАЖНО: имя переменной с префиксом K6_GPS_, а не K6_DURATION. k6 зарезервировал
// `K6_<OPTION>` под свои опции: `-e K6_DURATION=5s` целиком ЗАМЕНЯЕТ options.scenarios
// (предупреждение «"env" level configuration overrode scenarios configuration entirely»),
// и сценарий молча перестаёт быть arrival-rate. Так же ведут себя K6_VUS/K6_ITERATIONS.
const DURATION = __ENV.K6_GPS_DURATION || '30s';
const TARGET_POINTS_PER_SECOND = Number(__ENV.K6_GPS_TARGET_PPS || 1000);

// Базовая точка — центр демо-объекта «БЦ «Ромашка»» (Москва), джиттер до ~90 м.
const BASE_LAT = Number(__ENV.K6_GPS_LAT || 55.7558);
const BASE_LNG = Number(__ENV.K6_GPS_LNG || 37.6173);

const pointsAccepted = new Counter('gps_points_accepted');
const pointsSent = new Counter('gps_points_sent');

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 201));

export const options = {
  scenarios: {
    track: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 60,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    // 1000 точек/с — чек-лист GPS. Считаем ПРИНЯТЫЕ сервером точки (accepted из ответа),
    // а не отправленные: иначе сценарий проходил бы на 400-х ответах.
    gps_points_accepted: [`rate>=${TARGET_POINTS_PER_SECOND}`],
    'http_req_failed{scenario:track}': ['rate<0.01'],
    'http_req_duration{scenario:track}': ['p(95)<500'],
    'http_req_duration{name:POST /api/gps/track}': ['p(95)<500'],
  },
};

/**
 * JWT payload → объект. В k6-рантайме нет Node/Buffer и нет atob, поэтому используется
 * встроенный модуль encoding: base64url без паддинга — это 'rawurl'.
 */
function decodeJwtPayload(token) {
  const payload = token.split('.')[1];
  return JSON.parse(encoding.b64decode(payload, 'rawurl', 's'));
}

function pointAt(index) {
  // Джиттер детерминированный по индексу: прогоны воспроизводимы.
  const angle = (index % 360) * (Math.PI / 180);
  const radius = (index % 17) * 0.00005; // до ~0.0008° ≈ 90 м
  return {
    lat: Number((BASE_LAT + radius * Math.sin(angle)).toFixed(6)),
    lng: Number((BASE_LNG + radius * Math.cos(angle)).toFixed(6)),
    accuracy: 5,
    speed: 1.4,
    battery: 80 - (index % 30),
  };
}

function buildTracks(startIndex) {
  const tracks = [];
  const baseTime = Date.now() - BATCH_SIZE * 1000;
  for (let i = 0; i < BATCH_SIZE; i += 1) {
    tracks.push({
      ...pointAt(startIndex + i),
      timestamp: new Date(baseTime + i * 1000).toISOString(),
    });
  }
  return tracks;
}

export function setup() {
  const login = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } },
  );
  if (login.status !== 201) {
    throw new Error(`setup: логин администратора вернул ${login.status}`);
  }

  const employee = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TRACK_EMAIL, password: TRACK_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } },
  );
  if (employee.status !== 201) {
    throw new Error(`setup: логин сотрудника ${TRACK_EMAIL} вернул ${employee.status}`);
  }

  const employeeId = decodeJwtPayload(employee.json('accessToken')).sub;
  if (!employeeId) {
    throw new Error('setup: в токене сотрудника нет sub');
  }

  return {
    token: login.json('accessToken'),
    employeeId,
    employeeName: TRACK_EMAIL,
    startedAt: Date.now(),
  };
}

let iteration = 0;

export default function (data) {
  const tracks = buildTracks(iteration * BATCH_SIZE);
  iteration += 1;
  pointsSent.add(tracks.length);

  const res = http.post(
    `${BASE_URL}/api/gps/track`,
    JSON.stringify({
      userId: data.employeeId,
      employeeName: data.employeeName,
      tracks,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.token}`,
      },
      tags: { name: 'POST /api/gps/track' },
    },
  );

  let accepted = 0;
  if (res.status === 201) {
    try {
      accepted = Number(res.json('accepted') || 0);
    } catch {
      accepted = 0;
    }
    pointsAccepted.add(accepted);
  }

  check(res, {
    'track status is 201': (r) => r.status === 201,
    'all batch points accepted': () => accepted === tracks.length,
    'duration < 500ms': (r) => r.timings.duration < 500,
  }, { check: 'track-ok' });
}

/** Печатает окно и пользователя — аргументы для cleanup-stand.sh. */
export function teardown(data) {
  const finishedAt = Date.now();
  const from = new Date(data.startedAt - 60_000).toISOString();
  const to = new Date(finishedAt + 60_000).toISOString();
  console.log(`CLEANUP gps_tracks user_id=${data.employeeId} ts_from=${from} ts_to=${to}`);
  console.log(
    `Уборка: bash test/performance/cleanup-stand.sh gps --user ${data.employeeId} --since ${from} --until ${to}`,
  );
}
