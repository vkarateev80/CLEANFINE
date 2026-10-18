import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/ui';
import {
  scheduleDateOf,
  scheduleDayLabelOf,
  scheduleTimeOf,
  timeZoneShortLabel,
  timeZoneTitle,
} from '@cleaning-ops/shared/types/time-zone';
import { currentTimeZone } from '../../stores/timeZoneStore';
import {
  SCHEDULE_EVENT_STATUS_LABELS,
  type ScheduleEventStatus,
  type ScheduleRecurrence,
} from '../../types/schedule';

/**
 * Локальные помощники экрана «Графики и смены» (М4.6): форматирование, разбор
 * ошибок axios, бейдж статуса смены и запись фильтров в query-строку. Общий
 * UI-кит живёт в `components/ui` и здесь не дублируется; утилиты экрана
 * «Материалы» тоже не переиспользуются импортом — это чужая feature-папка, и
 * связать экраны общим модулем можно только с согласия главной сессии.
 */

/** HTTP-статус ответа NestJS; `unknown`, потому что сюда попадает и Error, и ответ axios. */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

/** Короткий id для ссылок на чужие сервисы (объект, заявка, пользователь). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Сегодняшний день расписания. Не локальная зона браузера: сервис считает день
 * смены в поясе организации (`scheduleToday` в `recurrence.ts`), и админ в
 * другом поясе должен видеть тот же день, что генерирует сервис.
 */
export function scheduleToday(): string {
  return scheduleDateOf(new Date(), currentTimeZone());
}

/** Подпись пояса рядом со временем: «МСК», «UTC+6». */
export function timeZoneLabel(): string {
  return timeZoneShortLabel(currentTimeZone());
}

/** «Москва, Санкт-Петербург (UTC+3)» — для пояснений под таблицами и в форме. */
export function timeZoneDescription(): string {
  return timeZoneTitle(currentTimeZone());
}

/** "2026-03-14" → "14.03.2026" без `new Date()`: разбор строки без сдвига зоны. */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

/**
 * Время смены в поясе расписания. `plannedStart` приходит ISO в UTC; локальные
 * геттеры `Date` дали бы зону браузера и разошлись бы с тем, что задано в
 * графике (в форме — тоже время пояса расписания, см. `ScheduleFormModal`).
 */
export function scheduleTime(iso: string): string {
  return scheduleTimeOf(iso, currentTimeZone()) || '—';
}

/** Дата+время в поясе расписания: "14.03.2026 08:05 МСК". */
export function formatScheduleDateTime(iso: string): string {
  const timeZone = currentTimeZone();
  const time = scheduleTimeOf(iso, timeZone);
  return time ? `${scheduleDayLabelOf(iso, timeZone)} ${time} ${timeZoneShortLabel(timeZone)}` : '—';
}

// ── Правило повторения человеческим языком ─────────────────────────────────

/** Короткие подписи дней ISO (1 = Пн … 7 = Вс) — как в контракте `recurrence.days`. */
export const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
};

/**
 * Правило повторения текстом: «Пн, Ср, Пт · 08:00 МСК», «Ежедневно · 08:00 МСК»,
 * «15 числа · 09:30 МСК». Порядок частей фиксирован, чтобы колонка таблицы
 * читалась сверху вниз и её можно было проверять в e2e без хрупких селекторов.
 */
export function describeRecurrence(rule: ScheduleRecurrence): string {
  const time = `${rule.time} ${timeZoneLabel()}`;
  if (rule.frequency === 'daily') {
    return `Ежедневно · ${time}`;
  }
  if (rule.frequency === 'weekly') {
    const days = (rule.days ?? [])
      .slice()
      .sort((left, right) => left - right)
      .map((day) => WEEKDAY_SHORT[day] ?? String(day))
      .join(', ');
    return `${days === '' ? 'Дни недели не заданы' : days} · ${time}`;
  }
  // monthly: сервис допускает задание числа через days[0] (см. `dayOfMonthRule`),
  // поэтому в подписи показываем то же значение, что реально использует генерация.
  const dayOfMonth = rule.dayOfMonth ?? rule.days?.[0];
  return dayOfMonth === undefined
    ? `Число месяца не задано · ${time}`
    : `${dayOfMonth} числа · ${time}`;
}

// ── Бейдж статуса смены ────────────────────────────────────────────────────

const EVENT_TONES: Record<ScheduleEventStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  PLANNED: 'neutral',
  CHECKED_IN: 'info',
  CHECKED_OUT: 'success',
  MISSED: 'danger',
};

/** Статус смены: подпись из словаря `types/schedule.ts`, тон — представление экрана. */
export function EventStatusBadge({ status }: { status: ScheduleEventStatus }) {
  return <Badge tone={EVENT_TONES[status]}>{SCHEDULE_EVENT_STATUS_LABELS[status]}</Badge>;
}

// ── Фильтры в query-строке ─────────────────────────────────────────────────

/**
 * Запись фильтров в URL. Фильтры экрана живут в query-строке, как в списке
 * объектов, заявок и материалов: ссылку на конкретный отбор можно передать
 * коллеге, а возврат назад восстанавливает состояние. Префиксы параметров у
 * вкладок разные (`list…`, `day…`, `my…`), поэтому переключение вкладок не
 * сбрасывает чужой отбор.
 */
export function useParamWriter() {
  const [, setParams] = useSearchParams();

  return useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
}

// ── Геолокация браузера ────────────────────────────────────────────────────

export type Coords = { lat: number; lng: number };

/**
 * Координаты из браузера. Промис НИКОГДА не отклоняется: отказ в доступе, таймаут
 * и отсутствие `navigator.geolocation` — это ожидаемые ветки интерфейса (покажем
 * текст и дадим ввести координаты руками), а не падение экрана. Именно поэтому
 * здесь не пробрасывается ошибка наверх.
 */
export function currentPosition(): Promise<Coords | { error: string }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ error: 'Браузер не поддерживает геолокацию' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => resolve({ error: geolocationErrorText(error) }),
      // Таймаут 10 с: у мобильных браузеров без разрешения ответа не приходит
      // вовсе, и без него кнопка «Отметить приход» зависла бы навсегда.
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

/** Текст отказа: коды `GeolocationPositionError` (1 — запрет, 2 — нет данных, 3 — таймаут). */
export function geolocationErrorText(error: { code?: number; message?: string }): string {
  switch (error.code) {
    case 1:
      return 'Доступ к геолокации запрещён. Разрешите его в браузере или введите координаты вручную.';
    case 2:
      return 'Не удалось определить местоположение. Введите координаты вручную.';
    case 3:
      return 'Определение местоположения заняло слишком много времени. Введите координаты вручную.';
    default:
      return error.message ?? 'Геолокация недоступна. Введите координаты вручную.';
  }
}
