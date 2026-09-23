import { expect, type Browser, type Page } from '@playwright/test';
import {
  DESKTOP_WIDTH,
  LIST_ROUTES,
  NOT_FOUND_PATH,
  PHONE_WIDTH,
  REPORTS_PATH,
  ROUTES,
  SHELL_WIDTHS,
  TABLET_WIDTH,
  expectShell,
  horizontalOverflow,
  listMode,
  openPage,
  openTechCardModal,
  test,
  touchTargetViolations,
  waitForShell,
} from './adaptive.helpers';

/**
 * Проверки адаптива web-admin по System Design v1 (approved) §2–§6.
 *
 * Набор идёт против стенда (`baseURL` проекта `adaptive`, по умолчанию
 * http://100.109.185.14:8090) и проверяет 5 пунктов контракта: отсутствие
 * горизонтального переполнения (защитный), каркас по ширине, карточный режим
 * списков, тач-таргеты 44 px, модалки. Экраны с параметром (`/objects/:id`,
 * `/routes/:id`, план этажа, `/tech-cards/:id`) не проверяются: на стенде нет
 * этажей, техкарт, маршрутов и заявок — их отдельно проверяет оркестратор.
 *
 * Вход — один на прогон (worker-фикстура `adaptiveStorage`), дальше контексты
 * создаются с готовым `storageState`: боевой лимит логина 5/мин.
 */

type Storage = Parameters<typeof openPage>[1];

/**
 * Общий прогон по списку маршрутов с накоплением нарушений (а не падение на первом).
 * `domcontentloaded` вместо `load`: ждём появления каркаса, а не всех подресурсов —
 * иначе прогон по половине списка не укладывается в таймаут на медленном стенде.
 */
async function collect(
  browser: Browser,
  storage: Storage,
  width: number,
  routes: string[],
  check: (route: string, page: Page) => Promise<string | null>,
): Promise<string[]> {
  const { context, page } = await openPage(browser, storage, width, routes[0]);
  const bad: string[] = [];
  try {
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForShell(page);
      const problem = await check(route, page);
      if (problem) bad.push(problem);
    }
  } finally {
    await context.close();
  }
  return bad;
}

test.describe('каркас по контрольным ширинам', () => {
  for (const width of SHELL_WIDTHS) {
    test(`/dashboard на ${width}px: каркас и отсутствие переполнения`, async ({ browser, adaptiveStorage }) => {
      const { context, page } = await openPage(browser, adaptiveStorage, width, '/dashboard');
      try {
        const { scrollWidth, innerWidth } = await horizontalOverflow(page);
        expect(scrollWidth, `горизонтальное переполнение на ${width}px`).toBeLessThanOrEqual(innerWidth);
        // <768 — скрытый сайдбар/бургер+drawer/нижняя навигация из 5 слотов,
        // 768–1023 — рейка ровно 64 px, ≥1024 — сайдбар ровно 240 px (§3).
        await expectShell(page, width);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('горизонтальное переполнение на маршрутах', () => {
  // Прогон разбит на две половины: 12 полных загрузок в одном тесте не
  // укладывались в таймаут на медленном стенде, а половина ещё и точнее
  // показывает, какой участок списка поехал. 404 сюда не входит: он рендерится
  // вне `AdminLayout` и проверяется отдельно.
  const sweep = ROUTES;
  const half = Math.ceil(sweep.length / 2);
  const halves = [sweep.slice(0, half), sweep.slice(half)];
  for (const width of [PHONE_WIDTH, TABLET_WIDTH, DESKTOP_WIDTH]) {
    halves.forEach((routes, index) => {
      test(`маршруты ${index * half + 1}–${index * half + routes.length} из ${sweep.length} на ${width}px`, async ({
        browser,
        adaptiveStorage,
      }) => {
        const bad = await collect(browser, adaptiveStorage, width, routes, async (route, page) => {
          const { scrollWidth, innerWidth } = await horizontalOverflow(page);
          return scrollWidth > innerWidth ? `переполнение ${scrollWidth} > ${innerWidth}` : null;
        });
        expect(bad, `маршруты с горизонтальным переполнением на ${width}px`).toEqual([]);
      });
    });
  }
});

test.describe('карточный режим списков', () => {
  test(`телефон ${PHONE_WIDTH}px: card-list видим, responsive-table скрыт`, async ({ browser, adaptiveStorage }) => {
    const bad = await collect(browser, adaptiveStorage, PHONE_WIDTH, LIST_ROUTES, async (route, page) => {
      const mode = await listMode(page, true);
      return mode.status === 'mismatch' ? `${route}: ${mode.detail}` : null;
    });
    expect(bad, 'списки в карточном режиме на телефоне').toEqual([]);
  });

  test(`desktop ${DESKTOP_WIDTH}px: responsive-table видим, card-list скрыт`, async ({ browser, adaptiveStorage }) => {
    const bad = await collect(browser, adaptiveStorage, DESKTOP_WIDTH, LIST_ROUTES, async (route, page) => {
      const mode = await listMode(page, false);
      return mode.status === 'mismatch' ? `${route}: ${mode.detail}` : null;
    });
    expect(bad, 'списки в табличном режиме на desktop').toEqual([]);
  });

  /**
   * `/reports` вынесен отдельно: его панели (`MaterialsReport` и др.) при пустой
   * read-модели рисуют пустое состояние и `ResponsiveTable` не создают вовсе —
   * на стенде нет ни материалов, ни движений, ни заявок, ни смен. Проверять
   * карточный режим там не на чем, поэтому экран помечается пропущенным с
   * причиной, а не падением; при появлении данных проверка включается сама.
   */
  for (const [width, phone] of [
    [PHONE_WIDTH, true],
    [DESKTOP_WIDTH, false],
  ] as const) {
    test(`${REPORTS_PATH} на ${width}px: карточный режим`, async ({ browser, adaptiveStorage }) => {
      const { context, page } = await openPage(browser, adaptiveStorage, width, REPORTS_PATH);
      try {
        const mode = await listMode(page, phone);
        if (mode.status === 'no-data') {
          // Причина пропуска дублируется в консоль: `line`/`list`-репортеры её не печатают.
          console.log(`SKIP ${REPORTS_PATH} на ${width}px: ${mode.detail}`);
          test.skip(true, `${REPORTS_PATH}: ${mode.detail}`);
        }
        expect(mode.detail, `${REPORTS_PATH} на ${width}px`).toBe('');
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('несуществующий путь', () => {
  /**
   * 404 обслуживает `path: '*'` ВНЕ `AdminLayout` (`router/index.tsx`), поэтому
   * сайдбара и нижней навигации на ней нет и быть не должно: проверяем саму
   * страницу (заголовок и переход на дашборд) и отсутствие переполнения.
   */
  test(`${NOT_FOUND_PATH} на 360, 768 и 1366px: страница 404 без переполнения`, async ({
    browser,
    adaptiveStorage,
  }) => {
    const bad: string[] = [];
    for (const width of [PHONE_WIDTH, TABLET_WIDTH, DESKTOP_WIDTH]) {
      const { context, page } = await openPage(browser, adaptiveStorage, width, NOT_FOUND_PATH, { shell: false });
      try {
        await expect(page.getByText('Страница не найдена')).toBeVisible();
        await expect(page.getByRole('link', { name: 'На дашборд' })).toBeVisible();
        const { scrollWidth, innerWidth } = await horizontalOverflow(page);
        if (scrollWidth > innerWidth) bad.push(`${width}px: ${scrollWidth} > ${innerWidth}`);
      } finally {
        await context.close();
      }
    }
    expect(bad, 'переполнение на странице 404').toEqual([]);
  });
});

test.describe('тач-таргеты', () => {
  for (const width of [PHONE_WIDTH, TABLET_WIDTH]) {
    test(`интерактивные элементы ≥44 px на ${width}px`, async ({ browser, adaptiveStorage }) => {
      const routes = ['/dashboard', '/objects', '/tickets'];
      const bad = await collect(browser, adaptiveStorage, width, routes, async (route, page) => {
        const violations = await touchTargetViolations(page);
        return violations.length > 0 ? `${route}: ${violations.join('; ')}` : null;
      });
      expect(bad, `элементы меньше 44 px без расширенной зоны нажатия на ${width}px`).toEqual([]);
    });
  }
});

test.describe('модалки', () => {
  test(`телефон ${PHONE_WIDTH}px: модалка на весь экран, футер достижим`, async ({ browser, adaptiveStorage }) => {
    const { context, page } = await openPage(browser, adaptiveStorage, PHONE_WIDTH, '/dashboard');
    try {
      const dialog = await openTechCardModal(page);
      const viewport = page.viewportSize();
      const box = await dialog.boundingBox();
      expect(box, 'модалка отрисована').not.toBeNull();
      expect(Math.round(box!.width), 'ширина модалки на телефоне').toBeGreaterThanOrEqual(viewport!.width - 2);
      expect(Math.round(box!.height), 'высота модалки на телефоне').toBeGreaterThanOrEqual(viewport!.height - 2);

      // Футер достижим без прокрутки страницы: кнопка сохранения и «Отмена» целиком
      // внутри вьюпорта и не мельче 44 px (§5.1, §6).
      for (const name of [/Создать/, /Отмена/]) {
        const button = dialog.getByRole('button', { name });
        await expect(button).toBeVisible();
        const buttonBox = await button.boundingBox();
        expect(Math.round(buttonBox!.y + buttonBox!.height), `низ кнопки «${name}» в вьюпорте`)
          .toBeLessThanOrEqual(viewport!.height);
        expect(Math.round(buttonBox!.height), `высота кнопки «${name}»`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await context.close();
    }
  });

  test(`desktop ${DESKTOP_WIDTH}px: модалка прежняя центрированная`, async ({ browser, adaptiveStorage }) => {
    const { context, page } = await openPage(browser, adaptiveStorage, DESKTOP_WIDTH, '/dashboard');
    try {
      const dialog = await openTechCardModal(page);
      const viewport = page.viewportSize();
      const box = await dialog.boundingBox();
      expect(box, 'модалка отрисована').not.toBeNull();
      // Прежний вид: `max-w-lg` (512 px) центрирован по горизонтали, не на весь экран.
      expect(box!.width, 'ширина модалки на desktop').toBeLessThanOrEqual(560);
      expect(box!.height).toBeLessThan(viewport!.height - 100);
      const centerOffset = Math.abs(box!.x + box!.width / 2 - viewport!.width / 2);
      expect(Math.round(centerOffset), 'горизонтальное центрирование').toBeLessThanOrEqual(2);
      expect(Math.round(box!.y), 'модалка не прижата к верхнему краю').toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
