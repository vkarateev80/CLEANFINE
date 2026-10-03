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
 * Адреса остальных сервисов наборы читают из окружения САМИ (helpers/*.ts), а не через
 * `use`: `E2E_GPS_URL` (:3004), `E2E_TICKET_URL` (:3005), `E2E_NOTIFICATION_URL` (:3006),
 * `E2E_MATERIAL_URL` (:3007), `E2E_SCHEDULE_URL` (:3008), `E2E_CHAT_URL` (:3009, REST
 * `/api/chat` и WebSocket namespace `/chat`), `E2E_BASE_URL` (:5175). Дефолты — локальный
 * стенд, поэтому в CI достаточно поднять сервисы на штатных портах.
 *
 * Второе UI-приложение — портал заказчика (`frontend/web-client`, :5174, М5.4). Он живёт
 * в том же проекте `web` (файл `e2e/web/portal.ui.spec.ts`), но у него СВОЙ адрес, который
 * не выражается одним `baseURL`: `E2E_PORTAL_URL` (:5174, дефолт — локальный стенд).
 * Специфика портала переходит по абсолютному адресу, а админские шаги того же файла — по
 * `baseURL` проекта (`E2E_BASE_URL`, :5175); мобильный вьюпорт портала задаётся в самом
 * файле (`test.use(devices['iPhone 13'])`). Отдельный проект для портала не заводится
 * намеренно: `--project=web` обязан прогонять весь UI-набор целиком, включая портал.
 *
 * Сервисы НЕ поднимаются автоматически (`webServer`), их поднимает запускающий:
 *  - auth-service: порт 3001. В e2e-прогоне лимит логина поднимается
 *    (THROTTLE_LOGIN_LIMIT=1000 THROTTLE_GLOBAL_LIMIT=10000), иначе набор
 *    упирается в боевой лимит 5 логинов/мин. Отдельный тест на 429 проверяет
 *    сам механизм и работает при поднятом лимите;
 *  - core-service: порт 3003, file-service: порт 3002 (М2.9), MinIO :9000;
 *  - chat-service: порт 3009 (М5.6), ticket-service :3005 — участники TICKET-чата;
 *  - web-admin: порт 5175 (vite dev, proxy /api → :3001); 5173 занят PatentMaster.
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
  /**
   * Отчёты (М7.3) пишутся ВСЕГДА и одинаково локально и в CI:
   *  - `list` — прогресс в консоль (по нему снимаются счётчики «до/после»);
   *  - `html` → `reports/playwright` — разбор глазами (`pnpm test:e2e:report`);
   *    этот же путь выгружает шаг `upload-artifact` джобы `e2e` в ci.yml;
   *  - `json` → `reports/results.json` — машинный результат для скриптов и отчёта.
   * Разное поведение локально и в CI означало бы, что «отчёты в test/reports/»
   * появляются только на раннере (см. test/reports/README.md).
   */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

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
        // Админка (:5175). Специфика портала (:5174) берёт `E2E_PORTAL_URL` сам —
        // у проекта один `baseURL`, а приложений два.
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5175',
      },
    },
    {
      /**
       * Адаптив админки (телефон <768 / планшет 768–1023 / desktop ≥1024) — против
       * СТЕНДА, а не локальной vite dev: `E2E_ADMIN_URL`, по умолчанию tailnet-адрес
       * стенда `prj-cleanfine`. Файл набора — `e2e/web/adaptive.spec.ts`, и имя
       * намеренно НЕ `*.ui.spec.ts`: с шаблоном проекта `web` спека попадала бы в
       * него при обычном `playwright test` (штатный `pnpm test:e2e` идёт без
       * `--project`) и уходила бы на localhost:5175.
       *
       * `timeout` поднят до 90 с намеренно: единственный вход на прогон живёт в
       * worker-фикстуре `adaptiveStorage` и укладывается в таймаут ПЕРВОГО теста.
       * При конфиговых 30 с холодный сетевой стенд (загрузка бандла + вход) не
       * укладывался, и падение фикстуры уносило все 19 проверок сразу.
       */
      name: 'adaptive',
      testMatch: /adaptive\.spec\.ts/,
      timeout: 90_000,
      use: {
        baseURL: process.env.E2E_ADMIN_URL ?? 'http://100.109.185.14:8090',
      },
    },
  ],
});
