import { EVENT_QUEUES, ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { NOTIFICATION_ROUTING_KEYS, resolveEvent } from './notification-events';

describe('NOTIFICATION_ROUTING_KEYS', () => {
  it('слушает ровно шесть очередей из shared/constants/events.ts', () => {
    expect([...NOTIFICATION_ROUTING_KEYS]).toEqual([
      'ticket.created',
      'ticket.assigned',
      'ticket.emergency',
      'ticket.overdue',
      'geofence.exit',
      'material.low',
    ]);
    // Имя очереди не дублируется в коде сервиса: оно берётся из общего контракта.
    expect(EVENT_QUEUES[ROUTING_KEYS.TICKET_EMERGENCY]).toBe('notification.ticket.emergency');
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

  describe('неподдержанные сообщения', () => {
    it.each([
      ['неизвестный routing key', ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, { userId: 'u-1' }],
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
