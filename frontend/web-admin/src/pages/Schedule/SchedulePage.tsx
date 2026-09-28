import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input, PageHeader } from '../../components/ui';
import { useCanManageSchedule, useIsScheduleAdmin } from '../../hooks/usePermissions';
import { useAuthStore } from '../../stores/authStore';
import { DayEventsPanel } from './DayEventsPanel';
import { MyEventsPanel } from './MyEventsPanel';
import { SchedulesPanel } from './SchedulesPanel';
import { todayUtc, useParamWriter } from './scheduleHelpers';
import {
  useCheckMissed,
  useDayEvents,
  useGenerateDay,
  useMyEvents,
  useObjectOptions,
  useSchedules,
  useSchedulerState,
  useUserOptions,
} from './useSchedule';

/**
 * Экран «Графики и смены» (М4.6) — три вкладки одного раздела:
 *  • «Графики» — правила повторения: что, когда и кем выполняется;
 *  • «Смены дня» — что сгенерировано на конкретный день и чем закончилось;
 *  • «Мои смены» — смены текущего пользователя за период и отметка прихода/ухода.
 *
 * Вкладка и все фильтры живут в query-строке (`?tab=day&dayDate=…`), как в
 * «Материалах»: ссылку на конкретный день можно передать коллеге, а возврат
 * назад восстанавливает состояние. Ключи параметров у вкладок разные
 * (`list…`, `day…`, `my…`), поэтому переключение вкладок не сбрасывает чужой
 * отбор.
 *
 * Права — по фактическим `@Roles` schedule-service (см. `usePermissions.ts`):
 * чтение (графики, смены дня, свои смены) открыто всем авторизованным, правка
 * графиков — ADMIN/SUPERVISOR, отметка смены — ADMIN/SUPERVISOR/OPERATOR,
 * ручные триггеры (`/generate`, `/check-missed`) и состояние планировщика —
 * только ADMIN. Поэтому раздел не закрыт RoleGuard'ом в роутере, а кнопки внутри
 * зависят от роли.
 */

type TabKey = 'list' | 'day' | 'my';

const TABS: Array<{ key: TabKey; label: string; testId: string }> = [
  { key: 'list', label: 'Графики', testId: 'schedule-tab-list' },
  { key: 'day', label: 'Смены дня', testId: 'schedule-tab-day' },
  { key: 'my', label: 'Мои смены', testId: 'schedule-tab-my' },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'list' || value === 'day' || value === 'my';
}

export function SchedulePage() {
  const [params, setParams] = useSearchParams();
  const write = useParamWriter();

  const canManage = useCanManageSchedule();
  const isAdmin = useIsScheduleAdmin();
  const currentUser = useAuthStore((state) => state.user);

  const tabParam = params.get('tab');
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'list';

  // ── параметры вкладки «Графики» ──────────────────────────────────────────
  const listSearch = params.get('listSearch') ?? '';

  // ── параметры вкладки «Смены дня» ────────────────────────────────────────
  // Дата по умолчанию — сегодня UTC: сервис хранит день смены как полночь UTC,
  // и локальная «сегодня» браузера разошлась бы с тем, что генерирует сервис.
  const dayDate = params.get('dayDate') ?? todayUtc();
  const dayObject = params.get('dayObject') ?? '';
  const dayUser = params.get('dayUser') ?? '';
  const schedulerOpen = params.get('dayScheduler') === '1';

  // ── параметры вкладки «Мои смены» ────────────────────────────────────────
  const myFrom = params.get('myFrom') ?? todayUtc();
  const myTo = params.get('myTo') ?? todayUtc();
  const myEvent = params.get('myEvent') ?? '';

  /** Сообщение после отметки смены: живёт до следующего действия или закрытия. */
  const [checkNotice, setCheckNotice] = useState<string | null>(null);

  // Общие справочники: объекты нужны всем вкладкам, сотрудники — только тем, где
  // есть выбор исполнителя (`/api/users` закрыт для OPERATOR/CLIENT, поэтому
  // запрос включается по праву, а не всегда).
  const objects = useObjectOptions();
  const users = useUserOptions(canManage);

  const schedules = useSchedules();
  const dayEvents = useDayEvents({
    date: dayDate,
    ...(dayObject === '' ? {} : { objectId: dayObject }),
    ...(dayUser === '' ? {} : { userId: dayUser }),
  });
  const myEvents = useMyEvents({
    ...(myFrom === '' ? {} : { from: myFrom }),
    ...(myTo === '' ? {} : { to: myTo }),
  });

  const generate = useGenerateDay();
  const checkMissed = useCheckMissed();
  const scheduler = useSchedulerState(isAdmin);

  function selectTab(next: TabKey) {
    setParams(
      (current) => {
        const paramsNext = new URLSearchParams(current);
        if (next === 'list') paramsNext.delete('tab');
        else paramsNext.set('tab', next);
        return paramsNext;
      },
      { replace: true },
    );
  }

  /** Поиск по названию графика: сервис фильтра не умеет, поэтому фильтруем на клиенте. */
  const filteredSchedules = schedules.data?.filter((schedule) =>
    listSearch === ''
      ? true
      : schedule.name.toLowerCase().includes(listSearch.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Графики и смены"
        subtitle="Правила повторения, смены на день и отметка своего прихода и ухода"
        actions={
          <>
            {tab === 'list' && canManage && (
              <span className="text-xs text-neutral-400">
                Правка графиков доступна ADMIN и SUPERVISOR
              </span>
            )}
          </>
        }
      />

      {/*
        Три вкладки на телефоне шире 360 px: лента вкладок получает собственный
        горизонтальный скролл (`min-w-0` у родителя обязателен, иначе flex-элемент
        не сожмётся и переполнит страницу). На ≥768 px правила `max-md:` не
        действуют — прежний перенос `flex-wrap` и та же высота вкладок.
      */}
      <div className="min-w-0 max-md:overflow-x-auto max-md:pb-px">
        <div
          className="flex flex-wrap gap-2 border-b border-neutral-200 max-md:w-max max-md:flex-nowrap"
          role="tablist"
        >
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={item.testId}
                onClick={() => selectTab(item.key)}
                className={[
                  // `max-lg:min-h-[44px]` — тач-таргет вкладки ≥44 px на телефоне и
                  // планшете; desktop (≥1024) сохраняет прежнюю высоту.
                  '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors max-lg:min-h-[44px]',
                  active
                    ? 'border-primary-500 font-medium text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800',
                ].join(' ')}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'list' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/*
              Поиск по названию — на клиенте: у `GET /api/schedule` параметра
              поиска нет, список отдаётся целиком. Показывать поле серверного
              поиска (как в «Материалах») здесь было бы обманом: запрос уходил бы
              без фильтра, а выдача не менялась.
            */}
            <Input
              data-testid="schedule-search"
              aria-label="Поиск по названию графика"
              // На телефоне поиск занимает всю ширину: `w-72` рядом со счётчиком
              // «Найдено» не помещается в 360 px.
              className="w-72 max-md:w-full"
              placeholder="Поиск по названию графика"
              value={listSearch}
              onChange={(event) => write({ listSearch: event.target.value || null })}
            />
            <span className="text-xs text-neutral-400">
              Найдено: {filteredSchedules?.length ?? 0}
            </span>
          </div>
          <SchedulesPanel
            schedules={filteredSchedules}
            isLoading={schedules.isLoading}
            error={schedules.error}
            isFetching={schedules.isFetching}
            isRefetchError={schedules.isRefetchError}
            onRetry={() => void schedules.refetch()}
            objects={objects.data?.items ?? []}
            users={users.data?.items ?? []}
          />
        </div>
      )}

      {tab === 'day' && (
        <DayEventsPanel
          date={dayDate}
          objectId={dayObject}
          userId={dayUser}
          objects={objects.data?.items ?? []}
          users={users.data?.items ?? []}
          canFilterByUser={canManage}
          events={dayEvents.data}
          isLoading={dayEvents.isLoading}
          error={dayEvents.error}
          isFetching={dayEvents.isFetching}
          isRefetchError={dayEvents.isRefetchError}
          onRetry={() => void dayEvents.refetch()}
          onParamChange={write}
          generate={{ mutate: (date) => generate.mutate(date), isPending: generate.isPending }}
          checkMissed={{
            mutate: (date) => checkMissed.mutate(date),
            isPending: checkMissed.isPending,
          }}
          generateError={generate.isError ? generate.error : null}
          checkMissedError={checkMissed.isError ? checkMissed.error : null}
          generation={generate.isSuccess ? generate.data : null}
          missed={checkMissed.isSuccess ? checkMissed.data : null}
          schedulerState={scheduler.data}
          schedulerOpen={schedulerOpen}
          schedulerPending={schedulerOpen && scheduler.isLoading}
          schedulerError={schedulerOpen && scheduler.isError ? scheduler.error : null}
          onToggleScheduler={() => write({ dayScheduler: schedulerOpen ? null : '1' })}
        />
      )}

      {tab === 'my' && (
        <MyEventsPanel
          from={myFrom}
          to={myTo}
          selectedId={myEvent}
          objects={objects.data?.items ?? []}
          users={users.data?.items ?? []}
          currentUserId={currentUser?.id ?? null}
          events={myEvents.data}
          isLoading={myEvents.isLoading}
          error={myEvents.error}
          isFetching={myEvents.isFetching}
          isRefetchError={myEvents.isRefetchError}
          onRetry={() => void myEvents.refetch()}
          onParamChange={write}
          notice={checkNotice}
          onNotice={setCheckNotice}
          onNoticeDismiss={() => setCheckNotice(null)}
        />
      )}

      <p className="text-xs text-neutral-400">
        Время в графиках и сменах — UTC: schedule-service хранит расписание без привязки к локальной
        зоне объекта, поэтому «08:00» означает 08:00 UTC.
      </p>
    </div>
  );
}
