import type { GeofenceExitEvent } from '@cleaning-ops/shared/types/events';
import { EventsPublisher } from './events.publisher';
import type { RabbitMqService } from './rabbitmq.service';

describe('EventsPublisher (gps-service)', () => {
  const event: GeofenceExitEvent = {
    userId: 'd8369dde-68c5-4f8b-ab72-55cd39497607',
    employeeName: 'Иван Петров',
    objectId: '3f1a5f9e-9a1e-4c6d-9a1e-000000000001',
    timestamp: '2026-09-15T10:00:00.000Z',
  };

  function build(publishResult: boolean) {
    const rabbit = { publish: jest.fn().mockResolvedValue(publishResult) };
    const publisher = new EventsPublisher(rabbit as unknown as RabbitMqService);
    return { publisher, rabbit };
  }

  it('публикует geofence.exit с routing key из shared/constants/events', async () => {
    const { publisher, rabbit } = build(true);

    await expect(publisher.publishGeofenceExit(event)).resolves.toBe(true);
    expect(rabbit.publish).toHaveBeenCalledWith('geofence.exit', event);
  });

  it('возвращает false, если брокер недоступен (запрос не падает)', async () => {
    const { publisher } = build(false);

    await expect(publisher.publishGeofenceExit(event)).resolves.toBe(false);
  });
});
