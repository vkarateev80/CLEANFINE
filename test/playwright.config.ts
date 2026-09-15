import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация Playwright (М1.8 — QA вертикали входа; М2.9 — ядро домена).
 *
 * Два проекта:
 *  - `api` — e2e уровня HTTP против сервисов (браузер не нужен):
 *    e2e/web/*.api.spec.ts — auth-service, e2e/api/*.api.spec.ts — core/file-service
 *    (М2.9). baseURL проекта — auth-service: `E2E_API_URL`; core-набор ходит в
 *    core-service/file-service по абсолютным адресам из `E2E_CORE_URL` (:3003) и
 *    `E2E_FILE_URL` (:3002), поэтому смена baseURL его не затрагивает.
 *  - `web` — UI-smoke web-admin в браузере: e2e/web/*.ui.spec.ts
 *
 * Сервисы НЕ поднимаются автоматически (`webServer`), их поднимает запускающий:
 *  - auth-service: порт 3001. В e2e-прогоне лимит логина поднимается
 *    (THROTTLE_LOGIN_LIMIT=1000 THROTTLE_GLOBAL_LIMIT=10000), иначе набор
 *    упирается в боевой лимит 5 логинов/мин. Отдельный тест на 429 проверяет
 *    сам механизм и работает при поднятом лимите;
 *  - core-service: порт 3003, file-service: порт 3002 (М2.9), MinIO :9000;
 *  - web-admin: порт 5173 (vite dev, proxy /api → :3001).
 * В CI все поднимаются шагами джобы.
 *
 * Источник: УСТАВ.md → Агент QA (E2E Playwright).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Логин ограничен по частоте на стороне сервиса — держим один воркер.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]]
    : [['list']],

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: process.env.E2E_API_URL ?? 'http://localhost:3001',
      },
    },
    {
      name: 'web',
      testMatch: /.*\.ui\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
      },
    },
  ],
});
