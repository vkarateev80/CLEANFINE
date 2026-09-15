import { expect, test } from '@playwright/test';
import { userByRole } from '../../helpers/users';

/**
 * М1.8 — Playwright smoke web-admin (браузер).
 * Требует запущенного web-admin (vite dev, http://localhost:5173) и auth-service (:3001):
 * vite-прокси отправляет /api на :3001.
 */

const admin = userByRole('ADMIN');

test.describe('web-admin: вход', () => {
  test('страница логина рендерится с полями и брендом', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('🧹 Cleaning Ops')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Вход в систему' })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
  });

  test('пустая форма показывает подсказку и не уходит в запрос', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByText('Введите email и пароль')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('неверный пароль показывает сообщение об ошибке', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(admin.email);
    await page.locator('input[name="password"]').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();

    // Блок с ошибкой имеет класс text-danger-600; ждём, что появится любой текст ошибки
    const error = page.locator('.text-danger-600');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).not.toBeEmpty();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('успешный вход ведёт на /dashboard с данными пользователя', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(admin.email);
    await page.locator('input[name="password"]').fill(admin.password);
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await expect(page.getByText(admin.email)).toBeVisible();
    // бейдж роли в карточке профиля (span, а не текст в сайдбаре)
    await expect(page.locator('span', { hasText: /^ADMIN$/ })).toBeVisible();
  });

  test('после входа защищённый маршрут доступен, токен сохранён', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(admin.email);
    await page.locator('input[name="password"]').fill(admin.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem('cleaning-ops-auth'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string) as { state?: { accessToken?: string } };
    expect(parsed.state?.accessToken).toBeTruthy();
  });
});

test.describe('web-admin: защита маршрутов', () => {
  test('неавторизованный переход на /dashboard редиректит на /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });

  test('неавторизованный переход на /employees редиректит на /login', async ({ page }) => {
    await page.goto('/employees');
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });

  test('неизвестный маршрут отдаёт 404-страницу', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByText(/404|не найдена/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
