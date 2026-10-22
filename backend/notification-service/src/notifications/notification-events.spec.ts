import { EVENT_QUEUES, ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { NOTIFICATION_ROUTING_KEYS, resolveEvent, isAssignedOnCreate } from './notification-events';

describe('NOTIFICATION_ROUTING_KEYS', () => {
  it('слушает все очереди EVENT_QUEUES, кроме material.ticket.operation.completed', () => {
    expect([...NOTIFICATION_ROUTING_KEYS]).toEqual([
      'ticket.created',
      'ticket.assigned',
      'ticket.emergency',
      'ticket.overdue',
      'geofence.exit',
      'material.low',
      'schedule.missed_checkin',
      'ticket.status_changed',
    ]);

    // Контракт — источник истины: новую очередь в EVENT_QUEUES нельзя забыть
    // здесь, иначе события молча копятся в брокере без получателя.
    const notificationQueues = Object.entries(EVENT_QUEUES)
      .filter(([, queue]) => queue !== 'material.ticket.operation.completed')
      .map(([routingKey]) => routingKey)
      .sort();
    expect([...NOTIFICATION_ROUTING_KEYS].sort()).toEqual(notificationQueues);

    // Имя очереди не дублируется в коде сервиса: оно берётся из общего контракта.
    expect(EVENT_QUEUES[ROUTING_KEYS.TICKET_EMERGENCY]).toBe('notification.ticket.emergency');
    expect(EVENT_QUEUES[ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN]).toBe(
      'notification.schedule.missed_checkin',
    );
  });
});

describe('resolveEvent', () => {
  describe('ticket.created / ticket.assigned', () => {
    it('ticket.created → NEW_TICKET назначенному исполнителю', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_CREATED, {
        ticketId: 't-1',
        assigneeId: 'u-1',
        description: 'Помыть 3 этаж',
      });

      expect(resolved).toEqual({
        routingKey: 'ticket.created',
        template: 'NEW_TICKET',
        userIds: ['u-1'],
        params: { ticketDescription: 'Помыть 3 этаж' },
        data: { ticketId: 't-1' },
      });
    });

    it('ticket.created с окном смены (schedule-service) → тихое NEW_TICKET: только in-app', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_CREATED, {
        ticketId: 't-5',
        assigneeId: 'u-1',
        description: 'Плановая уборка по графику «Уборка1» на 2026-10-22 18:00 МСК',
        plannedStart: '2026-10-22T15:00:00.000Z',
        plannedEnd: '2026-10-22T23:00:00.000Z',
      });

      expect(resolved).toMatchObject({
        template: 'NEW_TICKET',
        userIds: ['u-1'],
        quiet: true,
        data: {
          ticketId: 't-5',
          plannedStart: '2026-10-22T15:00:00.000Z',
          plannedEnd: '2026-10-22T23:00:00.000Z',
        },
      });
    });

    it('ticket.assigned при создании (onCreate) распознаётся как дубль ticket.created', () => {
      expect(
        isAssignedOnCreate(ROUTING_KEYS.TICKET_ASSIGNED, { ticketId: 't-1', assigneeId: 'u-1', onCreate: true }),
      ).toBe(true);
      expect(isAssignedOnCreate(ROUTING_KEYS.TICKET_ASSIGNED, { ticketId: 't-1', assigneeId: 'u-1' })).toBe(false);
      expect(isAssignedOnCreate(ROUTING_KEYS.TICKET_CREATED, { onCreate: true })).toBe(false);
    });

    it('ticket.created без description подставляет номер заявки', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_CREATED, {
        ticketId: 't-2',
        assigneeId: 'u-1',
      });

      expect(resolved?.params).toEqual({ ticketDescription: 'Заявка t-2' });
    });

    it.each([
      ['без assigneeId', { ticketId: 't-1' }],
      ['без ticketId', { assigneeId: 'u-1' }],
      ['с пустым assigneeId', { ticketId: 't-1', assigneeId: '' }],
    ])('ticket.created %s → null (контракт нарушен)', (_title, payload) => {
      // Повторная доставка не поможет: сообщение отбрасывается, а не ретраится.
      expect(resolveEvent(ROUTING_KEYS.TICKET_CREATED, payload)).toBeNull();
    });

    it('ticket.assigned → NEW_TICKET с номером заявки вместо описания', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_ASSIGNED, {
        ticketId: 't-5',
        assigneeId: 'u-9',
      });

      expect(resolved?.template).toBe('NEW_TICKET');
      expect(resolved?.userIds).toEqual(['u-9']);
      expect(resolved?.params).toEqual({ ticketDescription: 'Заявка t-5' });
      expect(resolved?.data).toEqual({ ticketId: 't-5' });
    });

    it('ticket.assigned без ticketId → null', () => {
      expect(resolveEvent(ROUTING_KEYS.TICKET_ASSIGNED, { assigneeId: 'u-9' })).toBeNull();
    });
  });

  describe('ticket.emergency', () => {
    it('явные получатели из payload (userIds + assigneeId, без дублей)', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_EMERGENCY, {
        ticketId: 't-3',
        type: 'Затопление',
        objectName: 'БЦ «Северный»',
        floor: '3 этаж',
        lat: 55.75,
        lng: 37.61,
        userIds: ['u-2'],
        assigneeId: 'u-1',
      });

      expect(resolved?.template).toBe('EMERGENCY');
      expect(resolved?.userIds).toEqual(['u-2', 'u-1']);
      expect(resolved?.params).toEqual({
        type: 'Затопление',
        objectName: 'БЦ «Северный»',
        floor: '3 этаж',
      });
      expect(resolved?.data).toEqual({
        ticketId: 't-3',
        objectName: 'БЦ «Северный»',
        floor: '3 этаж',
        lat: 55.75,
        lng: 37.61,
      });
    });

    it('без получателей в payload → пустой список (консьюмер сделает broadcast)', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_EMERGENCY, {
        ticketId: 't-3',
        type: 'Затопление',
        objectName: 'БЦ «Северный»',
        floor: '3 этаж',
      });

      // Контракт 3.2 не содержит получателя — сигнал к широковещательной рассылке.
      expect(resolved?.userIds).toEqual([]);
      expect(resolved?.data.lat).toBe('');
      expect(resolved?.data.lng).toBe('');
    });

    it('без floor подставляет пустую строку', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_EMERGENCY, {
        ticketId: 't-3',
        type: 'Затопление',
        objectName: 'Офис',
      });

      expect(resolved?.params).toEqual({ type: 'Затопление', objectName: 'Офис', floor: '' });
    });

    it.each([
      ['без type', { objectName: 'Офис', floor: '1' }],
      ['без objectName', { type: 'Затопление', floor: '1' }],
    ])('ticket.emergency %s → null', (_title, payload) => {
      expect(resolveEvent(ROUTING_KEYS.TICKET_EMERGENCY, payload)).toBeNull();
    });

    it('игнорирует не-массивы в userIds', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_EMERGENCY, {
        type: 'Затопление',
        objectName: 'Офис',
        userIds: 'u-1',
      });

      expect(resolved?.userIds).toEqual([]);
    });
  });

  describe('ticket.overdue', () => {
    it('округляет минуты и берёт получателей из payload', () => {
      const resolved = resolveEvent(ROUTING_KEYS.TICKET_OVERDUE, {
        ticketId: 't-4',
        minutesOverdue: 12.6,
        assigneeId: 'u-3',
      });

      expect(resolved?.template).toBe('TICKET_OVERDUE');
      expect(resolved?.params).toEqual({ ticketId: 't-4', minutes: 13 });
      expect(resolved?.userIds).toEqual(['u-3']);
      expect(resolved?.data).toEqual({ ticketId: 't-4', minutesOverdue: 12.6 });
    });

    it.each([
      ['минуты строкой', { ticketId: 't-4', minutesOverdue: '12' }],
      ['без ticketId', { minutesOverdue: 12 }],
      ['минуты NaN', { ticketId: 't-4', minutesOverdue: Number.NaN }],
    ])('ticket.overdue (%s) → null', (_title, payload) => {
      expect(resolveEvent(ROUTING_KEYS.TICKET_OVERDUE, payload)).toBeNull();
    });
  });

  describe('geofence.exit', () => {
    it('уведомляет сотрудника, покинувшего объект', () => {
      const resolved = resolveEvent(ROUTING_KEYS.GEOFENCE_EXIT, {
        userId: 'u-7',
        employeeName: 'Иванов И.',
        objectId: 'o-1',
        timestamp: '2026-01-01T10:00:00.000Z',
      });

      expect(resolved?.template).toBe('GEOFENCE_EXIT');
      expect(resolved?.userIds).toEqual(['u-7']);
      expect(resolved?.params).toEqual({ employeeName: 'Иванов И.' });
      expect(resolved?.data).toEqual({ userId: 'u-7', objectId: 'o-1' });
    });

    it('без employeeName подставляет нейтральное «Сотрудник»', () => {
      const resolved = resolveEvent(ROUTING_KEYS.GEOFENCE_EXIT, { userId: 'u-7' });

      expect(resolved?.params).toEqual({ employeeName: 'Сотрудник' });
      expect(resolved?.data).toEqual({ userId: 'u-7', objectId: '' });
    });

    it('без userId → null', () => {
      expect(resolveEvent(ROUTING_KEYS.GEOFENCE_EXIT, { employeeName: 'Иванов' })).toBeNull();
    });
  });

  describe('material.low', () => {
    it('уведомляет о низком остатке материала', () => {
      const resolved = resolveEvent(ROUTING_KEYS.MATERIAL_LOW, {
        materialId: 'm-1',
        materialName: 'Мыло',
        objectId: 'o-1',
        objectName: 'БЦ «Северный»',
        quantity: 0.5,
        userIds: ['u-4'],
      });

      expect(resolved?.template).toBe('MATERIAL_LOW');
      expect(resolved?.params).toEqual({ materialName: 'Мыло', objectName: 'БЦ «Северный»' });
      expect(resolved?.userIds).toEqual(['u-4']);
      expect(resolved?.data).toEqual({ materialId: 'm-1', objectId: 'o-1', quantity: 0.5 });
    });

    it('без получателей → пустой список (broadcast в консьюмере)', () => {
      const resolved = resolveEvent(ROUTING_KEYS.MATERIAL_LOW, {
        materialName: 'Мыло',
        objectName: 'Офис',
      });

      expect(resolved?.userIds).toEqual([]);
      expect(resolved?.data.quantity).toBe('');
    });

    it.each([
      ['без materialName', { objectName: 'Офис' }],
      ['без objectName', { materialName: 'Мыло' }],
    ])('material.low %s → null', (_title, payload) => {
      expect(resolveEvent(ROUTING_KEYS.MATERIAL_LOW, payload)).toBeNull();
    });
  });

  describe('schedule.missed_checkin', () => {
    const missedPayload = {
      eventId: 'e-1',
      scheduleId: 's-1',
      userId: 'u-8',
      objectId: 'o-5',
      objectName: 'БЦ «Северный»',
      plannedStart: '2026-02-01T08:00:00.000Z',
      detectedAt: '2026-02-01T08:20:00.000Z',
    };

    it('адресует уведомление сотруднику из userId и форматирует начало смены', () => {
      const resolved = resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, missedPayload);

      expect(resolved).toEqual({
        routingKey: 'schedule.missed_checkin',
        template: 'SCHEDULE_MISSED',
        userIds: ['u-8'],
        params: { objectName: 'БЦ «Северный»', plannedStart: '01.02.2026 08:00 UTC' },
        data: {
          eventId: 'e-1',
          scheduleId: 's-1',
          userId: 'u-8',
          objectId: 'o-5',
          objectName: 'БЦ «Северный»',
          plannedStart: '2026-02-01T08:00:00.000Z',
          detectedAt: '2026-02-01T08:20:00.000Z',
        },
      });
    });

    it('plannedStartLocal от schedule-service подставляется как есть (часы организации)', () => {
      const resolved = resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
        ...missedPayload,
        plannedStart: '2026-02-01T05:00:00.000Z',
        plannedStartLocal: '01.02.2026 08:00 МСК',
      });

      expect(resolved?.params).toEqual({
        objectName: 'БЦ «Северный»',
        plannedStart: '01.02.2026 08:00 МСК',
      });
      expect(resolved?.data).toMatchObject({
        plannedStart: '2026-02-01T05:00:00.000Z',
        plannedStartLocal: '01.02.2026 08:00 МСК',
      });
    });

    it('без userId → пустой список получателей (консьюмер сделает broadcast)', () => {
      // schedule-service публикует userId: event.userId ?? '' — пустая строка
      // тоже означает «сотрудник неизвестен».
      const resolved = resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
        ...missedPayload,
        userId: '',
      });

      expect(resolved?.userIds).toEqual([]);
      expect(resolved?.data.userId).toBe('');
    });

    it('без objectName (у графика нет objectId) и без plannedStart — понятный текст', () => {
      const resolved = resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
        scheduleId: 's-2',
        userId: 'u-1',
        objectName: '',
      });

      expect(resolved?.params).toEqual({
        objectName: 'объект не указан',
        plannedStart: 'по графику',
      });
      expect(resolved?.data.objectName).toBe('объект не указан');
    });

    it('неразбираемый plannedStart показывается как есть, а не «Invalid Date»', () => {
      const resolved = resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
        scheduleId: 's-3',
        userId: 'u-1',
        plannedStart: 'завтра утром',
      });

      expect(resolved?.params).toEqual({
        objectName: 'объект не указан',
        plannedStart: 'завтра утром',
      });
    });

    it('без scheduleId → null (контракт нарушен)', () => {
      const { scheduleId: _scheduleId, ...withoutSchedule } = missedPayload;
      expect(resolveEvent(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, withoutSchedule)).toBeNull();
    });
  });

  describe('неподдержанные сообщения', () => {
    it.each([
      ['неизвестный routing key', 'schedule.unknown', { userId: 'u-1' }],
      ['завершение операции', ROUTING_KEYS.TICKET_OPERATION_COMPLETED, { operationId: 'op-1' }],
    ])('%s → null', (_title, routingKey, payload) => {
      expect(resolveEvent(routingKey, payload)).toBeNull();
    });

    it.each([
      ['null', null],
      ['строку', 'not-an-object'],
      ['массив', [{ ticketId: 't-1' }]],
      ['undefined', undefined],
    ])('payload %s → null вместо падения', (_title, payload) => {
      // В очередь может попасть мусор: парсер обязан вернуть null, а не бросить.
      expect(resolveEvent(ROUTING_KEYS.TICKET_CREATED, payload)).toBeNull();
    });
  });
});

describe('resolveEvent: ticket.status_changed (09.10.2026)', () => {
  const base = {
    ticketId: 't-1',
    status: 'in_progress',
    previousStatus: 'assigned',
    type: 'planned',
    description: 'Влажная уборка холла',
    objectId: 'obj-1',
    assigneeId: 'u-op',
    createdBy: 'u-client',
    actorId: 'u-op',
    actorName: 'Оператор Иванов',
    changedAt: '2026-10-09T12:00:00.000Z',
  };

  it('адресует бригадирам/админам и автору заявки, исключая инициатора', () => {
    const resolved = resolveEvent(ROUTING_KEYS.TICKET_STATUS_CHANGED, base);
    expect(resolved).toMatchObject({
      template: 'TICKET_STATUS',
      userIds: ['u-client'],
      includeStaff: true,
      excludeUserIds: ['u-op'],
      params: {
        title: '▶️ Заявка в работе',
        body: 'Влажная уборка холла (плановая) · Оператор Иванов',
      },
      data: { ticketId: 't-1', status: 'in_progress', previousStatus: 'assigned' },
    });
  });

  it('выполнена: заголовок по статусу, без инициатора — только описание', () => {
    const resolved = resolveEvent(ROUTING_KEYS.TICKET_STATUS_CHANGED, {
      ...base,
      status: 'completed',
      actorId: null,
      actorName: null,
      type: 'emergency',
    });
    expect(resolved?.params).toEqual({
      title: '✅ Заявка выполнена',
      body: 'Влажная уборка холла (аварийная)',
      description: 'Влажная уборка холла (аварийная)',
    });
    expect(resolved?.excludeUserIds).toEqual([]);
  });

  it('без ticketId или status → null', () => {
    expect(resolveEvent(ROUTING_KEYS.TICKET_STATUS_CHANGED, { status: 'completed' })).toBeNull();
    expect(resolveEvent(ROUTING_KEYS.TICKET_STATUS_CHANGED, { ticketId: 't-1' })).toBeNull();
  });
});
