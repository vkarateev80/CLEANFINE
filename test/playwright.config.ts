import { defineConfig } from '@playwright/test';

/**
 * Конфигурация Playwright (каркас М0.8; активируется с М1.8 — добавление
 * @playwright/test в test/package.json и запуск против dev-стенда).
 * Источник: УСТАВ.md → Агент QA (E2E Playwright).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'reports/playwright' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
