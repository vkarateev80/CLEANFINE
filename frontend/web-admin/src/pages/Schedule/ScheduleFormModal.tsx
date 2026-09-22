import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSchedule, updateSchedule } from '../../api/schedule';
import {
  Button,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  Modal,
  Select,
  SoftWarning,
} from '../../components/ui';
import type { ObjectEntity } from '../../types/core';
import {
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
  type CreateSchedulePayload,
  type ScheduleEntity,
  type ScheduleFrequency,
  type UpdateSchedulePayload,
} from '../../types/schedule';
import type { SessionUser } from '../../types';
import { shortId, WEEKDAY_SHORT } from './scheduleHelpers';
import { useRouteOptions } from './useSchedule';

/**
 * Форма графика (М4.6): создание и правка одной модалкой.
 *
 * Поля повторяют `CreateScheduleDto` schedule-service. Доменные правила
 * «weekly требует days, monthly требует dayOfMonth» продублированы на клиенте
 * (`ScheduleService.assertRecurrence`) — но только чтобы не гонять заведомо
 * неверный запрос: серверные проверки НЕ подменяются, и текст 400 из API
 * показывается в `ErrorBanner` как есть.
 *
 * Время — `input type="time"` и трактуется как UTC: schedule-service хранит
 * расписание в UTC (`recurrence.ts`: «перевод в локальную зону объекта — задача
 * клиента»), поэтому подпись «UTC» стоит прямо у поля, а не в справке.
 */

interface FormState {
  name: string;
  objectId: string;
  /** Привязанный маршрут; пустая строка — «без маршрута» (как `objectId`). */
  routeId: string;
  frequency: ScheduleFrequency;
  /** Отмеченные дни ISO 1..7 (только для weekly), в виде строк — так их удобно сравнивать с чекбоксами. */
  days: string[];
  dayOfMonth: string;
  time: string;
  assignees: string[];
  isActive: boolean;
}

type Errors = Partial<Record<'name' | 'time' | 'days' | 'dayOfMonth' | 'assignees', string>>;

/**
 * Полезная нагрузка формы. От `CreateSchedulePayload` отличается двумя
 * колонками-привязками: при снятии привязки нужно отправить `null` (в
 * `UpdateScheduleDto` это единственный способ очистить поле, ровно как
 * `supplier: null` в material-service), а тип пейлоада описывает только рабочие
 * значения. Оба поля исключены из `Omit` по отдельности: пересечение с
 * `string` не оставило бы `null` в типе.
 */
type FormPayload = Omit<CreateSchedulePayload, 'objectId' | 'routeId'> & {
  objectId?: string | null;
  routeId?: string | null;
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

function emptyForm(): FormState {
  return {
    name: '',
    objectId: '',
    routeId: '',
    frequency: 'daily',
    days: [],
    dayOfMonth: '',
    time: '08:00',
    assignees: [],
    isActive: true,
  };
}

function formFrom(schedule: ScheduleEntity | null): FormState {
  if (!schedule) return emptyForm();
  const rule = schedule.recurrence;
  return {
    name: schedule.name,
    objectId: schedule.objectId ?? '',
    routeId: schedule.routeId ?? '',
    frequency: rule.frequency,
    days: (rule.days ?? []).map((day) => String(day)),
    // Сервис допускает monthly, заданный через days[0] (`dayOfMonthRule`),
    // поэтому при открытии правки показываем то же число, что использует генерация.
    dayOfMonth:
      rule.dayOfMonth !== undefined
        ? String(rule.dayOfMonth)
        : rule.days && rule.days.length > 0
          ? String(rule.days[0])
          : '',
    time: rule.time,
    assignees: [...schedule.assignees],
    isActive: schedule.isActive,
  };
}

export function ScheduleFormModal({
  open,
  /** `null` — создание, иначе правка выбранного графика. */
  schedule,
  objects,
  users,
  onClose,
  onSaved,
}: {
  open: boolean;
  schedule: ScheduleEntity | null;
  objects: ObjectEntity[];
  users: SessionUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormState>(() => formFrom(schedule));
  const [errors, setErrors] = useState<Errors>({});
  /**
   * Трогали ли селект маршрута. Без этого флага PATCH отправлял бы `routeId`
   * каждой правкой формы: отсутствие поля в `UpdateScheduleDto` означает
   * «не менять», поэтому переименование графика не должно касаться привязки.
   */
  const [routeTouched, setRouteTouched] = useState(false);
  // Маршруты грузим по объекту графика: с объектом — только его маршруты, без
  // объекта — все (первая сотня). Серверный фильтр здесь обязателен: маршрут
  // другого объекта в графике — это смена уборщика не на том адресе.
  const routes = useRouteOptions(values.objectId);

  const save = useMutation({
    mutationFn: (payload: FormPayload) =>
      schedule
        ? // `routeId: null` (осознанный сброс привязки) — валидное значение для
          // `UpdateScheduleDto`: `@IsOptional()` пропускает null, а сервис меняет
          // поле, только если оно пришло (`!== undefined`). Приведение типа нужно
          // потому, что `UpdateSchedulePayload` объявляет `routeId?: string` и
          // `null` в нём пока не описан — правка типа лежит в `types/schedule.ts`,
          // вне зоны этой задачи.
          updateSchedule(schedule.id, payload as UpdateSchedulePayload)
        : createSchedule(payload as CreateSchedulePayload),
    onSuccess: async () => {
      // Инвалидация всего `['schedule']`: меняется и список графиков, и подпись
      // объекта в уже сгенерированных сменах.
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      onSaved();
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    save.reset();
  }

  function toggleDay(day: number) {
    const raw = String(day);
    update(
      'days',
      values.days.includes(raw)
        ? values.days.filter((item) => item !== raw)
        : [...values.days, raw],
    );
  }

  function toggleAssignee(id: string) {
    update(
      'assignees',
      values.assignees.includes(id)
        ? values.assignees.filter((item) => item !== id)
        : [...values.assignees, id],
    );
  }

  function handleSubmit() {
    const next: Errors = {};
    const name = values.name.trim();
    const time = values.time.trim();
    if (name === '') next.name = 'Укажите название графика';
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) next.time = 'Время в формате ЧЧ:ММ';
    if (values.assignees.length === 0) next.assignees = 'Укажите хотя бы одного исполнителя';

    const days = values.days
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day))
      .sort((left, right) => left - right);
    if (values.frequency === 'weekly' && days.length === 0) {
      next.days = 'Для недельного графика отметьте хотя бы один день';
    }

    const dayOfMonth = values.dayOfMonth.trim() === '' ? undefined : Number(values.dayOfMonth);
    if (values.frequency === 'monthly') {
      if (dayOfMonth === undefined || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        next.dayOfMonth = 'Число месяца — целое от 1 до 31';
      }
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const payload: FormPayload = {
      name,
      recurrence: {
        frequency: values.frequency,
        time,
        // `days` отправляем только weekly, `dayOfMonth` — только monthly: лишние
        // поля сервис примет, но в JSON-колонке остался бы мусор от прежней частоты.
        ...(values.frequency === 'weekly' ? { days } : {}),
        ...(values.frequency === 'monthly' && dayOfMonth !== undefined ? { dayOfMonth } : {}),
      },
      assignees: values.assignees,
      isActive: values.isActive,
      // Объект очищается ЯВНЫМ `null`: в `UpdateScheduleDto` отсутствие поля
      // означает «не менять», поэтому пустая строка не убрала бы привязку. На
      // создании поле просто не отправляем — колонка и так пустая.
      ...(values.objectId === '' ? (schedule ? { objectId: null } : {}) : { objectId: values.objectId }),
      // Маршрут уходит в запрос ТОЛЬКО если селект трогали. Пустое значение не
      // отправляется вовсе: сброс привязки — это осознанный выбор пункта «Без
      // маршрута», который кодируется `null` (отсутствие поля = «не менять»).
      ...(routeTouched
        ? { routeId: values.routeId === '' ? null : values.routeId }
        : {}),
    };

    save.mutate(payload);
  }

  function handleClose() {
    setValues(formFrom(schedule));
    setErrors({});
    setRouteTouched(false);
    save.reset();
    onClose();
  }

  /** Исполнитель, которого нет в справочнике (уволен/деактивирован): снять отметку нельзя, но и молча потерять его нельзя. */
  const unknownAssignees = values.assignees.filter(
    (id) => !users.some((user) => user.id === id),
  );

  const routeItems = routes.data?.items ?? [];
  /** Привязка графика: могла не попасть в выборку (другой объект, за пределами сотни). */
  const currentRouteId = schedule?.routeId ?? '';
  const currentRouteMissing =
    currentRouteId !== '' && !routeItems.some((route) => route.id === currentRouteId);

  return (
    <Modal
      open={open}
      title={schedule ? 'График' : 'Новый график'}
      size="lg"
      busy={save.isPending}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={save.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="schedule-submit"
            loading={save.isPending}
            onClick={handleSubmit}
          >
            {schedule ? 'Сохранить' : 'Создать график'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="schedule-form">
        {save.isError ? <ErrorBanner error={save.error} /> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Название" htmlFor="schedule-name" required error={errors.name}>
            <Input
              id="schedule-name"
              data-testid="schedule-name"
              value={values.name}
              invalid={Boolean(errors.name)}
              placeholder="Ежедневная уборка офиса"
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>

          <Field
            label="Объект"
            htmlFor="schedule-object"
            hint="Необязательно: без объекта смены создаются, а плановые заявки — нет"
          >
            <Select
              id="schedule-object"
              data-testid="schedule-object"
              value={values.objectId}
              onChange={(event) => update('objectId', event.target.value)}
            >
              <option value="">Без объекта</option>
              {objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Частота" htmlFor="schedule-frequency" required>
            <Select
              id="schedule-frequency"
              data-testid="schedule-frequency"
              value={values.frequency}
              onChange={(event) => update('frequency', event.target.value as ScheduleFrequency)}
            >
              {SCHEDULE_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {SCHEDULE_FREQUENCY_LABELS[frequency]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Время начала, UTC"
            htmlFor="schedule-time"
            required
            error={errors.time}
            hint="Хранится как UTC: локальное время объекта сервис не знает"
          >
            <Input
              id="schedule-time"
              data-testid="schedule-time"
              type="time"
              // На телефоне поле на всю ширину: фиксированные 160 px рядом с
              // одноколоночной сеткой выглядят обрезанными.
              className="w-40 font-mono max-md:w-full"
              value={values.time}
              invalid={Boolean(errors.time)}
              onChange={(event) => update('time', event.target.value)}
            />
          </Field>
        </div>

        {values.frequency === 'weekly' && (
          <fieldset
            data-testid="schedule-days"
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3"
          >
            <legend className="px-1 text-sm text-neutral-500">Дни недели</legend>
            <div className="flex flex-wrap gap-4">
              {ALL_DAYS.map((day) => (
                <Checkbox
                  key={day}
                  data-testid={`schedule-days-${day}`}
                  label={WEEKDAY_SHORT[day]}
                  checked={values.days.includes(String(day))}
                  onChange={() => toggleDay(day)}
                />
              ))}
            </div>
            {errors.days && <span className="text-xs text-danger-600">{errors.days}</span>}
          </fieldset>
        )}

        {values.frequency === 'monthly' && (
          <Field
            label="Число месяца"
            htmlFor="schedule-day-of-month"
            required
            error={errors.dayOfMonth}
            hint="1..31; в месяцах без такого числа смена не создаётся — правило сервиса"
          >
            <Input
              id="schedule-day-of-month"
              data-testid="schedule-day-of-month"
              className="w-24 font-mono max-md:w-full"
              inputMode="numeric"
              value={values.dayOfMonth}
              invalid={Boolean(errors.dayOfMonth)}
              placeholder="15"
              onChange={(event) => update('dayOfMonth', event.target.value)}
            />
          </Field>
        )}

        <fieldset
          data-testid="schedule-assignees"
          className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3"
        >
          <legend className="px-1 text-sm text-neutral-500">
            Исполнители<span className="text-danger-600"> *</span>
          </legend>
          {users.length === 0 ? (
            <span className="text-xs text-neutral-400">Справочник сотрудников пуст</span>
          ) : (
            <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
              {users.map((user) => (
                <Checkbox
                  key={user.id}
                  data-testid={`schedule-assignee-${user.id}`}
                  label={`${user.fullName} · ${user.role}`}
                  checked={values.assignees.includes(user.id)}
                  onChange={() => toggleAssignee(user.id)}
                />
              ))}
            </div>
          )}
          {unknownAssignees.length > 0 && (
            <SoftWarning>
              В графике есть исполнители, которых нет в активном справочнике:{' '}
              <span className="font-mono">{unknownAssignees.map((id) => id.slice(0, 8)).join(', ')}</span>.
              Они сохранятся, если не снимать отметку.
            </SoftWarning>
          )}
          {errors.assignees && <span className="text-xs text-danger-600">{errors.assignees}</span>}
        </fieldset>

        <Checkbox
          data-testid="schedule-active"
          label="График активен (по нему генерируются смены)"
          checked={values.isActive}
          onChange={(event) => update('isActive', event.target.checked)}
        />

        {/*
          Маршрут — необязательная привязка графика. Список приходит из
          `GET /api/routes` (плоский список): по этажу маршрут не выбрать, этаж в
          графике не хранится. При выбранном объекте показываются только его
          маршруты — иначе в график можно было бы записать маршрут чужого объекта.

          Текущая привязка выводится отдельным пунктом, если её нет в выборке
          (другой объект, за пределами первой сотни): так правка других полей не
          теряет маршрут молча. Снять привязку можно пунктом «Без маршрута» —
          это осознанное действие, и только оно отправляет в PATCH `null`.
        */}
        <Field
          label="Маршрут"
          htmlFor="schedule-route"
          hint={
            values.objectId === ''
              ? 'Необязательно: показаны маршруты всех объектов (первая сотня)'
              : 'Необязательно: показаны маршруты выбранного объекта'
          }
        >
          <Select
            id="schedule-route"
            data-testid="schedule-route"
            value={values.routeId}
            onChange={(event) => {
              // Флаг «трогали»: без него правка названия не должна переписывать
              // привязку, а сброс — не должен происходить сам собой.
              setRouteTouched(true);
              update('routeId', event.target.value);
            }}
          >
            <option value="">Без маршрута</option>
            {routeItems.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
            {currentRouteMissing && (
              <option value={currentRouteId}>Текущий маршрут {shortId(currentRouteId)}</option>
            )}
          </Select>
        </Field>

        {routes.isError && (
          <SoftWarning>
            Список маршрутов не загрузился (core-service): привязка маршрута сохранится как есть.
          </SoftWarning>
        )}

        {currentRouteMissing && values.objectId !== '' && (
          <SoftWarning>
            Маршрут графика не найден среди маршрутов выбранного объекта — сохранится как есть,
            пока вы не выберете другой.
          </SoftWarning>
        )}
      </div>
    </Modal>
  );
}
