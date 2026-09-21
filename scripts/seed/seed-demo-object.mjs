// Демо-наполнение портала: пользователь-владелец + его объект (М5.4).
//
// Запуск: node scripts/seed/seed-demo-object.mjs
//   окружение:
//     API_BASE_URL   — база стенда (по умолчанию http://100.109.185.14:8090, т.е. web-admin,
//                      который проксирует /api/* по сервисам; можно указать :8091 — тот же прокси)
//     SEED_TIMEOUT_MS — таймаут одного HTTP-запроса (по умолчанию 15000)
//
// Зачем это нужно:
//   Портал (`frontend/web-client`, `src/hooks/useObjectScope.ts`) считает объект
//   «своим» ТОЛЬКО по явной привязке: `Object.ownerClientId === id` вошедшего
//   пользователя. Никакого сопоставления по названию организации в портале нет
//   (сопоставление по имени выдавало доступ по совпадению строк и было удалено).
//   Поэтому объект создаётся/обновляется с `ownerClientId = id` владельца.
//   `clientName`/`clientContact` заполняются для отображения (заголовок каркаса,
//   карточка объекта в админке) и на доступ не влияют.
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
  // Название организации — только для отображения: доступ определяется
  // `ownerClientId`, а не совпадением имён.
  // Кавычки-ёлочки пишем как есть — так строка выглядит в UI.
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
  const wanted = email.trim().toLowerCase();
  return items.find((user) => String(user?.email ?? '').trim().toLowerCase() === wanted) ?? null;
}

/**
 * Поиск демо-объекта по названию (для идемпотентности). Привязка проверяется
 * отдельно: если объект уже есть, но `ownerClientId` не тот, скрипт его поправит.
 */
async function findObjectByName(token, name) {
  // take ≤ 100 (валидатор ListObjectsQueryDto).
  const { data } = await request('GET', `/api/objects?search=${encodeURIComponent(name)}&take=100`, { token });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.find((object) => object?.name === name) ?? null;
}

async function main() {
  console.log(`Стенд: ${API_BASE_URL}`);

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

  // --- 2) Объект владельца, привязанный к аккаунту (ownerClientId) ---------------
  let object = await findObjectByName(adminToken, OBJECT.name);
  if (object) {
    if (object.ownerClientId === owner.id) {
      console.log(`объект уже есть и привязан: «${object.name}» — id=${object.id}, ownerClientId=${owner.id}, не трогаю`);
    } else {
      // Объект есть, но привязка не та (или её нет) — приводим к документированному
      // состоянию. Именно `ownerClientId` даёт владельцу доступ в портале.
      const { data } = await request('PATCH', `/api/objects/${object.id}`, {
        token: adminToken,
        body: { ownerClientId: owner.id },
      });
      object = data;
      console.log(`объект уже есть, привязка обновлена: «${object.name}» — id=${object.id}, ownerClientId=${owner.id}`);
    }
  } else {
    const { data } = await request('POST', '/api/objects', {
      token: adminToken,
      body: { ...OBJECT, ownerClientId: owner.id },
    });
    object = data;
    console.log(
      `создан объект: «${object.name}» — id=${object.id}, ownerClientId=${object.ownerClientId}, type=${object.type}`,
    );
  }

  if (object.ownerClientId !== owner.id) {
    console.error(`ОШИБКА: у объекта ownerClientId=${object.ownerClientId}, ожидался ${owner.id}`);
    process.exit(1);
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
  if (String(me?.id) !== String(owner.id)) {
    console.error(`ОШИБКА: /api/auth/me вернул id=${me?.id}, ожидался id владельца ${owner.id}`);
    process.exit(1);
  }

  // Ровно тот запрос, которым портал определяет свой объект:
  // listObjects({ ownerClientId: sessionUser.id, take: 100 }).
  const filtered = (
    await request('GET', `/api/objects?ownerClientId=${encodeURIComponent(me.id)}&take=100`, {
      token: ownerToken,
    })
  ).data;
  const items = Array.isArray(filtered?.items) ? filtered.items : [];

  console.log(`GET /api/auth/me → role=${me?.role} fullName=«${me?.fullName}» email=${me?.email} id=${me.id}`);
  console.log(`GET /api/objects?ownerClientId=${me.id} → total=${filtered?.total} items=${items.length}`);

  // Портал открывает первый объект по возрастанию id.
  const picked = [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
  if (!picked) {
    console.error('ОШИБКА: у владельца нет объектов с его ownerClientId (портал покажет «Объект не подключён»)');
    process.exit(1);
  }
  console.log(`портал откроет объект: «${picked.name}» (id=${picked.id}), ownerClientId=${picked.ownerClientId}`);

  if (!items.every((item) => item.ownerClientId === me.id)) {
    console.error('ОШИБКА: фильтр ownerClientId вернул чужой объект');
    process.exit(1);
  }
  // Портал после выбора подтверждает объект запросом GET /api/objects/:id.
  const confirmed = (await request('GET', `/api/objects/${picked.id}`, { token: ownerToken })).data;
  if (String(confirmed?.ownerClientId) !== String(me.id)) {
    console.error(`ОШИБКА: GET /api/objects/${picked.id} вернул ownerClientId=${confirmed?.ownerClientId}`);
    process.exit(1);
  }
  console.log(`GET /api/objects/${picked.id} → ok (объект подтверждён для владельца)`);

  console.log(`\nГотово. Портал: ${API_BASE_URL.replace(/:\d+$/, ':8091')}/ — вход ${OWNER.email} / ${OWNER.password}`);
}

main().catch((error) => {
  console.error(`ОШИБКА: ${error.message}`);
  process.exit(1);
});
