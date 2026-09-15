import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy (notification-service)', () => {
  // ВНИМАНИЕ: у параметра нет дефолта — иначе build(undefined) подставил бы 'secret'
  // и ветка dev-фолбэка осталась бы непокрытой.
  function build(accessSecret: string | undefined) {
    const config = { get: jest.fn().mockReturnValue(accessSecret) } as unknown as ConfigService;
    return { strategy: new JwtStrategy(config), config };
  }

  it('берёт общий с auth-service секрет из конфига', () => {
    const { strategy, config } = build('shared-secret');

    expect(strategy).toBeInstanceOf(JwtStrategy);
    // Ключ конфигурации важен: с другим именем секрет молча станет dev-фолбэком.
    expect(config.get).toHaveBeenCalledWith('jwt.accessSecret');
  });

  it('не падает без секрета в конфиге (dev-фолбэк)', () => {
    // Иначе сервис не поднялся бы локально без .env.
    expect(() => build(undefined)).not.toThrow();
  });

  describe('validate', () => {
    it('преобразует payload токена в AuthUser', () => {
      const { strategy } = build('secret');

      expect(
        strategy.validate({ sub: 'u1', email: 'admin@cleaning-ops.com', role: 'ADMIN' }),
      ).toEqual({
        id: 'u1',
        email: 'admin@cleaning-ops.com',
        role: 'ADMIN',
        // Профиль в core не хранится: имя подставляет auth-service/UI.
        fullName: '',
      });
    });

    it('payload без sub → UnauthorizedException', () => {
      // sub — единственный идентификатор пользователя в токене; без него RBAC бессмыслен.
      const { strategy } = build('secret');

      expect(() => strategy.validate({ sub: '', email: 'a@b.co', role: 'ADMIN' })).toThrow(
        UnauthorizedException,
      );
      expect(() => strategy.validate({ sub: '', email: 'a@b.co', role: 'ADMIN' })).toThrow(
        'Некорректный токен',
      );
    });

    it('пустой payload → UnauthorizedException, а не падение на undefined', () => {
      const { strategy } = build('secret');

      expect(() => strategy.validate(undefined as never)).toThrow('Некорректный токен');
    });
  });
});
