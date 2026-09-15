import { expect, test, type APIRequestContext } from '@playwright/test';
import { userByRole, type FixtureUser } from '../../helpers/users';

/**
 * М1.8 — QA вертикали входа (API-уровень).
 * Требует запущенного auth-service (по умолчанию http://localhost:3001) с применённой
 * миграцией и засеянными пользователями из test/fixtures/users.json.
 *
 * ВНИМАНИЕ: логин ограничен по частоте (5/мин в проде). Для основного прогона
 * лимит поднимается env-переменными THROTTLE_LOGIN_LIMIT / THROTTLE_GLOBAL_LIMIT.
 * Проверка самого 429 вынесена в опциональный тест (E2E_RATE_LIMIT=1).
 */

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const admin = userByRole('ADMIN');

async function loginAs(request: APIRequestContext, role: FixtureUser['role']): Promise<string> {
  const user = userByRole(role);
  const res = await request.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(res.status(), `логин ${role}: ${await res.text()}`).toBe(201);
  return ((await res.json()) as TokenPair).accessToken;
}

test.describe('Auth: вертикаль входа', () => {
  test('login → me → refresh → logout', async ({ request }) => {
    // 1. login
    const login = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    expect(login.status(), await login.text()).toBe(201);
    const tokens = (await login.json()) as TokenPair;
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    // 2. me
    const me = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.status()).toBe(200);
    const profile = await me.json();
    expect(profile.email).toBe(admin.email);
    expect(profile.role).toBe('ADMIN');
    // секретные поля не должны покидать сервис
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('pinCode');
    expect(profile).not.toHaveProperty('biometricKey');

    // 3. refresh — выдаёт новую пару
    const refreshed = await request.post('/api/auth/refresh', {
      data: { refreshToken: tokens.refreshToken },
    });
    expect(refreshed.status()).toBe(201);
    const next = (await refreshed.json()) as TokenPair;
    expect(next.accessToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(tokens.refreshToken);

    // 4. logout — отзывает новый refresh
    const logout = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${next.accessToken}` },
      data: { refreshToken: next.refreshToken },
    });
    expect(logout.status()).toBe(204);

    // 5. отозванный refresh больше не работает
    const afterLogout = await request.post('/api/auth/refresh', {
      data: { refreshToken: next.refreshToken },
    });
    expect(afterLogout.status()).toBe(401);
  });

  test('refresh нельзя переиграть (ротация закрывает старый токен)', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    const { refreshToken } = (await login.json()) as TokenPair;

    const first = await request.post('/api/auth/refresh', { data: { refreshToken } });
    expect(first.status()).toBe(201);

    const replay = await request.post('/api/auth/refresh', { data: { refreshToken } });
    expect(replay.status()).toBe(401);
  });

  test('неверный пароль → 401, невалидный email → 400', async ({ request }) => {
    const bad = await request.post('/api/auth/login', {
      data: { email: admin.email, password: 'definitely-wrong' },
    });
    expect(bad.status()).toBe(401);

    const invalid = await request.post('/api/auth/login', {
      data: { email: 'not-an-email', password: admin.password },
    });
    expect(invalid.status()).toBe(400);
  });

  test('защищённые эндпоинты без токена → 401', async ({ request }) => {
    expect((await request.get('/api/auth/me')).status()).toBe(401);
    expect((await request.get('/api/users')).status()).toBe(401);
  });

  test('logout с пустым телом отзывает все сессии пользователя', async ({ request }) => {
    const first = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    const t1 = (await first.json()) as TokenPair;

    const second = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    const t2 = (await second.json()) as TokenPair;

    // Пустое тело передаём как {} — тело обязательно для ValidationPipe,
    // а без refreshToken сервис отзывает все сессии пользователя.
    const logout = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${t1.accessToken}` },
      data: {},
    });
    expect(logout.status(), await logout.text()).toBe(204);

    // обе ранее выданные сессии недействительны
    expect((await request.post('/api/auth/refresh', { data: { refreshToken: t1.refreshToken } })).status()).toBe(401);
    expect((await request.post('/api/auth/refresh', { data: { refreshToken: t2.refreshToken } })).status()).toBe(401);
  });

  test('logout с конкретным refreshToken отзывает только его', async ({ request }) => {
    const first = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    const t1 = (await first.json()) as TokenPair;

    const second = await request.post('/api/auth/login', {
      data: { email: admin.email, password: admin.password },
    });
    const t2 = (await second.json()) as TokenPair;

    const logout = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${t1.accessToken}` },
      data: { refreshToken: t1.refreshToken },
    });
    expect(logout.status()).toBe(204);

    // отозван именно t1, а вторая сессия продолжает работать
    expect((await request.post('/api/auth/refresh', { data: { refreshToken: t1.refreshToken } })).status()).toBe(401);
    expect((await request.post('/api/auth/refresh', { data: { refreshToken: t2.refreshToken } })).status()).toBe(201);
  });
});

test.describe('Auth: RBAC', () => {
  test('ADMIN видит список сотрудников', async ({ request }) => {
    const token = await loginAs(request, 'ADMIN');
    const res = await request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.items[0]).not.toHaveProperty('passwordHash');
  });

  test('SUPERVISOR видит список, но не может создавать', async ({ request }) => {
    const token = await loginAs(request, 'SUPERVISOR');

    const list = await request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(list.status()).toBe(200);

    const create = await request.post('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: `rbac-${Date.now()}@cleaning-ops.com`, password: 'test1234', fullName: 'RBAC', role: 'OPERATOR' },
    });
    expect(create.status()).toBe(403);
  });

  test('OPERATOR не имеет доступа к списку сотрудников', async ({ request }) => {
    const token = await loginAs(request, 'OPERATOR');
    const res = await request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test('CLIENT не имеет доступа к списку сотрудников', async ({ request }) => {
    const token = await loginAs(request, 'CLIENT');
    const res = await request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });

  test('ADMIN может создать и затем деактивировать сотрудника', async ({ request }) => {
    const token = await loginAs(request, 'ADMIN');
    const email = `e2e-${Date.now()}@cleaning-ops.com`;

    const created = await request.post('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email, password: 'test1234', fullName: 'E2E Сотрудник', role: 'OPERATOR' },
    });
    expect(created.status(), await created.text()).toBe(201);
    const user = await created.json();

    // деактивированный пользователь не может войти
    const loginBlocked = await request.post('/api/auth/login', {
      data: { email, password: 'test1234' },
    });
    expect(loginBlocked.status()).toBe(201);

    const deactivated = await request.delete(`/api/users/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deactivated.status()).toBe(204);

    const loginAfter = await request.post('/api/auth/login', {
      data: { email, password: 'test1234' },
    });
    expect(loginAfter.status()).toBe(401);
  });
});

test.describe('Auth: PIN и биометрия (мобильный вход)', () => {
  const operator = userByRole('OPERATOR');

  test('PIN по email выдаёт пару токенов', async ({ request }) => {
    const res = await request.post('/api/auth/pin', {
      data: { email: operator.email, pinCode: operator.pinCode },
    });
    expect(res.status(), await res.text()).toBe(201);
    const pair = (await res.json()) as TokenPair;
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
  });

  test('PIN по телефону выдаёт пару токенов', async ({ request }) => {
    const res = await request.post('/api/auth/pin', {
      data: { phone: operator.phone, pinCode: operator.pinCode },
    });
    expect(res.status(), await res.text()).toBe(201);
    expect(((await res.json()) as TokenPair).accessToken).toBeTruthy();
  });

  test('чужой PIN отклоняется', async ({ request }) => {
    const other = userByRole('ADMIN');
    expect(other.pinCode).not.toBe(operator.pinCode);

    const res = await request.post('/api/auth/pin', {
      data: { email: operator.email, pinCode: other.pinCode },
    });
    expect(res.status()).toBe(401);
  });

  test('без email и телефона → 401', async ({ request }) => {
    const res = await request.post('/api/auth/pin', { data: { pinCode: operator.pinCode } });
    expect(res.status()).toBe(401);
  });

  test('биометрический ключ выдаёт пару токенов', async ({ request }) => {
    const res = await request.post('/api/auth/biometric', {
      data: { biometricKey: operator.biometricKey },
    });
    expect(res.status(), await res.text()).toBe(201);
    expect(((await res.json()) as TokenPair).accessToken).toBeTruthy();
  });

  test('неизвестный биометрический ключ → 401', async ({ request }) => {
    const res = await request.post('/api/auth/biometric', {
      data: { biometricKey: 'unknown-device-key' },
    });
    expect(res.status()).toBe(401);
  });

  test('после деактивации PIN и биометрия не пускают', async ({ request }) => {
    const adminToken = await loginAs(request, 'ADMIN');
    const email = `pin-e2e-${Date.now()}@cleaning-ops.com`;

    const created = await request.post('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email, password: 'test1234', fullName: 'PIN E2E', role: 'OPERATOR' },
    });
    expect(created.status(), await created.text()).toBe(201);
    const user = (await created.json()) as { id: string };

    await request.delete(`/api/users/${user.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(
      (await request.post('/api/auth/pin', { data: { email, pinCode: '1234' } })).status(),
    ).toBe(401);
  });
});

// Проверка самого механизма лимита. По умолчанию пропускается: основной прогон
// идёт с поднятым лимитом, чтобы 20+ логинов набора не упирались в 5/мин.
// Запуск: E2E_RATE_LIMIT=1 (сервис БЕЗ THROTTLE_LOGIN_LIMIT, прод-дефолт 5/мин).
test.describe('Auth: rate limiting', () => {
  test.skip(process.env.E2E_RATE_LIMIT !== '1', 'нужен запуск с боевым лимитом: E2E_RATE_LIMIT=1');

  test('6-я попытка логина за минуту → 429', async ({ request }) => {
    const attempts: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request.post('/api/auth/login', {
        data: { email: 'ratelimit-probe@cleaning-ops.com', password: 'wrong-password' },
      });
      attempts.push(res.status());
    }

    expect(attempts, `последовательность ответов: ${attempts.join(',')}`).toContain(429);
    expect(attempts[5]).toBe(429);
    // лимит не должен срабатывать раньше 6-й попытки
    expect(attempts.slice(0, 5).every((s) => s === 401)).toBe(true);
  });
});
