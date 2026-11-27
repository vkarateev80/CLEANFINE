import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/ui';
import type {
  ConsumptionSeriesPoint,
  GeofenceDailyPoint,
  StaffDailyPoint,
  TicketDailyPoint,
} from '../../types/reports';
import { formatDayShort, formatMoney, formatNumber } from './reportsHelpers';

/**
 * Графики отчётов М7.1 (Recharts).
 *
 * ПОЧЕМУ ГРАФИКИ В ОТДЕЛЬНОМ МОДУЛЕ. Recharts тянет в бандл заметный рантайм, и держать
 * его в двух местах (доска действий и страница «Отчёты») означало бы два способа рисовать один
 * и тот же ряд. Здесь один набор компонентов на все четыре отчёта; страница только
 * выбирает, какой показать.
 *
 * ПОЧЕМУ `ResponsiveContainer` С ФИКСИРОВАННОЙ ВЫСОТОЙ. Recharts измеряет контейнер
 * через ResizeObserver: без явной высоты график схлопывается в 0 и «пропадает». Высота
 * задана числом, ширина — по родителю.
 *
 * ЦВЕТА — из палитры дизайн-системы админки (`primary-500`, `success-500`,
 * `warning-500`, `danger-500` в `tailwind.config`), чтобы график не вводил вторую
 * цветовую шкалу рядом с бейджами и кнопками.
 */

const CHART_HEIGHT = 280;

/**
 * Подпись оси и тултипа.
 *
 * Типы Recharts v3 отдают в форматтеры `ValueType | undefined` и `ReactNode`, а не
 * `string`/`number`: приводим значения здесь, а не в каждом графике — иначе один и тот же
 * `Number(value)` расползается по шести компонентам.
 */
function tooltipValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function tooltipLabel(label: unknown): string {
  return typeof label === 'string' ? formatDayShort(label) : String(label ?? '');
}

/** Ось дат: `dd.MM` вместо ISO — в ряду за период год избыточен и занимает место. */
const dayTick = (value: string) => formatDayShort(value);

interface ChartCardProps {
  title: string;
  hint?: string;
  testId: string;
  children: React.ReactElement;
}

function ChartCard({ title, hint, testId, children }: ChartCardProps) {
  return (
    <Card testId={testId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-700">{title}</h2>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Общие настройки осей: одинаковые у всех графиков, иначе они «дрожат» при переключении. */
const AXIS_PROPS = {
  stroke: '#a3a3a3',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** Расход материалов по дням: стоимость (столбцы) — то, что спрашивают у отчёта. */
export function ConsumptionDailyChart({ series }: { series: ConsumptionSeriesPoint[] }) {
  return (
    <ChartCard
      title="Расход по дням"
      hint={`${series.length} дн. с расходом`}
      testId="report-chart-consumption"
    >
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={70} />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'cost'
              ? [`${formatMoney(tooltipValue(value))} ₽`, 'Стоимость']
              : [formatNumber(tooltipValue(value)), 'Расход']
          }
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Bar dataKey="cost" name="cost" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}

/** Заявки по дням: создано (столбцы) и выполнено (линия) — видно расхождение потока. */
export function TicketDailyChart({ series }: { series: TicketDailyPoint[] }) {
  return (
    <ChartCard title="Заявки по дням" hint="создано и выполнено" testId="report-chart-tickets">
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={50} allowDecimals={false} />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'createdCount'
              ? [formatNumber(tooltipValue(value)), 'Создано']
              : [formatNumber(tooltipValue(value)), 'Выполнено']
          }
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Legend
          formatter={(value: unknown) => (value === 'createdCount' ? 'Создано' : 'Выполнено')}
        />
        <Bar dataKey="createdCount" name="createdCount" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
        <Bar dataKey="completedCount" name="completedCount" fill="#22c55e" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}

/** Смены по дням: отметились и пропустили — контроль явки. */
export function StaffDailyChart({ series }: { series: StaffDailyPoint[] }) {
  return (
    <ChartCard title="Смены по дням" hint="отметились и пропустили" testId="report-chart-staff">
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={50} allowDecimals={false} />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'checkedInCount'
              ? [formatNumber(tooltipValue(value)), 'Отметились']
              : [formatNumber(tooltipValue(value)), 'Пропустили']
          }
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Legend
          formatter={(value: unknown) => (value === 'checkedInCount' ? 'Отметились' : 'Пропустили')}
        />
        <Bar dataKey="checkedInCount" name="checkedInCount" stackId="shifts" fill="#22c55e" />
        <Bar
          dataKey="missedCount"
          name="missedCount"
          stackId="shifts"
          fill="#ef4444"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartCard>
  );
}

/** Геозоны по дням: время на объектах и покрытие дня точками трека. */
export function GeofenceDailyChart({ series }: { series: GeofenceDailyPoint[] }) {
  return (
    <ChartCard
      title="Время на объектах и покрытие трека"
      hint="минуты в геозоне и точки трека"
      testId="report-chart-geofence"
    >
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={60} />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'dwellMinutes'
              ? [formatNumber(tooltipValue(value)), 'Минут в геозоне']
              : [formatNumber(tooltipValue(value)), 'Точек трека']
          }
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Legend
          formatter={(value: unknown) =>
            value === 'dwellMinutes' ? 'Минут в геозоне' : 'Точек трека'
          }
        />
        <Line
          dataKey="dwellMinutes"
          name="dwellMinutes"
          stroke="#0ea5e9"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="pointsCount"
          name="pointsCount"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartCard>
  );
}

/** Сводный график доски действий: заявки за 30 дней (создано / выполнено). */
export function DashboardTicketsChart({ series }: { series: TicketDailyPoint[] }) {
  return (
    <ChartCard
      title="Заявки за 30 дней"
      hint="по данным заявок"
      testId="dashboard-chart-tickets"
    >
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={50} allowDecimals={false} />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'createdCount'
              ? [formatNumber(tooltipValue(value)), 'Создано']
              : [formatNumber(tooltipValue(value)), 'Выполнено']
          }
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Legend
          formatter={(value: unknown) => (value === 'createdCount' ? 'Создано' : 'Выполнено')}
        />
        <Line
          dataKey="createdCount"
          name="createdCount"
          stroke="#0ea5e9"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="completedCount"
          name="completedCount"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartCard>
  );
}

/** Сводный график доски действий: расход материалов за 30 дней (стоимость по дням). */
export function DashboardConsumptionChart({ series }: { series: ConsumptionSeriesPoint[] }) {
  return (
    <ChartCard
      title="Расход материалов за 30 дней"
      hint="по списаниям материалов"
      testId="dashboard-chart-consumption"
    >
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={70} />
        <Tooltip
          formatter={(value: unknown) => [`${formatMoney(tooltipValue(value))} ₽`, 'Стоимость']}
          labelFormatter={(label: unknown) => tooltipLabel(label)}
        />
        <Bar dataKey="cost" name="cost" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}
