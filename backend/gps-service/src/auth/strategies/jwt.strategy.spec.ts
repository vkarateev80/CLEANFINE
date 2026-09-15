import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy (gps-service)', () => {
  // ВНИМАНИЕ: у параметра нет дефолта — иначе build(undefined) подставил бы 'secret'
  // и ветка dev-фолбэка осталась бы непокрытой.
  function build(accessSecret: string | undefined) {
    const config = { get: jest.fn().mockReturnValue(accessSecret) } as unknown as ConfigService;
    return { strategy: new JwtStrategy(config), config };
  }

  it('берёт общий с auth-service секрет из конфига', () => {
    const { strategy, config } = build('shared-secret');

    expect(strategy).toBeInstanceOf(JwtStrategy);
    expect(config.get).toHaveBeenCalledWith('jwt.accessSecret');
  });

  it('не падает без секрета в конфиге (dev-фолбэк)', () => {
    expect(() => build(undefined)).not.toThrow();
  });

  describe('validate', () => {
    it('преобразует payload токена в AuthUser', () => {
      const { strategy } = build('secret');

      expect(strategy.validate({ sub: 'u1', email: 'admin@cleaning-ops.com', role: 'ADMIN' })).toEqual(
        {
          id: 'u1',
          email: 'admin@cleaning-ops.com',
          role: 'ADMIN',
          // Имя в токене не передаётся: клиент присылает его в теле batch-запроса.
          fullName: '',
        },
      );
    });

    it('payload без sub → UnauthorizedException', () => {
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
