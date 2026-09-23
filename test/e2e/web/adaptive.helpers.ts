import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { userByRole } from '../../helpers/users';

/**
 * Хелперы адаптива web-admin (System Design v1, §2–§6): ширины, каркас, карточный
 * режим списков, тач-таргеты 44 px, модалки. Видимость проверяется только через
 * `isVisible()`: таблица и карточки живут в DOM одновременно. Экраны с параметром
 * (`/objects/:id`, `/routes/:id`, план этажа, `/tech-cards/:id`) вне набора — на
 * стенде нет этажей, техкарт и маршрутов; 404 рендерится вне `AdminLayout`.
 */
/** Адрес стенда: тот же дефолт, что у проекта `adaptive` (`baseURL` — тест-скоуп). */
export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://100.109.185.14:8090';

/** Контрольные ширины приёмки (§2). 1023/1024 — граница «планшет / desktop». */
export const SHELL_WIDTHS = [360, 390, 414, 768, 834, 1023, 1024, 1366, 1440, 1920];
export const PHONE_WIDTH = 360;
export const TABLET_WIDTH = 768;
export const DESKTOP_WIDTH = 1366;

/** Маршруты без параметров (PRD §7). Заведомо несуществующий путь — отдельной проверкой. */
export const ROUTES = [
  '/dashboard', '/objects', '/tickets', '/tech-cards', '/routes', '/map',
  '/materials', '/schedule', '/reports', '/messages', '/notifications', '/employees',
];
export const NOT_FOUND_PATH = '/no-such-page-404-check';

/** Списки на `ResponsiveTable` (ADR-002). `/reports` отдельно: на пустом стенде списка нет. */
export const LIST_ROUTES = ['/objects', '/tickets', '/tech-cards', '/materials', '/schedule', '/map'];
export const REPORTS_PATH = '/reports';

type Storage = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * Один вход на прогон: worker-фикстура логинится через UI один раз и отдаёт
 * `storageState` тестам — боевой лимит логина 5/мин (токен стенда живёт 15 минут).
 */
export const test = base.extend<Record<string, never>, { adaptiveStorage: Storage }>({
  adaptiveStorage: [
    async ({ browser }, use) => {
      const admin = userByRole('ADMIN');
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.locator('input[name="email"]').fill(admin.email);
      await page.locator('input[name="password"]').fill(admin.password);
      await page.getByRole('button', { name: 'Войти' }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
      await page.waitForFunction(() => Boolean(window.localStorage.getItem('cleaning-ops-auth')));
      const storage = await context.storageState();
      await context.close();
      await use(storage);
    },
    { scope: 'worker' },
  ],
});

/** Новый контекст на готовой сессии; `shell: false` — для страниц вне `AdminLayout` (404). */
export async function openPage(
  browser: Browser,
  storage: Storage,
  width: number,
  path: string,
  { shell = true }: { shell?: boolean } = {},
) {
  const height = width >= 768 ? 900 : 844;
  const context = await browser.newContext({ storageState: storage, viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (shell) await waitForShell(page);
  return { context, page };
}

/**
 * Каркас отрисован: сайдбар есть в DOM в любом диапазоне (на телефоне — скрыт).
 * Экран входа вместо него означает, что сессия из `storageState` не принята.
 */
export async function waitForShell(page: Page) {
  try {
    await page.locator('[data-testid="admin-sidebar"]').waitFor({ state: 'attached', timeout: 45_000 });
  } catch (error) {
    const reason = page.url().includes('/login')
      ? 'стенд вернул экран входа: сессия из storageState не принята'
      : 'каркас админки не отрисовался';
    throw new Error(`${reason} (${page.url()}): ${String(error).split('\n')[0]}`);
  }
}

/** Пункт 1 контракта: `documentElement.scrollWidth <= innerWidth`. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

/** Пункт 2 контракта: каркас по ширине (телефон / планшет / desktop, §3). */
export async function expectShell(page: Page, width: number) {
  const sidebar = page.locator('[data-testid="admin-sidebar"]');
  const burger = page.locator('[data-testid="nav-burger"]');
  const bottomNav = page.locator('[data-testid="bottom-nav"]');
  const drawer = page.locator('[data-testid="mobile-drawer"]');

  if (width < 768) {
    if (await sidebar.isVisible()) throw new Error(`${width}px: сайдбар видим, ожидался скрытым`);
    if (!(await burger.isVisible())) throw new Error(`${width}px: бургер скрыт`);
    if (!(await bottomNav.isVisible())) throw new Error(`${width}px: нижняя навигация скрыта`);
    const slots = await bottomNav.locator('a, button').count();
    if (slots !== 5) throw new Error(`${width}px: слотов в нижней навигации ${slots}, ожидалось 5`);
    await burger.click();
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByRole('button', { name: 'Закрыть меню' }).click();
    await drawer.waitFor({ state: 'detached', timeout: 5_000 });
    return;
  }
  if (!(await sidebar.isVisible())) throw new Error(`${width}px: сайдбар скрыт`);
  const box = await sidebar.boundingBox();
  const expected = width < 1024 ? 64 : 240;
  if (Math.round(box?.width ?? 0) !== expected) {
    throw new Error(`${width}px: ширина сайдбара ${Math.round(box?.width ?? 0)}, ожидалось ${expected}`);
  }
  if (await burger.isVisible()) throw new Error(`${width}px: бургер видим`);
  if (await bottomNav.isVisible()) throw new Error(`${width}px: нижняя навигация видима`);
}

/** Пункт 3: `ok` — режим верный, `no-data` — проверять не на чем, `mismatch` — дефект. */
export interface ListMode {
  status: 'ok' | 'no-data' | 'mismatch';
  detail: string;
}

/** Пункт 3 контракта: карточки на телефоне (`<768`), таблица на планшете и desktop. */
export async function listMode(page: Page, phone: boolean): Promise<ListMode> {
  const container = page.locator('[data-testid="responsive-table"], [data-testid="card-list"]').first();
  const table = page.locator('[data-testid="responsive-table"]').first();
  const cards = page.locator('[data-testid="card-list"]').first();
  // Панели `/materials`, `/schedule`, `/reports` догружаются чанком после каркаса.
  try {
    await container.waitFor({ state: 'attached', timeout: 20_000 });
  } catch {
    // Списка нет вовсе. Если в `main` нет и голой `<table>`, значит экран показал
    // пустое состояние (read-модели стенда пусты), а не сломал карточный режим.
    const tables = await page.locator('main table').count();
    return tables === 0
      ? { status: 'no-data', detail: 'список не отрисован: на стенде нет данных' }
      : { status: 'mismatch', detail: 'есть <table>, но нет контейнера responsive-table/card-list' };
  }
  if ((await table.count()) === 0 || (await cards.count()) === 0) {
    return { status: 'mismatch', detail: 'в DOM только одно из двух представлений списка' };
  }
  const tableVisible = await table.isVisible();
  const cardsVisible = await cards.isVisible();
  const ok = phone ? cardsVisible && !tableVisible : tableVisible && !cardsVisible;
  const expectedView = phone ? 'только карточки' : 'только таблица';
  const detail = `responsive-table=${tableVisible}, card-list=${cardsVisible} (ожидалось ${expectedView})`;
  return ok ? { status: 'ok', detail: '' } : { status: 'mismatch', detail };
}

/** Селектор интерактивных элементов и минимум тач-таргета (§6). */
const INTERACTIVE =
  'a[href], button, [role="button"], [role="tab"], [role="checkbox"], input:not([type="hidden"]), select, textarea';
const MIN_TARGET = 44;
/**
 * Пункт 4 контракта: нарушения тач-эргономики у видимых интерактивных элементов.
 * Ловушка: у ручки `⠿` (и у чекбоксов) зона нажатия расширена псевдоэлементом или
 * обёрткой `label`, поэтому `getBoundingClientRect()` меньше 44 px. Такие случаи
 * проверяются хит-тестом по краям зоны 44×44: нарушение — только полный промах.
 */
export async function touchTargetViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ selector, min }) => {
      const describe = (el: Element) => {
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
        const id = el.getAttribute('data-testid');
        return `${el.tagName.toLowerCase()}${id ? `[data-testid="${id}"]` : ''} «${label.slice(0, 30)}»`;
      };
      const scopes = ['main', 'header', '[data-testid="bottom-nav"]'];
      const nodes = scopes.flatMap((scope) => Array.from(document.querySelectorAll(`${scope} ${selector}`)));
      const violations: string[] = [];
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        if (rect.width >= min && rect.height >= min) continue;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const box = el.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const dx = Math.max(min, box.width) / 2 - 1;
        const dy = Math.max(min, box.height) / 2 - 1;
        const points: Array<[number, number]> = [
          [cx - dx, cy - dy], [cx + dx, cy - dy], [cx - dx, cy + dy], [cx + dx, cy + dy],
          [cx, cy - dy], [cx, cy + dy], [cx - dx, cy], [cx + dx, cy],
        ];
        const covered = points.some(([x, y]) => {
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
          const hit = document.elementFromPoint(x, y);
          if (!hit) return false;
          if (hit === el || el.contains(hit)) return true;
          // Обёртка (label чекбокса, кнопка вокруг иконки): попадание по ней — тоже тап.
          const wrapper = 'label, button, a, [role="button"], [role="checkbox"], [role="tab"]';
          return hit.matches(wrapper) && hit.contains(el);
        });
        if (!covered) violations.push(`${describe(el)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      }
      return violations;
    },
    { selector: INTERACTIVE, min: MIN_TARGET },
  );
}
/** Пункт 5 контракта: модалка создания техкарты — у неё есть футер с кнопками. */
export async function openTechCardModal(page: Page) {
  await page.goto('/tech-cards', { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  const trigger = page.getByRole('button', { name: /Новая техкарта/ });
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await trigger.click();
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  return dialog;
}
