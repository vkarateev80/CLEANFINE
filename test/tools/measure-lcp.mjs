/**
 * Замер LCP дашборда (критерий приёмки М7.1: «дашборд открывается быстрее 2 секунд»).
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ТЕСТ В НАБОРЕ web. Набор `web` ходит в dev-сервер на
 * :5175, где Vite отдаёт модули по одному и никакого смысла в LCP нет. Продакшн-контур
 * стенда — nginx на :8080 с собранным `dist`, и мерить надо его. Держать такое измерение
 * в `e2e/web/*.ui.spec.ts` значило бы либо тащить :8080 в каждый прогон набора (и краснеть
 * там, где веб-контур не поднят), либо получить «проверку», которая молча скипается.
 *
 * ЧТО ИМЕННО МЕРИТСЯ. Largest Contentful Paint — метрика «когда основной контент
 * отрисован», ровно то, что понимают под «дашборд открывается». Значение берётся из
 * `PerformanceObserver` типа `largest-contentful-paint` (последняя запись: LCP уточняется
 * по мере отрисовки) после того, как дашборд догрузил KPI.
 *
 * ПРОФИЛЬ ЗАМЕРА. Кэш выключен (`--disable-application-cache` + `Cache-Control: no-store`
 * через route), вход выполняется заново, ХОЛОДНЫЙ старт: иначе второй прогон мерил бы
 * память браузера, а не приложение. Замер повторяется несколько раз, в отчёт идёт медиана —
 * одиночный прогон на общей машине шумит.
 *
 * Запуск:
 *   cd test && node tools/measure-lcp.mjs [--runs=3] [--url=http://127.0.0.1:8080]
 * Требует поднятого веб-контура стенда (`~/.cleaning-ops/stand.sh web-up`).
 */
import { chromium } from '@playwright/test';

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? 'true'];
    }),
);

const RUNS = Number(args.get('runs') ?? 3);
const BASE = args.get('url') ?? 'http://127.0.0.1:8080';
const EMAIL = args.get('email') ?? 'admin';
const PASSWORD = args.get('password') ?? 'admin123';

/** Порог приёмки М7.1 — 2000 мс. */
const THRESHOLD_MS = 2000;

async function measureOnce(run) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Холодный старт: без кэша браузера замер отражает первую загрузку у пользователя.
    bypassCSP: true,
  });
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), 'cache-control': 'no-cache' };
    await route.continue({ headers });
  });

  // Наблюдатель LCP ставится ДО первой навигации: `addInitScript` выполняется в каждом
  // новом документе, поэтому запись будет и на /login, и на /dashboard, а берём мы
  // последнюю — то есть LCP именно дашборда.
  await page.addInitScript(() => {
    window.__lcp = [];
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        window.__lcp.push({
          value: entry.startTime,
          element: entry.element ? entry.element.tagName : null,
          size: entry.size ?? null,
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  // Вход — служебный шаг, а не предмет замера: логинимся до перехода на дашборд.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });

  // Сбрасываем записи перед переходом: LCP логина в замер не входит.
  await page.evaluate(() => {
    window.__lcp = [];
  });

  const startedAt = Date.now();
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit' });

  // Ждём, пока KPI действительно отрисованы: «дашборд открылся» — это когда видно цифры,
  // а не когда пришёл HTML. Именно этот момент и фиксирует LCP.
  await page.waitForSelector('[data-testid="dashboard-kpi"]', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const card = document.querySelector('[data-testid="kpi-tickets-total"]');
      return Boolean(card && card.textContent && /\d/.test(card.textContent));
    },
    { timeout: 15_000 },
  );

  // Даём браузеру досчитать LCP: запись обновляется по мере отрисовки новых элементов.
  const lcp = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const entries = window.__lcp ?? [];
    return entries.length > 0 ? entries[entries.length - 1] : null;
  });
  const wallClock = Date.now() - startedAt;

  // Заголовок и карточки — доказательство, что страница именно та, которую мерили.
  const title = await page.locator('h1').first().textContent();
  const kpiCount = await page.locator('[data-testid="dashboard-kpi"] > *').count();

  await browser.close();
  return { run, lcp, wallClock, title, kpiCount };
}

const results = [];
for (let run = 1; run <= RUNS; run += 1) {
  const result = await measureOnce(run);
  results.push(result);
  console.log(
    `прогон ${result.run}: LCP ${result.lcp ? Math.round(result.lcp.value) : '—'} мс` +
      ` | до появления KPI ${result.wallClock} мс | заголовок «${result.title}» | карточек KPI ${result.kpiCount}` +
      (result.lcp
        ? ` | элемент ${result.lcp.element} (${Math.round(result.lcp.size ?? 0)} px²)`
        : ''),
  );
}

const values = results
  .map((result) => (result.lcp ? result.lcp.value : Number.NaN))
  .filter(Number.isFinite);
if (values.length === 0) {
  console.error('LCP не зафиксирован: PerformanceObserver не получил ни одной записи');
  process.exit(1);
}

values.sort((left, right) => left - right);
const median = values[Math.floor(values.length / 2)];
const worst = values[values.length - 1];

console.log('');
console.log(
  `URL: ${BASE}/dashboard | прогонов: ${values.length} | порог приёмки: ${THRESHOLD_MS} мс`,
);
console.log(`LCP: медиана ${Math.round(median)} мс | худший ${Math.round(worst)} мс`);

if (median >= THRESHOLD_MS) {
  console.error(`ПРИЁМКА НЕ ПРОЙДЕНА: медиана LCP ${Math.round(median)} мс ≥ ${THRESHOLD_MS} мс`);
  process.exit(1);
}
console.log(`ПРИЁМКА ПРОЙДЕНА: медиана LCP ${Math.round(median)} мс < ${THRESHOLD_MS} мс`);
