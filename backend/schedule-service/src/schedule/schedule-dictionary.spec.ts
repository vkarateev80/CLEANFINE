import { ScheduleEventStatus } from '@prisma/client';
import {
  SCHEDULE_EVENT_STATUSES,
  SCHEDULE_EVENT_STATUS_LABELS,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
} from '@cleaning-ops/shared/types/schedule';
import { FREQUENCIES, matchesRecurrence, normalizeRecurrence } from './recurrence';

/**
 * Защита от дрейфа словаря расписания.
 *
 * Значения статусов объявлены в prisma-схеме, подписи и частоты — в shared, а
 * сервис работает с обоими. Разойтись они могут молча: prisma-миграция добавит
 * статус, которого нет в shared, или наоборот — и пользователь увидит сырое
 * `CHECKED_IN` либо статус вообще выпадет из фильтра. Поэтому значения сравниваем
 * как МНОЖЕСТВА: порядок объявления в схеме и в shared — не часть контракта, а
 * состав значений — часть. Тест падает ровно тогда, когда одна сторона получила
 * новое или потеряла старое значение.
 */
describe('словарь расписания: shared ↔ prisma', () => {
  it('SCHEDULE_EVENT_STATUSES совпадает с enum ScheduleEventStatus из @prisma/client', () => {
    // Object.values, а не ключи: у prisma-энума ключ и значение совпадают, но
    // сверяем именно значения — ими оперируют БД и API.
    expect(new Set(Object.values(ScheduleEventStatus))).toEqual(new Set(SCHEDULE_EVENT_STATUSES));
  });

  it('FREQUENCIES сервиса совпадает со SCHEDULE_FREQUENCIES из shared', () => {
    expect(new Set(FREQUENCIES)).toEqual(new Set(SCHEDULE_FREQUENCIES));
  });

  it('каждому статусу и частоте соответствует локализованная подпись', () => {
    // Record<…> в shared проверяет это на компиляции; здесь — на случай `as`,
    // которым словарь можно расширить в обход типа.
    expect(Object.keys(SCHEDULE_EVENT_STATUS_LABELS).sort()).toEqual(
      [...SCHEDULE_EVENT_STATUSES].sort(),
    );
    expect(Object.keys(SCHEDULE_FREQUENCY_LABELS).sort()).toEqual([...SCHEDULE_FREQUENCIES].sort());
  });

  it('каждая частота из shared обрабатывается генерацией', () => {
    // Дата подобрана так, чтобы подошло правило любой частоты: для weekly в days
    // лежат все дни недели, для monthly dayOfMonth берётся из самой даты, daily
    // от даты не зависит. Новая частота в shared без ветки в matchesRecurrence
    // уронит этот тест.
    const date = new Date('2026-09-16T00:00:00.000Z');
    for (const frequency of SCHEDULE_FREQUENCIES) {
      const rule = normalizeRecurrence({
        frequency,
        time: '08:00',
        days: [1, 2, 3, 4, 5, 6, 7],
        dayOfMonth: date.getUTCDate(),
      });
      expect(rule).not.toBeNull();
      expect(matchesRecurrence(rule!, date)).toBe(true);
    }
  });

  it('частота вне shared-словаря отклоняется', () => {
    // Обратная сторона: сервис не должен принимать значения, которых нет в
    // shared, иначе контракт с админкой разъедется в другую сторону.
    expect(normalizeRecurrence({ frequency: 'yearly', time: '08:00' })).toBeNull();
  });
});
