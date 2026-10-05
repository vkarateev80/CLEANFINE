/**
 * М7.4 (UAT): каркас приёмочных прогонов по ролям.
 *
 * Задача каркаса — не «проверить, что код работает» (это делают e2e-наборы и
 * `flutter test`), а **зафиксировать фактическое наблюдение** по каждому пункту
 * чек-листа роли: что запускалось, что вернул стенд, что увидел проверяющий.
 * Поэтому каждый шаг пишет ожидание, факт и ссылку на подтверждение (команда +
 * фрагмент ответа), а результат складывается в `test/uat/results/<роль>.json`
 * и в текстовый протокол рядом.
 *
 * Роли и сценарии — по ПЛАН.md, веха М7.4. Адреса — единая точка входа стенда
 * (nginx :8080/:8081); прямые порты сервисов используются только там, где нужен
 * обход прокси (чат — WebSocket).
 *
 * Запуск: `node test/uat/uat-<роль>.mjs` из каталога `test/`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API = process.env.UAT_API ?? 'http://127.0.0.1:8080/api';
export const ADMIN_URL = process.env.UAT_ADMIN_URL ?? 'http://127.0.0.1:8080';
export const PORTAL_URL = process.env.UAT_PORTAL_URL ?? 'http://127.0.0.1:8081';
export const CHAT_URL = process.env.UAT_CHAT_URL ?? 'http://127.0.0.1:3009/api/chat';

const here = dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = join(here, 'results');

/** Один вызов стенда с полным сохранением запроса/ответа для протокола. */
export async function call(method, path, { token, body, headers = {}, base = API } = {}) {
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const init = { method, headers: { ...headers } };
  // Токен может быть функцией-провайдером: access-токен стенда живёт 15 минут,
  // а UAT-прогон роли идёт дольше — провайдер сам обновит его.
  const bearer = typeof token === 'function' ? await token() : token;
  if (bearer) init.headers.Authorization = `Bearer ${bearer}`;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const started = Date.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    json,
    text,
    ms: Date.now() - started,
    // Короткая подпись ответа — то, что попадает в чек-лист как доказательство.
    brief: text.length > 400 ? `${text.slice(0, 400)}…` : text,
  };
}

export const get = (path, opts) => call('GET', path, opts);
export const post = (path, body, opts) => call('POST', path, { ...opts, body });
export const patch = (path, body, opts) => call('PATCH', path, { ...opts, body });
export const del = (path, opts) => call('DELETE', path, opts);

/** Вход по email/паролю. */
export async function login(email, password) {
  const response = await post('/auth/login', { email, password });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Вход ${email} не удался: HTTP ${response.status} ${response.brief}`);
  }
  return response.json.accessToken;
}

/** Вход по PIN (телефон + PIN) — путь мобильного приложения. */
export async function loginPin(phone, pinCode) {
  const response = await post('/auth/pin', { phone, pinCode });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`PIN-вход ${phone} не удался: HTTP ${response.status} ${response.brief}`);
  }
  return response.json.accessToken;
}

export const USERS = {
  admin: { email: 'admin', password: 'admin123', fullName: 'Администратор' },
  supervisor: { email: 'supervisor@cleaning-ops.com', password: 'super123', fullName: 'Бригадир' },
  operator: { email: 'operator', password: 'oper123', phone: '+79990000003', pin: '3456' },
  client: { email: 'client', password: 'client123' },
};

/**
 * Провайдер access-токена роли с автопродлением.
 *
 * Access-токен стенда живёт 15 минут (`JWT_ACCESS_TTL`), а приёмочный прогон роли
 * с интерфейсной частью идёт дольше. Провайдер обновляет токен заранее, чтобы
 * «не пройдено» никогда не означало «истёк токен».
 */
export function tokenProvider(email, password, { ttlMs = 10 * 60 * 1000 } = {}) {
  let token = null;
  let issuedAt = 0;
  return async () => {
    if (!token || Date.now() - issuedAt > ttlMs) {
      token = await login(email, password);
      issuedAt = Date.now();
    }
    return token;
  };
}

/**
 * Чек-лист роли.
 *
 * Шаги берутся из ПЛАН.md (М7.4) и спецификаций экранов; `expected` формулируется
 * ДО прогона, `actual` — только по факту наблюдения.
 */
export class Checklist {
  constructor(role, scenario) {
    this.role = role;
    this.scenario = scenario;
    this.steps = [];
    this.defects = [];
    this.startedAt = new Date().toISOString();
  }

  /**
   * Выполнить шаг.
   *
   * @param {string} id          номер пункта чек-листа
   * @param {string} title       что делаем
   * @param {string} expected    ожидаемый результат
   * @param {() => Promise<{actual: string, ok: boolean, evidence?: string}>} body
   */
  async step(id, title, expected, body) {
    const started = Date.now();
    let result;
    try {
      result = await body();
    } catch (error) {
      result = { ok: false, actual: `исключение: ${error.message}`, evidence: error.stack?.split('\n')[1]?.trim() };
    }
    const step = {
      id,
      title,
      expected,
      actual: result.actual,
      ok: result.ok === true,
      evidence: result.evidence ?? '',
      ms: Date.now() - started,
    };
    this.steps.push(step);
    const mark = step.ok ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО';
    console.log(`[${id}] ${mark} — ${title}\n      ожидание: ${expected}\n      факт:      ${step.actual}`);
    if (step.evidence) console.log(`      подтверждение: ${step.evidence}`);
    return step;
  }

  /** Зарегистрировать дефект, найденный во время прогона. */
  defect({ id, severity, title, steps, expected, actual, status, note }) {
    this.defects.push({ id, severity, title, steps, expected, actual, status, note });
  }

  summary() {
    const passed = this.steps.filter((s) => s.ok).length;
    const failed = this.steps.length - passed;
    return {
      role: this.role,
      scenario: this.scenario,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      total: this.steps.length,
      passed,
      failed,
      defects: this.defects,
      steps: this.steps,
    };
  }

  /** Напечатать протокол и сохранить его в `test/uat/results/`. */
  finish() {
    const summary = this.summary();
    mkdirSync(RESULTS_DIR, { recursive: true });
    const file = join(RESULTS_DIR, `${this.role}.json`);
    writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    const lines = [
      `# UAT: ${this.role} — ${this.scenario}`,
      '',
      `Прогон: ${summary.startedAt} → ${summary.finishedAt}`,
      `Пунктов: ${summary.total}, пройдено: ${summary.passed}, не пройдено: ${summary.failed}`,
      '',
      '| № | Шаг | Ожидание | Факт | Итог |',
      '|---|---|---|---|---|',
      ...summary.steps.map(
        (s) =>
          `| ${s.id} | ${s.title} | ${s.expected} | ${s.actual} | ${s.ok ? 'пройдено' : 'НЕ пройдено'} |`,
      ),
      '',
    ];
    if (summary.defects.length) {
      lines.push('## Дефекты', '');
      for (const d of summary.defects) {
        lines.push(`### ${d.id} — ${d.title} (${d.severity})`, '', `- Шаги: ${d.steps}`,
          `- Ожидание: ${d.expected}`, `- Факт: ${d.actual}`, `- Статус: ${d.status}`, '');
        if (d.note) lines.push(`- Обоснование: ${d.note}`, '');
      }
    }
    const md = join(RESULTS_DIR, `${this.role}.md`);
    writeFileSync(md, `${lines.join('\n')}\n`, 'utf8');

    console.log(`\n=== ИТОГ ${this.role}: ${summary.passed}/${summary.total} пройдено, ${summary.failed} не пройдено ===`);
    console.log(`Протокол: ${md}`);
    return summary;
  }
}

/**
 * Снять за собой остатки предыдущих прогонов UAT.
 *
 * Зачем: у заявок, чатов, геозон, устройств и точек трека нет DELETE-эндпоинтов
 * (или он ограничен ролью), а упавший до уборки прогон оставляет строки, из-за
 * которых следующий прогон получает ЛОЖНОЕ «не пройдено» (например, «смен на
 * дату до прохода было 1»). Уборка идёт строго по префиксу прогона и не трогает
 * демонстрационные данные.
 */
export function cleanupUatSql(prefix = 'UAT-M74') {
  const psql = (database, sql) =>
    execFileSync(
      'docker',
      ['exec', 'cleaning-ops-postgres', 'psql', '-U', 'admin', '-d', database, '-t', '-A', '-c', sql],
      { encoding: 'utf8' },
    ).trim();

  const done = [];
  try {
    // Сначала id заявок прогона: по ним снимаются их чаты (межбазовая связь —
    // только по значению, поэтому два шага, а не JOIN).
    const ticketIds = psql(
      'cleaning_ops_tickets',
      `SELECT id FROM tickets WHERE description LIKE '%${prefix}%'`,
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (ticketIds.length) {
      const list = ticketIds.map((id) => `'${id}'`).join(',');
      done.push(`чаты: ${psql('cleaning_ops_chat', `DELETE FROM "Chat" WHERE "ticketId" IN (${list})`)}`);
    } else {
      done.push('чаты: нечего снимать');
    }
    done.push(`заявки: ${psql('cleaning_ops_tickets', `DELETE FROM tickets WHERE description LIKE '%${prefix}%'`)}`);
    done.push(`геозоны: ${psql('cleaning_ops_gps', `DELETE FROM geofences WHERE name LIKE '${prefix}%'`)}`);
    done.push(`устройства: ${psql('cleaning_ops_notifications', `DELETE FROM devices WHERE token LIKE 'uat-m74-%'`)}`);
  } catch (error) {
    done.push(`ошибка: ${String(error.message).split('\n')[0].slice(0, 80)}`);
  }
  return done.join('; ');
}

/** Небольшая пауза — события между сервисами идут через RabbitMQ асинхронно. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Опрос до выполнения условия (асинхронные события: RabbitMQ, автосписание). */
export async function waitFor(fn, { timeoutMs = 20000, stepMs = 500, what = 'условие' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(stepMs);
  }
  throw new Error(`не дождались: ${what} (${timeoutMs} мс)`);
}
