// Разовый backfill: привязка существующих объектов к аккаунтам заказчиков
// (`ownerClientId`) по единственному точному совпадению нормализованного
// `Object.clientName` с `fullName` ИЛИ `email` активного CLIENT-аккаунта.
//
// Это ИНСТРУМЕНТ МИГРАЦИИ ДАННЫХ, а не рантайм-логика доступа: портал считает
// объект «своим» только по `ownerClientId === id` сессии, и сопоставление по
// имени в него не возвращается (см. frontend/web-client/src/hooks/useObjectScope.ts).
// Скрипт запускает администратор вручную, один раз, и он ничего не импортирует
// в сервисы.
//
// Запуск:
//   node scripts/seed/backfill-owner-client.mjs            # dry-run: только показать план
//   node scripts/seed/backfill-owner-client.mjs --commit   # применить изменения
//
// Окружение:
//   API_BASE_URL    — база стенда (по умолчанию http://100.109.185.14:8090)
//   SEED_TIMEOUT_MS — таймаут одного HTTP-запроса (по умолчанию 15000)
//
// Правила (сознательно консервативные):
//   * трогаем ТОЛЬКО объекты с `ownerClientId === null` — уже привязанные не
//     перезаписываем ни при каких совпадениях;
//   * рассматриваем только активные CLIENT-аккаунты;
//   * нужен ровно ОДИН кандидат; при двух и более — объект не меняем и печатаем
//     его для ручного решения;
//   * `clientName`/`clientContact` не меняем никогда — только `ownerClientId`;
//   * идемпотентность: повторный прогон трогает только оставшиеся `null`.
//
// ВАЖНО: никаких прямых INSERT/Prisma — только API стенда (PATCH /api/objects/:id),
// поэтому запись проходит штатную валидацию DTO.

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://100.109.185.14:8090').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.SEED_TIMEOUT_MS ?? 15000);

// Seed-администратор: чтение /api/users и запись объектов — ADMIN/SUPERVISOR.
const ADMIN_EMAIL = 'admin';
const ADMIN_PASSWORD = 'admin123';

/** Лимит API на страницу списка (`take <= 100`). */
const PAGE_SIZE = 100;

const DRY_RUN = !process.argv.includes('--commit');

/** Нормализация имени: регистр, кавычки-ёлочки и апострофы, повторные пробелы. */
function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function request(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const reason = error?.name === 'AbortError' ? `таймаут ${TIMEOUT_MS} мс` : error.message;
    throw new Error(`${method} ${path} — запрос не выполнен: ${reason}`);
  }
  clearTimeout(timer);

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' ? JSON.stringify(data) : String(data ?? '');
    throw new Error(`${method} ${path} — HTTP ${response.status} ${detail.slice(0, 300)}`);
  }
  return data;
}

async function login(email, password) {
  const data = await request('POST', '/api/auth/login', { body: { email, password } });
  if (!data?.accessToken) {
    throw new Error('POST /api/auth/login — в ответе нет accessToken');
  }
  return data.accessToken;
}

/** Все страницы списка: `list(path)` возвращает массив элементов. */
async function listAll(token, path) {
  const items = [];
  let skip = 0;
  for (;;) {
    const separator = path.includes('?') ? '&' : '?';
    const page = await request('GET', `${path}${separator}skip=${skip}&take=${PAGE_SIZE}`, {
      token,
    });
    const batch = Array.isArray(page?.items) ? page.items : [];
    items.push(...batch);
    const total = typeof page?.total === 'number' ? page.total : items.length;
    skip += batch.length;
    if (batch.length === 0 || skip >= total) {
      return items;
    }
  }
}

async function main() {
  console.log(`Стенд: ${API_BASE_URL}`);
  console.log(
    `Режим: ${DRY_RUN ? 'DRY-RUN (изменения не применяются, добавьте --commit)' : 'ПРИМЕНЕНИЕ ИЗМЕНЕНИЙ (--commit)'}`,
  );
  console.log('');

  const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const clients = (await listAll(token, '/api/users?role=CLIENT')).filter(
    (user) => user?.isActive === true,
  );
  console.log(`Активных CLIENT-аккаунтов: ${clients.length}`);

  const objects = await listAll(token, '/api/objects');
  const unbound = objects.filter((object) => (object?.ownerClientId ?? null) === null);
  console.log(
    `Объектов всего: ${objects.length}; без привязки (ownerClientId=null): ${unbound.length}`,
  );
  console.log('');

  const applied = [];
  const ambiguous = [];
  const unmatched = [];
  const skipped = [];
  const failed = [];

  for (const object of unbound) {
    const client = normalizeName(object?.clientName ?? '');
    if (client === '') {
      skipped.push({ object, reason: 'пустой clientName — сопоставлять нечего' });
      continue;
    }

    // Кандидаты: точное совпадение нормализованного clientName с fullName ИЛИ email.
    const matches = clients.filter((user) => {
      const fullName = normalizeName(user?.fullName ?? '');
      const email = normalizeName(user?.email ?? '');
      return (fullName !== '' && fullName === client) || (email !== '' && email === client);
    });
    // Дедупликация по id: аккаунт мог совпасть и по ФИО, и по email.
    const unique = [...new Map(matches.map((user) => [user.id, user])).values()];

    if (unique.length === 0) {
      unmatched.push({ object });
      continue;
    }
    if (unique.length > 1) {
      ambiguous.push({ object, candidates: unique });
      continue;
    }

    const owner = unique[0];
    if (DRY_RUN) {
      applied.push({ object, owner, written: false });
      continue;
    }
    try {
      await request('PATCH', `/api/objects/${object.id}`, {
        token,
        body: { ownerClientId: owner.id },
      });
      applied.push({ object, owner, written: true });
    } catch (error) {
      failed.push({ object, owner, message: error.message });
    }
  }

  // --- Отчёт -------------------------------------------------------------------
  const verb = DRY_RUN ? 'БУДЕТ ПРИВЯЗАНО' : 'ПРИВЯЗАНО';
  console.log(`=== ${verb}: ${applied.length} ===`);
  for (const { object, owner } of applied) {
    console.log(
      `  «${object.name}» (id=${object.id})  clientName=«${object.clientName}»  →  ${owner.fullName} <${owner.email}> (id=${owner.id})`,
    );
  }

  console.log('');
  console.log(`=== НЕОДНОЗНАЧНО, решить вручную: ${ambiguous.length} ===`);
  for (const { object, candidates } of ambiguous) {
    console.log(`  «${object.name}» (id=${object.id})  clientName=«${object.clientName}»`);
    for (const candidate of candidates) {
      console.log(
        `      кандидат: ${candidate.fullName} <${candidate.email}> (id=${candidate.id})`,
      );
    }
  }

  console.log('');
  console.log(`=== СОВПАДЕНИЙ НЕТ, остаются без привязки: ${unmatched.length} ===`);
  for (const { object } of unmatched) {
    console.log(`  «${object.name}» (id=${object.id})  clientName=«${object.clientName}»`);
  }

  if (skipped.length > 0) {
    console.log('');
    console.log(`=== ПРОПУЩЕНО: ${skipped.length} ===`);
    for (const { object, reason } of skipped) {
      console.log(`  «${object.name}» (id=${object.id}): ${reason}`);
    }
  }

  if (failed.length > 0) {
    console.log('');
    console.log(`=== ОШИБКИ ЗАПИСИ: ${failed.length} ===`);
    for (const { object, owner, message } of failed) {
      console.log(`  «${object.name}» (id=${object.id}) → ${owner.id}: ${message}`);
    }
  }

  console.log('');
  console.log(
    `Итог: ${DRY_RUN ? 'к привязке' : 'привязано'} ${applied.length}, неоднозначных ${ambiguous.length}, без совпадений ${unmatched.length}, пропущено ${skipped.length}, ошибок ${failed.length}.`,
  );
  if (DRY_RUN && applied.length > 0) {
    console.log(
      'Изменения НЕ применены. Повторите с --commit, чтобы привязать перечисленные объекты.',
    );
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`ОШИБКА: ${error.message}`);
  process.exit(1);
});
