import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../../api/auth';
import { Card, ErrorBanner, LoadingBlock, PageHeader, Spinner } from '../../components/ui';
import { ROUTES } from '../../router/routes';
import { useAuthStore } from '../../stores/authStore';
import { DashboardConsumptionChart, DashboardTicketsChart } from '../Reports/ReportCharts';
import {
  defaultPeriod,
  formatMinutes,
  formatMoney,
  formatNumber,
  formatPercent,
} from '../Reports/reportsHelpers';
import {
  useConsumptionReport,
  useConsumptionSummary,
  useGeofenceSummary,
  useStaffSummary,
  useTicketExecutionReport,
  useTicketSummary,
} from '../Reports/useReports';
import { KpiCard } from './KpiCard';

/**
 * Дашборд (М7.1) — сводные KPI и графики поверх read-моделей сервисов.
 *
 * ЧТО ЗДЕСЬ ВМЕСТО ЗАГЛУШКИ. До М7.1 экран показывал только профиль и надпись «KPI и
 * графики появятся в М2–М7». Теперь он собирает KPI из четырёх сервисов:
 *  • заявки (ticket-service) — поток, просрочки, среднее время цикла, доля в срок;
 *  • материалы (material-service) — расход за 30 дней, стоимость, позиции ниже порога;
 *  • персонал (schedule-service) — смены, явка, опоздания, авто-закрытия;
 *  • геозоны (gps-service) — посещения объектов и время на объектах.
 *
 * ПОЧЕМУ ЭТО БЫСТРО. Каждый KPI — один запрос к одной read-модели, которая считается
 * SQL-агрегатом (`staff_control_totals`, `ticket_execution_totals`, …) без выборки строк
 * в приложение. Запросы идут параллельно (`useQuery` монтируется в одном рендере), а
 * справочники для подписей не запрашиваются вовсе: у дашборда нет таблиц, где нужны
 * имена объектов и сотрудников. Уложиться в 2 с LCP — требование приёмки М7.1.
 *
 * ПОЧЕМУ ПРОФИЛЬ ОСТАЛСЯ. Это единственное место, где видно, под какой ролью открыта
 * админка; он приходит из `/auth/me` и на скорость не влияет (запрос идёт параллельно
 * остальным).
 */

/** Окно KPI — 30 дней; то же окно по умолчанию у страницы «Отчёты». */
const KPI_DAYS = 30;

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const profile = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  const tickets = useTicketSummary();
  const consumption = useConsumptionSummary();
  const staff = useStaffSummary();
  const geofences = useGeofenceSummary();

  const period = useMemo(() => defaultPeriod(KPI_DAYS), []);

  // Ряды для графиков: тот же период, что у KPI, — иначе цифра и график разойдутся.
  const ticketSeries = useTicketExecutionReport(period);
  const consumptionSeries = useConsumptionReport(period);

  const display = profile.data ?? user;
  const kpiLoading =
    tickets.isLoading || consumption.isLoading || staff.isLoading || geofences.isLoading;

  /** Ошибки KPI: показываем первую — остальные, скорее всего, та же причина. */
  const kpiError = tickets.error ?? consumption.error ?? staff.error ?? geofences.error ?? null;
  const kpiFailed = tickets.isError || consumption.isError || staff.isError || geofences.isError;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Дашборд"
        subtitle={`Сводка за последние ${KPI_DAYS} дней: заявки, материалы, персонал, геозоны.`}
        actions={
          <Link
            to={ROUTES.reports}
            data-testid="dashboard-reports-link"
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            Открыть отчёты
          </Link>
        }
      />

      {profile.isError && (
        <div className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-warning-600">
          Не удалось обновить профиль — показаны данные сессии.
        </div>
      )}

      {kpiFailed && (
        <ErrorBanner
          error={kpiError}
          onRetry={() => {
            void tickets.refetch();
            void consumption.refetch();
            void staff.refetch();
            void geofences.refetch();
          }}
        />
      )}

      {/* Первый экран: KPI виден до того, как догрузятся графики. */}
      <section className="flex flex-wrap gap-4" data-testid="dashboard-kpi">
        <KpiCard
          label="Заявки за 30 дней"
          value={String(tickets.data?.ticketsTotal ?? 0)}
          hint="ticket-service · ticket_execution_totals"
          testId="kpi-tickets-total"
          footer={
            tickets.data ? (
              <div className="flex gap-3 text-xs text-neutral-500">
                <span>новых {tickets.data.newCount}</span>
                <span>в работе {tickets.data.inWorkCount}</span>
                <span>просрочено {tickets.data.overdueCount}</span>
              </div>
            ) : null
          }
        />
        <KpiCard
          label="В срок"
          value={formatPercent(tickets.data?.onTimeRate ?? null)}
          tone={
            (tickets.data?.onTimeRate ?? 100) >= 90
              ? 'success'
              : (tickets.data?.onTimeRate ?? 100) >= 70
                ? 'warning'
                : 'danger'
          }
          hint="доля заявок без просрочки"
          testId="kpi-tickets-on-time"
        />
        <KpiCard
          label="Среднее время цикла"
          value={formatMinutes(tickets.data?.avgCycleMinutes ?? null)}
          hint="принятие → выполнение"
          testId="kpi-tickets-cycle"
        />
        <KpiCard
          label="Расход материалов"
          value={formatMoney(consumption.data?.cost30d ?? 0)}
          unit="₽"
          hint="material-service · report_material_consumption_daily"
          testId="kpi-materials-cost"
          footer={
            consumption.data ? (
              <div className="flex gap-3 text-xs text-neutral-500">
                <span>операций {consumption.data.operations30d}</span>
                <span>объектов {consumption.data.objectsCount}</span>
              </div>
            ) : null
          }
        />
        <KpiCard
          label="Ниже порога"
          value={String(consumption.data?.lowStockCount ?? 0)}
          tone={(consumption.data?.lowStockCount ?? 0) > 0 ? 'warning' : 'success'}
          hint="позиции склада ниже минимального остатка"
          testId="kpi-materials-low-stock"
        />
        <KpiCard
          label="Явка персонала"
          value={formatPercent(staff.data?.attendanceRate ?? null)}
          tone={
            (staff.data?.attendanceRate ?? 100) >= 90
              ? 'success'
              : (staff.data?.attendanceRate ?? 100) >= 70
                ? 'warning'
                : 'danger'
          }
          hint="schedule-service · staff_control_totals"
          testId="kpi-staff-attendance"
          footer={
            staff.data ? (
              <div className="flex gap-3 text-xs text-neutral-500">
                <span>смен {staff.data.shiftsTotal}</span>
                <span>пропущено {staff.data.missedCount}</span>
              </div>
            ) : null
          }
        />
        <KpiCard
          label="Опозданий"
          value={String(staff.data?.lateCount ?? 0)}
          tone={(staff.data?.lateCount ?? 0) > 0 ? 'warning' : 'success'}
          hint="более 15 минут от планового начала"
          testId="kpi-staff-late"
        />
        <KpiCard
          label="Посещений объектов"
          value={String(geofences.data?.visitsCount ?? 0)}
          hint="gps-service · staff_geofence_control"
          testId="kpi-geofence-visits"
          footer={
            geofences.data ? (
              <div className="flex gap-3 text-xs text-neutral-500">
                <span>на объектах {formatMinutes(geofences.data.dwellMinutes)}</span>
                <span>точек {formatNumber(geofences.data.pointsCount)}</span>
              </div>
            ) : null
          }
        />
      </section>

      {kpiLoading && <LoadingBlock label="Считаем KPI…" />}

      {!kpiFailed && (
        <section className="grid gap-4 lg:grid-cols-2">
          <DashboardTicketsChart series={ticketSeries.data?.series ?? []} />
          <DashboardConsumptionChart series={consumptionSeries.data?.series ?? []} />
        </section>
      )}

      <Card className="flex flex-wrap items-center gap-4">
        {profile.isLoading && !display ? (
          <Spinner />
        ) : display ? (
          <>
            <div>
              <div className="text-sm font-medium text-neutral-900">{display.fullName}</div>
              <div className="text-xs text-neutral-500">{display.email}</div>
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {display.role}
            </span>
          </>
        ) : null}
        <div className="ml-auto text-xs text-neutral-400">
          Отчёты, таблицы и экспорт CSV — в разделе «Отчёты»
        </div>
      </Card>
    </div>
  );
}
