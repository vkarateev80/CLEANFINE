import {
  addMinutes,
  MINUTE_MS,
  minutesBetween,
  reactionDeadline,
  statusOverrideUpdates,
  timingUpdatesFor,
  type EscalationDurations,
  type StatusOverrideSource,
} from './ticket-timings';

const DURATIONS: EscalationDurations = {
  newToAcceptMin: 5,
  acceptToArriveMin: 15,
  arriveToDoneMin: 60,
};

const NOW = new Date('2026-01-01T10:00:00.000Z');

describe('statusOverrideUpdates (ручной статус админа, 01.11.2026)', () => {
  const EARLIER = new Date('2025-12-31T10:00:00.000Z');
  const blank: StatusOverrideSource = {
    acceptedAt: null,
    arrivedAt: null,
    completedAt: null,
    verifiedAt: null,
    escalatedAt: null,
    plannedEnd: null,
  };
  const finished: StatusOverrideSource = {
    ...blank,
    acceptedAt: EARLIER,
    arrivedAt: EARLIER,
    completedAt: EARLIER,
    verifiedAt: EARLIER,
  };

  it('new: заявка как только что созданная, но без повторной эскалации', () => {
    expect(statusOverrideUpdates('new', NOW, DURATIONS, finished)).toEqual({
      assignedAt: null,
      acceptedAt: null,
      arrivedAt: null,
      completedAt: null,
      verifiedAt: null,
      closedAt: null,
      overdueAt: null,
      reactionDeadline: null,
      arrivalDeadline: null,
      completionDeadline: null,
      escalatedAt: NOW,
    });
  });

  it('assigned: шаги после назначения очищены, первое принятие сохранено', () => {
    expect(statusOverrideUpdates('assigned', NOW, DURATIONS, finished)).toEqual({
      assignedAt: NOW,
      acceptedAt: EARLIER,
      arrivedAt: null,
      completedAt: null,
      verifiedAt: null,
      closedAt: null,
      overdueAt: null,
      reactionDeadline: null,
      arrivalDeadline: new Date('2026-01-01T10:15:00.000Z'),
      completionDeadline: null,
    });
  });

  it('assigned у заявки смены: срок — конец смены, таймера прибытия нет', () => {
    const plannedEnd = new Date('2026-01-01T18:00:00.000Z');
    expect(
      statusOverrideUpdates('assigned', NOW, DURATIONS, { ...blank, plannedEnd }),
    ).toMatchObject({
      arrivalDeadline: null,
      completionDeadline: plannedEnd,
    });
  });

  it('in_progress: прибытие сохранено, срок выполнения взведён заново', () => {
    expect(statusOverrideUpdates('in_progress', NOW, DURATIONS, finished)).toMatchObject({
      arrivedAt: EARLIER,
      completedAt: null,
      closedAt: null,
      arrivalDeadline: null,
      completionDeadline: new Date('2026-01-01T11:00:00.000Z'),
    });
  });

  it('paused: дедлайн выполнения не меняет', () => {
    const update = statusOverrideUpdates('paused', NOW, DURATIONS, blank);
    expect(update).toMatchObject({ arrivedAt: NOW, completedAt: null });
    expect(update).not.toHaveProperty('completionDeadline');
  });

  it('completed и verified не переписывают уже случившееся', () => {
    expect(statusOverrideUpdates('completed', NOW, DURATIONS, finished)).toMatchObject({
      completedAt: EARLIER,
      verifiedAt: null,
      overdueAt: null,
    });
    expect(statusOverrideUpdates('verified', NOW, DURATIONS, finished)).toMatchObject({
      completedAt: EARLIER,
      verifiedAt: EARLIER,
      closedAt: null,
    });
    expect(statusOverrideUpdates('completed', NOW, DURATIONS, blank)).toMatchObject({
      completedAt: NOW,
    });
  });

  it('closed не трогает отметки выполнения, rejected и overdue их снимают', () => {
    expect(statusOverrideUpdates('closed', NOW, DURATIONS, finished)).toEqual({
      closedAt: NOW,
      reactionDeadline: null,
      arrivalDeadline: null,
      completionDeadline: null,
    });
    expect(statusOverrideUpdates('rejected', NOW, DURATIONS, finished)).toMatchObject({
      completedAt: null,
      verifiedAt: null,
      closedAt: null,
      overdueAt: null,
    });
    expect(statusOverrideUpdates('overdue', NOW, DURATIONS, finished)).toMatchObject({
      overdueAt: NOW,
      completedAt: null,
      closedAt: null,
    });
  });
});

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

    it('заявка смены: assigned без таймера прибытия, in_progress — срок до конца смены', () => {
      const plannedEnd = new Date('2026-01-01T23:00:00.000Z');

      expect(timingUpdatesFor('assigned', NOW, DURATIONS, { plannedEnd }).arrivalDeadline).toBeNull();
      expect(timingUpdatesFor('in_progress', NOW, DURATIONS, { plannedEnd })).toEqual({
        arrivedAt: NOW,
        completionDeadline: plannedEnd,
      });
    });

    it('заявка смены после конца смены (overdue → in_progress): обычные 60 минут, а не повторный overdue', () => {
      const plannedEnd = new Date('2026-01-01T09:00:00.000Z');

      expect(timingUpdatesFor('in_progress', NOW, DURATIONS, { plannedEnd }).completionDeadline).toEqual(
        new Date('2026-01-01T11:00:00.000Z'),
      );
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
