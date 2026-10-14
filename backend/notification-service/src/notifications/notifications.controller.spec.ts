import { AuthUser } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  ChatMessagePushDto,
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdateSettingsDto,
} from './dto/notifications.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const user: AuthUser = { id: 'u-1', email: 'admin', role: 'ADMIN', fullName: '' };

describe('NotificationsController', () => {
  const notifications = {
    registerDevice: jest.fn(),
    unregisterDevice: jest.fn(),
    list: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    markRead: jest.fn(),
    notifyChatMessage: jest.fn(),
  };
  const controller = new NotificationsController(notifications as unknown as NotificationsService);

  beforeEach(() => jest.clearAllMocks());

  it('регистрирует устройство для текущего пользователя из JWT', async () => {
    const dto: RegisterDeviceDto = { token: 'token', platform: 'ios' };
    notifications.registerDevice.mockResolvedValue({ id: 'd-1' });

    await expect(controller.registerDevice(user, dto)).resolves.toEqual({ id: 'd-1' });
    // userId берётся из токена, а не из тела: иначе можно было бы читать чужие данные.
    expect(notifications.registerDevice).toHaveBeenCalledWith('u-1', dto);
  });

  it('отписывает токен: декодирует path и передаёт userId из JWT', async () => {
    notifications.unregisterDevice.mockResolvedValue(undefined);

    await controller.unregisterDevice(user, encodeURIComponent('tok/1'));

    expect(notifications.unregisterDevice).toHaveBeenCalledWith('u-1', 'tok/1');
  });

  it('отдаёт список уведомлений с фильтрами', async () => {
    const query: ListNotificationsQueryDto = { page: 2, limit: 10, unreadOnly: true };
    notifications.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list(user, query);

    expect(notifications.list).toHaveBeenCalledWith('u-1', query);
  });

  it('отдаёт и обновляет настройки подписок', async () => {
    const dto: UpdateSettingsDto = { disabledTypes: ['MATERIAL_LOW'] };
    notifications.getSettings.mockResolvedValue({ userId: 'u-1', disabledTypes: [] });
    notifications.updateSettings.mockResolvedValue({
      userId: 'u-1',
      disabledTypes: ['MATERIAL_LOW'],
    });

    await controller.getSettings(user);
    await controller.updateSettings(user, dto);

    expect(notifications.getSettings).toHaveBeenCalledWith('u-1');
    expect(notifications.updateSettings).toHaveBeenCalledWith('u-1', dto);
  });

  it('отмечает уведомление прочитанным по id из пути', async () => {
    notifications.markRead.mockResolvedValue({ id: 'n-1', readAt: new Date() });

    await controller.markRead(user, 'n-1');

    expect(notifications.markRead).toHaveBeenCalledWith('u-1', 'n-1');
  });

  it('внутренний push сообщения чата возвращает сводку доставки', async () => {
    const dto: ChatMessagePushDto = {
      userIds: ['u-2', 'u-3'],
      title: 'Чат по заявке T-1',
      body: 'Привет',
      data: { chatId: 'c-1' },
    };
    notifications.notifyChatMessage.mockResolvedValue({ delivered: 2 });

    await expect(controller.pushChatMessage(dto)).resolves.toEqual({ delivered: 2 });
    expect(notifications.notifyChatMessage).toHaveBeenCalledWith(dto);
  });

  it('внутренний push сообщения чата доступен только ADMIN/SUPERVISOR', () => {
    // Без @Roles эндпоинт был бы открыт любому аутентифицированному пользователю,
    // а он умеет слать уведомления произвольным получателям.
    expect(
      Reflect.getMetadata(ROLES_KEY, NotificationsController.prototype.pushChatMessage),
    ).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER']);
  });

  it('пользовательские эндпоинты не ограничены ролями (только своим JWT)', () => {
    for (const method of ['registerDevice', 'list', 'getSettings', 'updateSettings'] as const) {
      expect(
        Reflect.getMetadata(ROLES_KEY, NotificationsController.prototype[method]),
      ).toBeUndefined();
    }
  });
});
