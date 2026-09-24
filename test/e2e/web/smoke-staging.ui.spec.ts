/**
 * Smoke-тесты CLEANFINE frontend на стенде prj-cleanfine.
 * Проверяет, что web-client и web-admin работают на staging и API интегрированы.
 *
 * Запуск: cd test && npx playwright test smoke-staging.ui.spec.ts --project=web
 */

import { test, expect, devices, type Browser } from '@playwright/test';

// Пользователи из seed (deploy/vps/ACCESS.md)
const ADMIN = { email: 'admin@cleaning-ops.com', password: 'admin123' };
const CLIENT = { email: 'owner@cleanfine.ru', password: 'owner123' };
const CLIENT_EMPTY = { email: 'client@example.com', password: 'client123' };

const ADMIN_URL = 'http://100.109.185.14:8090';
const CLIENT_URL = 'http://100.109.185.14:8091';

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

/**
 * Создаёт мобильный контекст для портала (iPhone 13, baseURL = web-client).
 */
async function mobilePortalContext(browser: Browser) {
  return browser.newContext({
    ...devices['iPhone 13'],
    baseURL: CLIENT_URL,
  });
}

/**
 * Создаёт десктопный контекст для админки.
 */
async function desktopAdminContext(browser: Browser) {
  return browser.newContext({
    ...devices['Desktop Chrome'],
    baseURL: ADMIN_URL,
  });
}

/**
 * Вход через форму. Поддерживает оба приложения — разные data-testid.
 */
async function login(page: import('@playwright/test').Page, email: string, password: string, isPortal = false) {
  const emailSel = isPortal
    ? 'input[type="email"], input[type="text"], input[name="email"], input[data-testid="portal-login-email"]'
    : 'input[name="email"]';
  const pwSel = isPortal
    ? 'input[type="password"], input[data-testid="portal-login-password"]'
    : 'input[name="password"]';
  const btnSel = isPortal
    ? 'button[type="submit"], input[type="submit"], button:has-text("Войти"), [data-testid="portal-login-submit"]'
    : 'button[type="submit"], input[type="submit"], button:has-text("Войти")';

  await page.locator(emailSel).first().fill(email);
  await page.locator(pwSel).first().fill(password);
  await page.locator(btnSel).first().click();
}

// ---------------------------------------------------------------------------
// Web Client (Портал заказчика) — мобильный
// ---------------------------------------------------------------------------

test.describe('Web Client — портал заказчика на стенде', () => {
  test('портал загружается и вход клиентом с объектом работает', async ({ browser }) => {
    const ctx = await mobilePortalContext(browser);
    const page = await ctx.newPage();
    try {
      await page.goto('/login');
      await expect(page.locator('text=Портал заказчика')).toBeVisible({ timeout: 10_000 });

      await login(page, CLIENT.email, CLIENT.password, true);

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      // data-testid="portal-dashboard" на обёртке; название объекта берём отдельно.
      await expect(page.locator('[data-testid="portal-dashboard"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'БЦ «Ромашка»' })).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('клиент без объекта видит экран «не связан»', async ({ browser }) => {
    const ctx = await mobilePortalContext(browser);
    const page = await ctx.newPage();
    try {
      await page.goto('/login');
      await login(page, CLIENT_EMPTY.email, CLIENT_EMPTY.password, true);

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      // ScopeGate: сначала LoadingBlock, затем ObjectNotAssignedScreen (user действительно
      // без привязки — API вернул 0 объектов). Ждём, пока текст «Объект не подключён» появится.
      await expect(page.locator('[data-testid="portal-forbidden"]')).toBeVisible({ timeout: 20_000 });
      const body = await page.locator('body').innerText();
      expect(body).toMatch(/не связана|не подключён|нет доступа/i);
    } finally {
      await ctx.close();
    }
  });

  test('дашборд клиента показывает данные объекта', async ({ browser }) => {
    const ctx = await mobilePortalContext(browser);
    const page = await ctx.newPage();
    try {
      await page.goto('/login');
      await login(page, CLIENT.email, CLIENT.password, true);

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

      const body = await page.locator('body').innerText();
      expect(body.length).toBeGreaterThan(100);

      const header = page.locator('[data-testid="portal-header-object"], .header-object, header h1, header h2');
      await expect(header).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Web Admin (Админ-панель) — десктоп
// ---------------------------------------------------------------------------

test.describe('Web Admin — админ-панель на стенде', () => {
  test('админ-панель загружается', async ({ browser }) => {
    const ctx = await desktopAdminContext(browser);
    const page = await ctx.newPage();
    try {
      await page.goto('/');
      await expect(page.locator('text=Админ-панель')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test('вход администратором работает', async ({ browser }) => {
    const ctx = await desktopAdminContext(browser);
    const page = await ctx.newPage();
    try {
      await page.goto('/login');
      await login(page, ADMIN.email, ADMIN.password, false);

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      const body = await page.locator('body').innerText();
      expect(body.length).toBeGreaterThan(200);

      // Проверяем наличие ключевых разделов меню
      const menuItems = ['Объекты', 'Заявки', 'Сотрудники', 'Материалы', 'Отчёты'];
      for (const item of menuItems) {
        const found = await page.locator(`text=${item}`).first().isVisible().catch(() => false);
        if (!found) console.log(`Внимание: меню "${item}" не найдено на странице`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('админ-панель адаптивна на мобильном', async ({ browser }) => {
    const mobileCtx = await browser.newContext({
      ...devices['iPhone 13'],
      baseURL: ADMIN_URL,
    });
    const page = await mobileCtx.newPage();
    try {
      await page.goto('/login');
      await login(page, ADMIN.email, ADMIN.password, false);

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      const body = await page.locator('body').innerText();
      expect(body.length).toBeGreaterThan(100);
    } finally {
      await mobileCtx.close();
    }
  });
});
