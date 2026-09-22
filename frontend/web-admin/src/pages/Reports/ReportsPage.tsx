import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import { GeofenceReport } from './GeofenceReport';
import { MaterialsReport } from './MaterialsReport';
import { StaffReport } from './StaffReport';
import { TicketsReport } from './TicketsReport';
import { defaultPeriod, useParamWriter } from './reportsHelpers';
import { useEmployeeOptions, useObjectOptions } from './useReports';

/**
 * Экран «Отчёты» (М7.1) — четыре отчёта одной страницы: расход материалов, выполнение
 * заявок, контроль персонала по сменам и контроль по геозонам/маршрутам.
 *
 * ПОЧЕМУ ВКЛАДКИ, А НЕ ЧЕТЫРЕ СТРАНИЦЫ. Отчёты смотрят вместе: «сколько потратили» и
 * «сколько заявок закрыли» — один разговор про один период. Вкладка и фильтры живут в
 * query-строке (`?tab=materials&from=…&to=…&objectId=…`), поэтому ссылку на конкретный
 * отчёт можно передать, а возврат назад восстанавливает отбор.
 *
 * ПОЧЕМУ ДАННЫЕ ИЗ ЧЕТЫРЁХ СЕРВИСОВ, А НЕ ИЗ ОДНОГО. У каждого сервиса своя БД
 * (`cleaning_ops_materials`, `cleaning_ops_tickets`, `cleaning_ops_schedule`,
 * `cleaning_ops_gps`), поэтому единое SQL-представление сквозь сервисы невозможно — это
 * факт схемы. Read-модели созданы внутри сервисов-владельцев (миграции М7.1), а страница
 * собирает их ответы через общую точку входа `/api/...` (nginx в стенде, тот же префикс в
 * прод-сборке). Запросы идут параллельно в одном рендере — отчёт открывается одним
 * запросом на вкладку, а не «по кнопке».
 *
 * Экспорт CSV есть у каждой таблицы: набор строк отчёта — это то, что уносят в Excel.
 */

type TabKey = 'materials' | 'tickets' | 'staff' | 'geofences';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'materials', label: 'Расход материалов' },
  { key: 'tickets', label: 'Выполнение заявок' },
  { key: 'staff', label: 'Контроль персонала' },
  { key: 'geofences', label: 'Геозоны и маршруты' },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'materials' || value === 'tickets' || value === 'staff' || value === 'geofences';
}

export function ReportsPage() {
  const [params] = useSearchParams();
  const write = useParamWriter();

  const tabParam = params.get('tab');
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'materials';

  // Период по умолчанию — последние 30 дней: то же окно, что у KPI дашборда.
  const fallback = useMemo(() => defaultPeriod(), []);
  const from = params.get('from') ?? fallback.from;
  const to = params.get('to') ?? fallback.to;
  const objectId = params.get('objectId') ?? '';
  const userId = params.get('userId') ?? '';

  const objects = useObjectOptions();
  // Справочник сотрудников доступен только ADMIN/SUPERVISOR (auth-service @Roles):
  // у оператора запрос не уходит, а в таблицах остаётся короткий id.
  // `useCanAssignTicket` повторяет `@Roles('ADMIN','SUPERVISOR')` на GET /api/users:
  // у оператора справочник сотрудников закрыт, и запрос за ним уходил бы в 403.
  const canReadEmployees = useCanAssignTicket();
  const employees = useEmployeeOptions({ enabled: canReadEmployees });

  const objectNames = useMemo(
    () => new Map((objects.data?.items ?? []).map((item) => [item.id, item.name])),
    [objects.data],
  );
  const employeeNames = useMemo(
    () =>
      new Map((employees.data?.items ?? []).map((item) => [item.id, item.fullName || item.email])),
    [employees.data],
  );

  /** Фильтры отчётов: пустые поля в query не уходят (иначе DTO получит пустую строку). */
  const rangeQuery = {
    ...(objectId ? { objectId } : {}),
    from,
    to,
  };
  const staffQuery = {
    ...rangeQuery,
    ...(userId ? { userId } : {}),
  };

  const periods = [
    { label: '7 дней', days: 7 },
    { label: '30 дней', days: 30 },
    { label: '90 дней', days: 90 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Отчёты"
        subtitle="Аналитика по объектам, заявкам и персоналу: read-модели сервисов за выбранный период."
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {periods.map((period) => (
              <Button
                key={period.days}
                variant="ghost"
                size="sm"
                data-testid={`report-period-${period.days}`}
                onClick={() => {
                  const next = defaultPeriod(period.days);
                  write({ from: next.from, to: next.to });
                }}
              >
                {period.label}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              data-testid="report-reset-filters"
              onClick={() => write({ objectId: null, userId: null, from: null, to: null })}
            >
              Сбросить фильтры
            </Button>
          </div>
        }
      />

      {/*
        На телефоне фильтры встают одной колонкой во всю ширину (`w-40`/`w-72`/`w-64`
        рядом не помещаются в 360 px). `max-md:[&>*]:w-full` растягивает прямых детей
        карточки — обёртки `Field`, а контролы внутри `Field` уже `w-full`.
      */}
      <Card className="flex flex-wrap items-end gap-4 max-md:[&>*]:w-full">
        <Field label="Период с" htmlFor="report-from">
          <Input
            id="report-from"
            data-testid="report-from"
            type="date"
            className="w-40"
            value={from}
            onChange={(event) => write({ from: event.target.value || null })}
          />
        </Field>
        <Field label="по" htmlFor="report-to">
          <Input
            id="report-to"
            data-testid="report-to"
            type="date"
            className="w-40"
            value={to}
            onChange={(event) => write({ to: event.target.value || null })}
          />
        </Field>
        <Field label="Объект" htmlFor="report-object">
          <Select
            id="report-object"
            data-testid="report-object"
            className="w-72"
            value={objectId}
            disabled={objects.isLoading}
            onChange={(event) => write({ objectId: event.target.value || null })}
          >
            <option value="">Все объекты</option>
            {(objects.data?.items ?? []).map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </Select>
        </Field>
        {tab === 'staff' || tab === 'geofences' ? (
          <Field label="Сотрудник" htmlFor="report-employee">
            <Select
              id="report-employee"
              data-testid="report-employee"
              className="w-64"
              value={userId}
              disabled={employees.isLoading}
              onChange={(event) => write({ userId: event.target.value || null })}
            >
              <option value="">Все сотрудники</option>
              {(employees.data?.items ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName || employee.email}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {/*
          Вкладки отчётов — четыре кнопки `size="sm"`: в 360 px они не помещаются,
          поэтому на телефоне лента вкладок скроллится по горизонтали внутри своего
          контейнера (страница по горизонтали не скроллится). `ml-auto` переехал на
          обёртку, чтобы на планшете и desktop вкладки остались прижатыми вправо.
        */}
        <div className="ml-auto max-md:ml-0 max-md:w-full max-md:overflow-x-auto">
          <nav
            className="flex flex-wrap gap-1 max-md:w-max max-md:flex-nowrap"
            aria-label="Отчёты"
          >
          {TABS.map((item) => (
            <Button
              key={item.key}
              variant={item.key === tab ? 'primary' : 'ghost'}
              size="sm"
              data-testid={`report-tab-${item.key}`}
              onClick={() => write({ tab: item.key })}
            >
              {item.label}
            </Button>
          ))}
          </nav>
        </div>
      </Card>

      {tab === 'materials' && (
        <MaterialsReport rangeQuery={rangeQuery} objectNames={objectNames} from={from} to={to} />
      )}
      {tab === 'tickets' && (
        <TicketsReport rangeQuery={rangeQuery} objectNames={objectNames} from={from} to={to} />
      )}
      {tab === 'staff' && (
        <StaffReport
          staffQuery={staffQuery}
          employeeNames={employeeNames}
          objectNames={objectNames}
          from={from}
          to={to}
        />
      )}
      {tab === 'geofences' && (
        <GeofenceReport
          staffQuery={staffQuery}
          employeeNames={employeeNames}
          objectNames={objectNames}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}
