import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatMessagePushDto } from './notifications.dto';

/**
 * Валидация тела внутреннего push от chat-service. Глобальный ValidationPipe
 * (main.ts) превращает найденные здесь ошибки в 400, поэтому проверяем именно
 * class-validator, а не HTTP.
 */
async function errorsOf(plain: Record<string, unknown>) {
  return validate(plainToInstance(ChatMessagePushDto, plain));
}

const valid = {
  userIds: ['d8369dde-68c5-4f8b-ab72-55cd39497607'],
  title: 'Чат по заявке T-1',
  body: 'Привет',
  data: { chatId: 'c-1', messageId: 'm-1', type: 'DIRECT' },
};

describe('ChatMessagePushDto', () => {
  it('принимает корректное тело вызова chat-service', async () => {
    expect(await errorsOf({ ...valid, type: 'CHAT_MESSAGE' })).toHaveLength(0);
  });

  it('принимает тело без data и без type', async () => {
    const errors = await errorsOf({ userIds: valid.userIds, title: 't', body: 'b' });

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['пустой список получателей', { ...valid, userIds: [] }],
    ['userIds не массив', { ...valid, userIds: 'u-1' }],
    ['получатель не строка', { ...valid, userIds: [42] }],
    ['пустой id получателя', { ...valid, userIds: [''] }],
    ['пустой заголовок', { ...valid, title: '' }],
    ['заголовок не строка', { ...valid, title: 7 }],
    ['пустой текст', { ...valid, body: '' }],
    ['data не объект', { ...valid, data: 'chatId=c-1' }],
    ['чужой тип уведомления', { ...valid, type: 'NEW_TICKET' }],
  ])('отклоняет %s', async (_name, plain) => {
    expect((await errorsOf(plain)).length).toBeGreaterThan(0);
  });
});
