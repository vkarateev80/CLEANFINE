import { isWellFormedToken, toPushData } from './push-sender';

describe('isWellFormedToken', () => {
  it('принимает длинный токен в формате FCM', () => {
    expect(isWellFormedToken('fcm-token-abcdefghijklmnopqrstuvwxyz:0123456789')).toBe(true);
  });

  it.each([[''], ['bad-token'], ['короткий']])('отвергает %s', (token) => {
    // Мок считает такие токены мёртвыми: сервис обязан деактивировать устройство.
    expect(isWellFormedToken(token)).toBe(false);
  });
});

describe('toPushData', () => {
  it('оставляет строки строками и сериализует числа', () => {
    expect(toPushData({ ticketId: 't-1', quantity: 3 })).toEqual({ ticketId: 't-1', quantity: '3' });
  });

  it('выбрасывает пустые значения', () => {
    // FCM не принимает undefined — пустые поля лучше не отправлять вовсе.
    expect(toPushData({ a: undefined, b: null, c: 'ok' })).toEqual({ c: 'ok' });
  });

  it('сериализует вложенные объекты', () => {
    expect(toPushData({ coords: { lat: 1, lng: 2 } })).toEqual({ coords: '{"lat":1,"lng":2}' });
  });
});
