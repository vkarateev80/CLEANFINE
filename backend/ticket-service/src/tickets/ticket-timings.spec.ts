import {
  addMinutes,
  MINUTE_MS,
  minutesBetween,
  reactionDeadline,
  timingUpdatesFor,
  type EscalationDurations,
} from './ticket-timings';

const DURATIONS: EscalationDurations = {
  newToAcceptMin: 5,
  acceptToArriveMin: 15,
  arriveToDoneMin: 60,
};

const NOW = new Date('2026-01-01T10:00:00.000Z');

describe('ticket-timings (М3.4/М3.5)', () => {
  it('addMinutes сдвигает время на минуты (в том числе дробные — e2e таймеры)', () => {
    expect(addMinutes(NOW, 5).toISOString()).toBe('2026-01-01T10:05:00.000Z');
    expect(addMinutes(NOW, 0.05).getTime() - NOW.getTime()).toBe(3_000);
    expect(MINUTE_MS).toBe(60_000);
  });

  it('minutesBetween считает полные минуты и не уходит в минус', () => {
    expect(minutesBetween(NOW, new Date('2026-01-01T10:07:30.000Z'))).toBe(7);
    // Дедлайн ещё не наступил — просрочки нет.
    expect(minutesBetween(NOW, new Date('2026-01-01T09:59:00.000Z'))).toBe(0);
  });

  it('reactionDeadline = created + ESCALATION_NEW_TO_ACCEPT_MIN', () => {
    expect(reactionDeadline(NOW, DURATIONS).toISOString()).toBe('2026-01-01T10:05:00.000Z');
  });

  describe('timingUpdatesFor', () => {
    it('assigned: первое принятие фиксируется, взводится дедлайн прибытия (15 мин)', () => {
      expect(timingUpdatesFor('assigned', NOW, DURATIONS, {})).toEqual({
        assignedAt: NOW,
        acceptedAt: NOW,
        reactionDeadline: null,
        arrivalDeadline: new Date('2026-01-01T10:15:00.000Z'),
      });
    });

    it('assigned: повторное назначение не теряет время первого принятия', () => {
      const firstAccepted = new Date('2026-01-01T09:30:00.000Z');

      expect(
        timingUpdatesFor('assigned', NOW, DURATIONS, { acceptedAt: firstAccepted }).acceptedAt,
      ).toBe(firstAccepted);
    });

    it('in_progress: фиксирует прибытие и дедлайн выполнения (60 мин)', () => {
      expect(timingUpdatesFor('in_progress', NOW, DURATIONS, {})).toEqual({
        arrivedAt: NOW,
        completionDeadline: new Date('2026-01-01T11:00:00.000Z'),
      });
    });

    it('in_progress: повторный вход сохраняет первое прибытие (возврат из overdue)', () => {
      const firstArrival = new Date('2026-01-01T09:40:00.000Z');

      expect(
        timingUpdatesFor('in_progress', NOW, DURATIONS, { arrivedAt: firstArrival }).arrivedAt,
      ).toBe(firstArrival);
    });

    it.each([['paused'], ['rejected']])('%s: тайминги не меняются', (status) => {
      expect(timingUpdatesFor(status as never, NOW, DURATIONS)).toEqual({});
    });

    it('completed: время выполнения + дедлайн снимается', () => {
      expect(timingUpdatesFor('completed', NOW, DURATIONS)).toEqual({
        completedAt: NOW,
        completionDeadline: null,
      });
    });

    it('verified: время проверки', () => {
      expect(timingUpdatesFor('verified', NOW, DURATIONS)).toEqual({ verifiedAt: NOW });
    });

    it('closed: время закрытия и снятие всех дедлайнов (терминальный статус)', () => {
      expect(timingUpdatesFor('closed', NOW, DURATIONS)).toEqual({
        closedAt: NOW,
        reactionDeadline: null,
        arrivalDeadline: null,
        completionDeadline: null,
      });
    });

    it('overdue: фиксирует просрочку и гасит дедлайны — сканер не сработает повторно', () => {
      expect(timingUpdatesFor('overdue', NOW, DURATIONS)).toEqual({
        overdueAt: NOW,
        reactionDeadline: null,
        arrivalDeadline: null,
        completionDeadline: null,
      });
    });
  });
});
