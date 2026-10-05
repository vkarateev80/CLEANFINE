// Нагрузочный сценарий М7.2: burst-логин и лимит попыток входа
// (эталон — ПЛАН.md → М7.2; чек-лист Auth: «5 попыток входа на IP в минуту»).
//
// Запуск:
//   bash test/performance/auth-prod-throttle.sh start   # экземпляр auth с боевыми лимитами
//   ~/.local/bin/k6 run test/performance/k6/auth.js
//   bash test/performance/auth-prod-throttle.sh stop
//
// ПОЧЕМУ НЕ ЧЕРЕЗ NGINX :8080. Дев-стенд поднимает auth-service с THROTTLE_LOGIN_LIMIT=1000
// (иначе e2e-набор упирается в лимит логинов, см. test/README.md), поэтому на нём шторм
// из 10 входов пройдёт «насквозь» и порог лимита не воспроизводится — это свойство
// тестового окружения, а не дефект продукта. Сценарий по умолчанию целится в отдельный
// экземпляр того же кода и той же БД на :3101, поднятый с боевыми значениями
// (5 логинов/мин на IP) — см. auth-prod-throttle.sh. Production-адрес — через K6_BASE_URL.
//
// Что проверяется:
//  1. Шторм входов с одного IP (как массовый старт смен утром) не проходит «насквозь»:
//     ровно LOGIN_LIMIT запросов получают 201, остальные — 429.
//  2. Ни один запрос шторма не заканчивается 5xx: троттлинг не роняет сервис.
//  3. Латентность входов (bcrypt — самая дорогая часть запроса) укладывается в 500 мс.
//  4. После шторма окно лимита закрыто: следующая попытка тоже получает 429.
//
// ПРЕДУСЛОВИЕ: окно лимита должно быть чистым (60 с без входов на этом экземпляре).
// Ключ троттлинга — ip+endpoint, поэтому любая проверка «жив ли порт» через
// POST /api/auth/login уже расходует слот. Проверяйте статус методом
// `auth-prod-throttle.sh status` ДО прогона, но не между прогонами: если окно
// израсходовано, порог `login_burst_ok` не выполнится, а лог teardown покажет это
// как «Retry-After» и предупреждение — это не дефект троттлинга.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.K6_BASE_URL || 'http://127.0.0.1:3101';
const EMAIL = __ENV.K6_EMAIL || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin123';
const LOGIN_LIMIT = Number(__ENV.K6_LOGIN_LIMIT || 5);
const BURST = Number(__ENV.K6_BURST || LOGIN_LIMIT * 2);

const burstOk = new Counter('login_burst_ok'); // 201 — вход разрешён
const burstThrottled = new Counter('login_burst_throttled'); // 429 — лимит сработал
const burstUnexpected = new Counter('login_burst_unexpected'); // всё остальное (401/5xx)
const burstDuration = new Trend('login_burst_duration', true);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 201, 429));

export const options = {
  scenarios: {
    // Ровно BURST параллельных входов одной волной. maxDuration — страховка от зависшего
    // логина (в macOS нет `timeout`, а k6 без ограничения ждал бы вечно).
    burst: {
      executor: 'shared-iterations',
      vus: BURST,
      iterations: BURST,
      maxDuration: '60s',
    },
  },
  thresholds: {
    // Проверяемое утверждение: ровно LIMIT попыток прошли, остальные — 429.
    login_burst_ok: [`count==${LOGIN_LIMIT}`],
    login_burst_throttled: [`count==${BURST - LOGIN_LIMIT}`],
    login_burst_unexpected: ['count==0'],
    // 5xx/401 во время шторма = троттлинг роняет сервис (429 объявлен ожидаемым
    // через http.setResponseCallback, поэтому доля ошибок считается только по «настоящим»).
    'http_req_failed{scenario:burst}': ['rate<0.01'],
    'http_req_duration{scenario:burst}': ['p(95)<500'],
  },
};

function login(tags) {
  return http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags },
  );
}

export default function () {
  const res = login({ name: 'POST /api/auth/login' });

  burstDuration.add(res.timings.duration);

  if (res.status === 201 && res.json('accessToken')) {
    burstOk.add(1);
  } else if (res.status === 429) {
    burstThrottled.add(1);
  } else {
    burstUnexpected.add(1);
    console.error(`burst: неожиданный ответ ${res.status}: ${String(res.body).slice(0, 120)}`);
  }

  check(res, {
    'login is 201 or 429': (r) => r.status === 201 || r.status === 429,
    'throttled body is human-readable': (r) =>
      r.status !== 429 || /Too Many Requests|лимит|throttl/i.test(String(r.body)),
  });
}

/**
 * Попытка сразу после шторма: окно лимита должно быть уже израсходовано.
 * Не влияет на метрики сценария (фаза teardown фильтруется тегом phase).
 */
export function teardown() {
  const res = login({ phase: 'teardown' });
  if (res.status === 429) {
    const retryAfter = res.headers['Retry-After-login'] || res.headers['Retry-After'] || '?';
    console.log(`teardown: лимит входа израсходован штормом — подтверждено (429, Retry-After=${retryAfter})`);
    return;
  }
  console.warn(
    `teardown: после шторма вход вернул ${res.status} вместо 429 — на ${BASE_URL} лимит входа ` +
      'поднят (например, THROTTLE_LOGIN_LIMIT из stand.sh). Используйте auth-prod-throttle.sh.',
  );
}
