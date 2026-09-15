import { notificationTargets } from './event-payloads';

describe('notificationTargets (расширение контракта для notification-service)', () => {
  it('назначенная заявка адресует push исполнителю', () => {
    expect(notificationTargets({ assigneeId: 'u-op-1' })).toEqual({ assigneeId: 'u-op-1' });
  });

  it('без исполнителя отдаёт null — consumer рассылает всем (эскалация доходит до админа)', () => {
    expect(notificationTargets({ assigneeId: null })).toEqual({ assigneeId: null });
  });
});
