// Нагрузочный сценарий: листинг заявок (эталон — УСТАВ.md → Агент QA, п.3).
// Запуск: k6 run test/performance/k6/tickets.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.K6_EMAIL || 'admin@cleaning-ops.com';
const PASSWORD = __ENV.K6_PASSWORD || 'admin123';

function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
  }), { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'login status is 200': (r) => r.status === 200 });
  return res.json().accessToken;
}

export default function () {
  const token = login();

  const ticketsRes = http.get(`${BASE_URL}/api/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(ticketsRes, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
