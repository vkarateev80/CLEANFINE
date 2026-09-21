// Демо-наполнение портала: пользователь-владелец + его объект (М5.4).
//
// Запуск: node scripts/seed/seed-demo-object.mjs
//   окружение:
//     API_BASE_URL   — база стенда (по умолчанию http://100.109.185.14:8090, т.е. web-admin,
//                      который проксирует /api/* по сервисам; можно указать :8091 — тот же прокси)
//     SEED_TIMEOUT_MS — таймаут одного HTTP-запроса (по умолчанию 15000)
//
// Зачем это нужно:
//   Портал (`frontend/web-client`, `src/hooks/useObjectScope.ts`) НЕ имеет привязки
//   «пользователь → объект» в БД: у `User` нет `objectId`, а `GET /api/objects` не
//   фильтрует по роли. «Свой объект» выводится сопоставлением `Object.clientName`
//   с идентификаторами сессии (`fullName` и `email` из `GET /api/auth/me`):
//     1) точное совпадение нормализованных строк, иначе
//     2) вхождение одной строки в другую, при нескольких кандидатах — первый по `id`.
//   Нормализация (`normalizeName`): нижний регистр, кавычки « » " ' → пробел,
//   схлопывание повторных пробелов, обрезка краёв.
//   Поэтому `fullName` пользователя и `clientName` объекта должны совпадать
//   ПОСЛЕ нормализации — здесь это ровно `ООО «Ромашка»` в обоих местах.
//
// ВАЖНО: скрипт работает только через API стенда (никаких прямых INSERT/Prisma),
// чтобы данные проходили валидацию DTO и создавались штатными ручками:
//   * пользователь — POST /api/users (роль ADMIN у seed-администратора);
//   * объект       — POST /api/objects.
// Идемпотентность: сначала поиск существующего, создание — только если не нашли.
// Повторный прогон не создаёт дублей.

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://100.109.185.14:8090').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.SEED_TIMEOUT_MS ?? 15000);

// Креды seed-администратора: он создаёт пользователя (POST /api/users — только ADMIN).
const ADMIN_EMAIL = 'admin@cleaning-ops.com';
const ADMIN_PASSWORD = 'admin123';

// Владелец объекта: роль CLIENT (иначе портал не пустит), пароль демо-уровня.
const OWNER = {
  email: 'owner@cleanfine.ru',
  password: 'owner123',
  // Пишем кавычки-ёлочки ЯВНО и ровно так: портал нормализует их, но строка
  // должна совпасть с clientName объекта после нормализации.
  fullName: 'ООО «Ромашка»',
  role: 'CLIENT',
};

// Объект владельца. `type` в core-service — свободная строка (валидатор только
// @IsString()+@IsNotEmpty(), см. backend/core-service/src/objects/dto/object.dto.ts),
// а админка предлагает подсказки COMMON_OBJECT_TYPES (frontend/web-admin/src/pages/Objects/utils.ts);
// берём значение из этого справочника.
const OBJECT = {
  name: 'БЦ «Ромашка»',
  address: 'г. Москва, ул. Ленинградская, 15',
  lat: 55.7851,          // Москва, район Аэропорт (правдоподобные координаты)
  lng: 37.5582,
  type: 'Бизнес-центр',  // из COMMON_OBJECT_TYPES (подсказки админской формы)
  totalArea: 12500.5,
  floorsCount: 9,
  clientName: 'ООО «Ромашка»',   // ключ привязки портала — ровно как fullName владельца
  clientContact: OWNER.email,    // тот же email владельца
};

// PIN владельца для мобильного входа (у остальных демо-пользователей 1234–4567).
// Отдельная ручка POST /api/auth/change-pin: в RegisterDto поля PIN нет, PIN
// задаётся только самим пользователем под своим токеном.
const OWNER_PIN = '5678';

/** Нормализация имени — точная копия normalizeName() из портала. */
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
  return { status: response.status, data };
}

async function login(email, password) {
  // Логин отвечает 201 Created (не 200) — это ожидаемое поведение auth-service.
  const { status, data } = await request('POST', '/api/auth/login', {
    body: { email, password },
  });
  if (!data?.accessToken) {
    throw new Error(`POST /api/auth/login — HTTP ${status}, но в ответе нет accessToken`);
  }
  return data.accessToken;
}

/** Поиск пользователя по email: GET /api/users?search=<email>. */
async function findUser(token, email) {
  const { data } = await request('GET', `/api/users?search=${encodeURIComponent(email)}&take=100`, { token });
  const items = Array.isArray(data?.items) ? data.items : [];
  const wanted = normalizeName(email);
  return items.find((user) => normalizeName(user?.email ?? '') === wanted) ?? null;
}

/** Поиск объекта владельца: полный список + сопоставление по нормализованному clientName. */
async function findObject(token, clientName) {
  // take ≤ 100 (валидатор ListObjectsQueryDto).
  const { data } = await request('GET', '/api/objects?take=100', { token });
  const items = Array.isArray(data?.items) ? data.items : [];
  const wanted = normalizeName(clientName);
  return items.find((object) => normalizeName(object?.clientName ?? '') === wanted) ?? null;
}

/** Тот же подбор «своего объекта», что делает портал: кандидаты по полному имени и email. */
function portalPick(objects, user) {
  const identities = [user.fullName, user.email]
    .map(normalizeName)
    .filter((value) => value !== '');
  const matches = objects
    .map((object) => ({ object, client: normalizeName(object?.clientName ?? '') }))
    .filter(({ client }) => client !== '')
    .map(({ object, client }) => {
      if (identities.includes(client)) return { object, reason: `точное совпадение «${object.clientName}»` };
      const partial = identities.find((id) => client.includes(id) || id.includes(client));
      return partial ? { object, reason: `частичное совпадение «${object.clientName}»` } : null;
    })
    .filter(Boolean)
    .sort((left, right) => String(left.object.id).localeCompare(String(right.object.id)));
  return matches[0] ?? null;
}

async function main() {
  console.log(`Стенд: ${API_BASE_URL}`);
  console.log(`Нормализованное имя владельца и объекта: «${normalizeName(OWNER.fullName)}»`);

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Вход администратора: ok (${ADMIN_EMAIL})`);

  // --- 1) Пользователь-владелец -------------------------------------------------
  let owner = await findUser(adminToken, OWNER.email);
  if (owner) {
    console.log(`пользователь уже есть: ${owner.email} (${owner.role}) — id=${owner.id}, не создаю`);
    const sameName = owner.fullName === OWNER.fullName;
    if (!sameName) {
      console.log(`  внимание: fullName в базе «${owner.fullName}», ожидалось «${OWNER.fullName}» — правлю`);
      await request('PATCH', `/api/users/${owner.id}`, {
        token: adminToken,
        body: { fullName: OWNER.fullName },
      });
      owner = await findUser(adminToken, OWNER.email);
    }
  } else {
    const { data } = await request('POST', '/api/users', {
      token: adminToken,
      body: {
        email: OWNER.email,
        password: OWNER.password,
        fullName: OWNER.fullName,
        role: OWNER.role,
      },
    });
    owner = data;
    console.log(`создан пользователь: ${owner.email} (${owner.role}) — id=${owner.id}, fullName=«${owner.fullName}»`);
  }

  // --- 2) Объект владельца ------------------------------------------------------
  let object = await findObject(adminToken, OBJECT.clientName);
  if (object) {
    console.log(`объект уже есть: «${object.name}» — id=${object.id}, clientName=«${object.clientName}», не создаю`);
  } else {
    const { data } = await request('POST', '/api/objects', { token: adminToken, body: OBJECT });
    object = data;
    console.log(`создан объект: «${object.name}» — id=${object.id}, clientName=«${object.clientName}», type=${object.type}`);
  }

  // --- 3) Доказательство: портал увидит объект ----------------------------------
  const ownerToken = await login(OWNER.email, OWNER.password);
  console.log(`Вход владельца: ok (${OWNER.email})`);

  // PIN владельца для мобильного входа. В RegisterDto поля PIN нет, поэтому
  // задаётся отдельной ручкой под токеном самого владельца; повторный прогон
  // просто переустанавливает тот же PIN (идемпотентно).
  await request('POST', '/api/auth/change-pin', {
    token: ownerToken,
    body: { currentPassword: OWNER.password, newPin: OWNER_PIN },
  });
  console.log(`PIN владельца: установлен (${OWNER_PIN})`);

  const me = (await request('GET', '/api/auth/me', { token: ownerToken })).data;
  // Ровно тот запрос, которым портал ищет свой объект: listObjects({ take: 100 }).
  const list = (await request('GET', '/api/objects?take=100', { token: ownerToken })).data;
  const items = Array.isArray(list?.items) ? list.items : [];
  const picked = portalPick(items, me);

  console.log(`GET /api/auth/me → role=${me?.role} fullName=«${me?.fullName}» email=${me?.email}`);
  console.log(`GET /api/objects?take=100 → total=${list?.total} items=${items.length}`);

  if (!picked) {
    console.error('ОШИБКА: портал НЕ сопоставил владельцу ни одного объекта (состояние «Объект не подключён»)');
    process.exit(1);
  }
  const matched = picked.object;
  console.log(`портал выбрал объект: «${matched.name}» (id=${matched.id}), причина: ${picked.reason}`);
  if (String(matched.id) !== String(object.id)) {
    console.error(`ОШИБКА: портал выбрал объект id=${matched.id}, а ожидался id=${object.id}`);
    process.exit(1);
  }
  // Портал после выбора подтверждает объект запросом GET /api/objects/:id.
  await request('GET', `/api/objects/${matched.id}`, { token: ownerToken });
  console.log(`GET /api/objects/${matched.id} → ok (объект подтверждён для владельца)`);

  console.log(`\nГотово. Портал: ${API_BASE_URL.replace(/:\d+$/, ':8091')}/ — вход ${OWNER.email} / ${OWNER.password}`);
}

main().catch((error) => {
  console.error(`ОШИБКА: ${error.message}`);
  process.exit(1);
});
