// БАЗОВЫЙ (неисправленный) вариант сценария листинга заявок — для замера «до».
//
// Это точная копия test/performance/k6/tickets.js в редакции каркаса М0.8 со всеми
// четырьмя дефектами, перечисленными в задании М7.2:
//   1. BASE_URL по умолчанию :3000 (на дев-стенде не слушает никто) — здесь переопределён
//      через K6_BASE_URL, иначе прогон вообще не дошёл бы до замера;
//   2. login() вызывается ВНУТРИ итерации — bcrypt на каждый запрос + упор в лимит логина;
//   3. ожидается статус 200, а POST /api/auth/login отвечает 201 — проверка не проходит
//      никогда, и метрика checks врёт;
//   4. sleep(1) в конце итерации — один VU даёт максимум 1 запрос/с.
//
// Файл существует только как доказательство «до/после» и в приёмку не входит.
// Запуск:
//   K6_BASE_URL=http://127.0.0.1:8080 ~/.local/bin/k6 run \
//     --summary-export=test/performance/results/baseline-tickets-buggy.json \
//     test/performance/baseline/tickets-buggy.js
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
const EMAIL = __ENV.K6_EMAIL || 'admin';
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
