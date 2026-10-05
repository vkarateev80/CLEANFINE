// Нагрузочный сценарий М7.2: листинг заявок (эталон — УСТАВ.md → Агент QA, п.3;
// цель — ПЛАН.md → М7.2: 50→100 rps, p95 < 500 мс, ошибок < 1 %).
//
// Запуск (стенд: nginx :8080, он же единая точка входа для всех девяти сервисов):
//   ~/.local/bin/k6 run test/performance/k6/tickets.js
//   K6_BASE_URL=http://prod-host ~/.local/bin/k6 run test/performance/k6/tickets.js
//
// Отличия от каркаса М0.8 (дефекты исправлены, см. docs/PERFORMANCE_REPORT.md):
//  1. Порт по умолчанию — 8080 (nginx), а не 3000: на дев-стенде 3000 не слушает никто.
//  2. Логин один раз в setup(); токен приходит в default() через data. В каркасе логин
//     стоял внутри итерации: bcrypt на каждый запрос плюс упор в лимит входа (5/мин на IP).
//  3. /api/auth/login отвечает 201, а каркас ждал 200 — проверка не проходила никогда.
//  4. `sleep(1)` в конце итерации убран: с ним один VU даёт максимум 1 запрос/с, и цель
//     «100 rps» недостижима ни при каком числе VU. Вместо VU-ступеней используется
//     arrival-rate — сценарий держит ровно 50→100 rps и падает, если не держит.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.K6_BASE_URL || 'http://127.0.0.1:8080';
// Логин всегда идёт в auth-service (3001, он же под /api/auth через nginx). Отдельная
// переменная нужна, когда целевой сервис вызывается напрямую по host-loopback:
// тогда BASE_URL = http://127.0.0.1:3005, а логин всё равно в :3001. Почему вообще
// возможен прямой вызов — см. раздел «Ретранслятор nginx → хост» в
// docs/PERFORMANCE_REPORT.md: под нагрузкой он насыщается, и это ограничение СТЕНДА,
// а не сервиса.
const AUTH_BASE_URL = __ENV.K6_AUTH_BASE_URL || (BASE_URL.includes(':8080') ? BASE_URL : 'http://127.0.0.1:3001');
const EMAIL = __ENV.K6_EMAIL || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin123';
const LIST_TAKE = Number(__ENV.K6_LIST_TAKE || 50);

// 201 у логина — контракт auth-service (ApiResponse в auth.controller.ts), не ошибка.
http.setResponseCallback(
  http.expectedStatuses({ min: 200, max: 299 }, 201),
);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    /*
     * Ступени из устава (30s→50, 1m→100, 30s→0) переведены в arrival-rate: план требует
     * 50→100 ЗАПРОСОВ В СЕКУНДУ, а не 50→100 виртуальных пользователей.
     *
     * ВАЖНО про порог по rps. Средняя скорость этого профиля по построению равна
     * (50*30 + 75*60 + 50*30) / 120 = 62,5 rps: 100 rps держится только в конце второй
     * ступени. Поэтому «сценарий действительно выдержал цель» проверяется здесь не
     * средним rps (он всегда ~62), а `dropped_iterations == 0` — k6 считает там каждую
     * итерацию, которую arrival-rate не смог запустить из-за нехватки VU.
     * Явная проверка «>= 100 rps» стоит на втором сценарии — plateau.
     */
    list: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      preAllocatedVUs: 100,
      maxVUs: 600,
      gracefulStop: '10s',
    },
    // Полка ровно 100 rps: единственная форма, в которой «100 rps» — проверяемое
    // утверждение, а не середина разгона. Стартует после разгона, на той же полке 100 rps.
    plateau: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '60s',
      startTime: '2m10s',
      preAllocatedVUs: 100,
      maxVUs: 400,
      gracefulStop: '10s',
      exec: 'listTickets',
    },
  },
  thresholds: {
    // Пороги плана М7.2 — с фильтром по сценарию, чтобы setup/teardown-запросы
    // (логин, фаза phase=setup/teardown) не разбавляли статистику эндпоинта.
    'http_req_duration{scenario:list}': ['p(95)<500'],
    'http_req_failed{scenario:list}': ['rate<0.01'],
    // Сценарий выдержал запрошенный arrival-rate (ни одной отложенной итерации).
    dropped_iterations: ['count==0'],
    // Полка 100 rps: и пороги плана, и сама достигнутая скорость.
    'http_req_duration{scenario:plateau}': ['p(95)<500'],
    'http_req_failed{scenario:plateau}': ['rate<0.01'],
    /*
     * «Полка держит 100 rps». Через `http_reqs{scenario:plateau} rate` это выразить
     * нельзя: k6 считает rate как count / ВРЕМЯ ВСЕГО ПРОГОНА (190 с), а не окна
     * сценария, поэтому 6000 запросов полки дают 31,6 rps и порог врёт.
     * Число итераций за фиксированные 60 с — корректная форма: 5700 = 95 rps.
     */
    'iterations{scenario:plateau}': ['count>=5700'],
    // Отдельно — тот же p95 по имени запроса: так в отчёте видно фильтр эндпоинта.
    'http_req_duration{name:GET /api/tickets}': ['p(95)<500'],
  },
};

export function setup() {
  const res = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'setup' } },
  );
  if (res.status !== 201) {
    throw new Error(`setup: логин вернул ${res.status}: ${String(res.body).slice(0, 200)}`);
  }
  const token = res.json().accessToken;
  if (!token) {
    throw new Error('setup: в ответе логина нет accessToken');
  }
  return { token, startedAt: new Date().toISOString() };
}

export default function (data) {
  listTickets(data);
}

/** Один запрос листинга. Отдельная функция — её же вызывает сценарий-полка. */
export function listTickets(data) {
  const res = http.get(`${BASE_URL}/api/tickets?take=${LIST_TAKE}`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { name: 'GET /api/tickets' },
  });

  check(res, {
    'list status is 200': (r) => r.status === 200,
    'list duration < 500ms': (r) => r.timings.duration < 500,
    'list body has items': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = r.json();
        return Array.isArray(body.items) && typeof body.total === 'number';
      } catch {
        return false;
      }
    },
  }, { check: 'list-ok' });
}

/**
 * Пост-проверка: лимит входа не «протёк». Полезной нагрузки не несёт, поэтому
 * вынесена из метрик основного сценария (фаза setup/teardown в http_req_duration
 * не попадает — фильтруем тегом phase).
 */
export function teardown() {
  const res = http.post(
    `${AUTH_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { phase: 'teardown' } },
  );
  if (res.status === 429) {
    console.warn('teardown: логин throttled (429) — окно лимита уже израсходовано');
  } else {
    console.log(`teardown: логин ${res.status}`);
  }
}
