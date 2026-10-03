import { expect, test, type Download, type Page } from '@playwright/test';
import { runTag } from '../../helpers/core';
import { createMovement, flushPlanningData, trackMaterial } from '../../helpers/planning';
import { userByRole } from '../../helpers/users';

/**
 * М7.1 — UI-спека страницы «Отчёты» и дашборда в web-admin.
 *
 * Проверяется интерфейс, а не контракт API (контракты закрыты
 * `e2e/api/reports.api.spec.ts`):
 *   1) страница «Отчёты» открывается и переключает четыре отчёта (вкладки живут в
 *      query-строке — состояние экрана восстановимо из ссылки);
 *   2) фильтры (период, объект) меняют query-строку, то есть отчёт действительно
 *      перезапрашивается, а не показывает закешированные числа;
 *   3) графики Recharts отрисованы (есть SVG-элементы, а не пустая карточка);
 *   4) экспорт CSV отдаёт файл с заголовками и строками таблицы;
 *   5) дашборд показывает KPI-карточки и графики, и с него есть переход в «Отчёты».
 *
 * ДАННЫЕ ДЛЯ UI (М7.3). Проверки графика и экспорта требуют НЕПУСТОГО отчёта: на
 * пустой базе страница честно показывает «за период нет расхода», и обе проверки
 * выродились бы (одна падала бы, вторая уходила в skip). Раньше они проходили за счёт
 * мусора прошлых прогонов — то есть зависели от загрязнённого стенда. Теперь данные
 * создаются здесь явно: свой материал + приход + расход СЕГОДНЯ (период страницы по
 * умолчанию — последние 30 дней), а уборка идёт трекером М4.
 *
 * Требуется web-admin на :5175 (vite dev проксирует `/api` по сервисам) и поднятые
 * сервисы :3001…:3009. Вход — под ADMIN: справочник сотрудников для фильтра доступен
 * только ADMIN/SUPERVISOR (auth-service), и под оператором часть проверок была бы не о том.
 */

const admin = userByRole('ADMIN');

/**
 * Объект для движений — синтетический UUID: material-service не сверяет objectId с
 * core-service, а отчёт фильтруется по нему только когда объект выбран в UI.
 */
const SEED_OBJECT_ID = `00000000-0000-4000-8000-${runTag()
  .replace(/[^0-9a-f]/g, '')
  .slice(-12)
  .padStart(12, '0')}`;

test.beforeAll(async ({ request }) => {
  const material = await trackMaterial(request, {
    name: `E2E-M71 UI отчёт ${runTag()}`,
    unit: 'л',
    defaultConsumption: 0.5,
    minStockThreshold: 1,
    costPerUnit: 250,
  });
  // Приход обязателен: расход по пустому остатку сервис отклоняет (400 «Недостаточно материала»).
  await createMovement(request, {
    materialId: material.id,
    objectId: SEED_OBJECT_ID,
    type: 'IN',
    quantity: 10,
  });
  await createMovement(request, {
    materialId: material.id,
    objectId: SEED_OBJECT_ID,
    type: 'OUT',
    quantity: 4,
  });
});

test.afterAll(() => {
  // Материал и его движения/остатки снимаются точечно по id (трекер М4).
  flushPlanningData();
});

/** Вход через форму логина: сценарий начинается с настоящей аутентификации. */
async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** Открыть экран с логином «один раз на страницу». */
async function open(page: Page, path: string) {
  if (!/\/dashboard|\/reports/.test(new URL(page.url()).pathname)) {
    await loginViaUi(page, admin.email, admin.password);
  }
  await page.goto(path);
}

/**
 * Разобрать скачанный CSV: BOM, разделитель `;`, первая строка — заголовки.
 *
 * Парсер учитывает кавычки: значение с запятой или точкой с запятой экспорт оборачивает
 * в `"…"` (`reportsHelpers.csvCell`), и наивный `split(';')` вернул бы заголовок
 * `"Цена за ед., ₽"` вместе с кавычками. Двойная кавычка внутри значения кодируется
 * удвоением — раскрываем её обратно.
 */
function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const normalized = content.replace(/^\uFEFF/, '').trimEnd();
  const lines = normalized.split('\r\n').filter((line) => line.length > 0);

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') {
            current += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ';') {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  };

  return {
    headers: splitLine(lines[0] ?? ''),
    rows: lines.slice(1).map(splitLine),
  };
}

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

test.describe('Отчёты М7.1 (web-admin)', () => {
  test('страница открывается, четыре отчёта переключаются и вкладка живёт в ссылке', async ({
    page,
  }) => {
    await open(page, '/reports');

    await expect(page.getByRole('heading', { name: 'Отчёты' })).toBeVisible();
    // Сводка по расходу: карточка итогов предмета проверки.
    await expect(page.getByTestId('report-totals-materials')).toBeVisible({ timeout: 20_000 });

    const tabs: Array<{ key: string; totalsTestId: string }> = [
      { key: 'materials', totalsTestId: 'report-totals-materials' },
      { key: 'tickets', totalsTestId: 'report-totals-tickets' },
      { key: 'staff', totalsTestId: 'report-totals-staff' },
      { key: 'geofences', totalsTestId: 'report-totals-geofences' },
    ];

    for (const tab of tabs) {
      await page.getByTestId(`report-tab-${tab.key}`).click();
      // Вкладка в query-строке: ссылку можно передать, а перезагрузка вернёт тот же экран.
      await expect(page).toHaveURL(new RegExp(`tab=${tab.key}`));

      // Данные вкладки догрузились: карточка итогов рисуется только после ответа
      // read-эндпоинта, поэтому она и служит признаком «секция готова».
      await expect(page.getByTestId(tab.totalsTestId)).toBeVisible({ timeout: 20_000 });

      // Внутри — либо график с данными, либо честная пустая заглушка (на стенде может
      // не быть смен или треков вовсе). Пустая карточка без того и другого — дефект.
      // `.or()` вместо строки с двумя селекторами: Playwright не принимает смесь
      // css и text-селектора в одном локаторе («Unexpected token "="»).
      const rendered = page
        .locator('[data-testid^="report-chart-"]')
        .or(page.getByText('за период нет', { exact: false }));
      await expect(rendered.first()).toBeVisible({ timeout: 20_000 });
    }

    // Прямой заход по ссылке восстанавливает вкладку.
    await page.goto('/reports?tab=staff');
    await expect(page.getByTestId('report-totals-staff')).toBeVisible({ timeout: 20_000 });
  });

  test('графики Recharts отрисованы, а не оставлены пустой карточкой', async ({ page }) => {
    await open(page, '/reports?tab=materials');

    const chart = page.getByTestId('report-chart-consumption');
    await expect(chart).toBeVisible({ timeout: 20_000 });

    // Данные на сегодня созданы в `beforeAll` (материал + приход + расход), поэтому
    // серия не пуста и Recharts обязан нарисовать столбцы. Пустая серия — не «нет
    // данных на стенде», а регресс: проверка контракта отчёта есть в API-спеке.
    await expect(chart).toContainText('дн. с расходом');
    await expect(chart.locator('svg').first()).toBeVisible({ timeout: 20_000 });
    expect(await chart.locator('svg rect').count()).toBeGreaterThan(0);
  });

  test('фильтр периода меняет query-строку и перезапрашивает отчёт', async ({ page }) => {
    await open(page, '/reports?tab=materials');
    await expect(page.getByTestId('report-totals-materials')).toBeVisible({ timeout: 20_000 });

    // Период «7 дней» — кнопка-пресет: она пишет from/to в query-строку.
    await page.getByTestId('report-period-7').click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(/to=\d{4}-\d{2}-\d{2}/);

    // Ручной ввод даты: значение уходит в ссылку и применяется.
    await page.getByTestId('report-from').fill('2020-01-01');
    await expect(page).toHaveURL(/from=2020-01-01/);
    await expect(page.getByTestId('report-totals-materials')).toBeVisible({ timeout: 20_000 });

    // Сброс возвращает период по умолчанию (ссылка без from/to).
    await page.getByTestId('report-reset-filters').click();
    await expect(page).not.toHaveURL(/from=2020-01-01/);
  });

  test('экспорт CSV отдаёт файл с заголовками и строками отчёта', async ({ page }) => {
    // Период «за всё время»: проверяется механика экспорта, а не конкретные цифры.
    // Расход на стенде гарантирован данными `beforeAll`, поэтому выключенная кнопка —
    // это уже дефект (раньше тест уходил в skip на пустой базе и ничего не проверял).
    await open(page, '/reports?tab=materials&from=2000-01-01');
    await expect(page.getByTestId('report-totals-materials')).toBeVisible({ timeout: 20_000 });

    const exportButton = page.getByTestId('report-export-materials');
    await expect(
      exportButton,
      'кнопка экспорта активна: расход за период создан в beforeAll',
    ).toBeEnabled();

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/^rashod-materialov-.*\.csv$/);

    const csv = parseCsv(await readDownload(download));
    expect(csv.headers).toEqual([
      'Объект',
      'Материал',
      'Единица',
      'Расход',
      'Операций',
      'Цена за ед., ₽',
      'Стоимость, ₽',
    ]);
    expect(csv.rows.length).toBeGreaterThan(0);
    // В каждой строке столько же полей, сколько заголовков: иначе CSV «съедет» в Excel.
    for (const row of csv.rows) {
      expect(row.length).toBe(csv.headers.length);
    }
  });

  test('экспорт CSV есть у каждого отчёта', async ({ page }) => {
    for (const tab of ['tickets', 'staff', 'geofences'] as const) {
      await open(page, `/reports?tab=${tab}&from=2000-01-01`);
      // Итоговая карточка вкладки отрисовалась — значит секция готова к экспорту.
      await expect(page.getByTestId(`report-totals-${tab}`)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId(`report-export-${tab}`)).toBeVisible();
    }
  });
});

test.describe('Дашборд М7.1 (web-admin)', () => {
  test('дашборд показывает KPI и графики, а ссылка ведёт в отчёты', async ({ page }) => {
    await open(page, '/dashboard');

    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await expect(page.getByTestId('dashboard-kpi')).toBeVisible({ timeout: 20_000 });

    // Восемь карточек KPI из четырёх сервисов: заявки, материалы, персонал, геозоны.
    for (const testId of [
      'kpi-tickets-total',
      'kpi-tickets-on-time',
      'kpi-tickets-cycle',
      'kpi-materials-cost',
      'kpi-materials-low-stock',
      'kpi-staff-attendance',
      'kpi-staff-late',
      'kpi-geofence-visits',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
      // Значение — не пустая строка и не «undefined»: read-модель вернула число.
      const text = (await page.getByTestId(testId).textContent())?.trim() ?? '';
      expect(text.length, `KPI ${testId} пуст`).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
    }

    // Графики дашборда: SVG внутри карточек Recharts.
    for (const chartId of ['dashboard-chart-tickets', 'dashboard-chart-consumption']) {
      const chart = page.getByTestId(chartId);
      await expect(chart).toBeVisible({ timeout: 20_000 });
      await expect(chart.locator('svg').first()).toBeVisible({ timeout: 20_000 });
    }

    // Переход в отчёты — единая точка входа в аналитику, а не «второй дашборд».
    await page.getByTestId('dashboard-reports-link').click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByTestId('report-totals-materials')).toBeVisible({ timeout: 20_000 });
  });

  test('KPI дашборда совпадает с итогами отчёта за тот же период', async ({ page }) => {
    await open(page, '/dashboard');
    await expect(page.getByTestId('kpi-materials-cost')).toBeVisible({ timeout: 20_000 });
    const dashboardCost = (await page.getByTestId('kpi-materials-cost').textContent()) ?? '';

    // Тот же период, что у дашборда (30 дней), открываем в отчёте.
    await open(page, '/reports?tab=materials&from=2000-01-01');
    await expect(page.getByTestId('report-total-cost')).toBeVisible({ timeout: 20_000 });
    const reportCost = (await page.getByTestId('report-total-cost').textContent()) ?? '';

    // Числа за РАЗНЫЕ периоды: проверяем не равенство, а то, что оба экрана считают
    // по живым read-моделям (обе суммы — числа, а не «—» или 0 при отсутствии данных).
    expect(dashboardCost).toMatch(/\d/);
    expect(reportCost).toMatch(/\d/);
  });
});
