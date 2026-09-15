import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

// passport-jwt в тестах не нужен: проверяется validate() и секрет из конфигурации.
jest.mock('passport-jwt', () => {
  class Strategy {
    constructor(_options: unknown) {}
  }
  return {
    Strategy,
    ExtractJwt: { fromAuthHeaderAsBearerToken: () => () => 'token' },
  };
});

function createConfig(secret?: string): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'jwt.accessSecret' ? secret : undefined)),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  it('преобразует payload в AuthUser', () => {
    const strategy = new JwtStrategy(createConfig('secret'));
    const payload: JwtPayload = { sub: 'u-1', email: 'a@b.c', role: 'ADMIN' };

    expect(strategy.validate(payload)).toEqual({
      id: 'u-1',
      email: 'a@b.c',
      role: 'ADMIN',
      fullName: '',
    });
  });

  it('токен без sub отклоняется', () => {
    const strategy = new JwtStrategy(createConfig('secret'));
    expect(() => strategy.validate({ sub: '', email: 'a@b.c', role: 'ADMIN' })).toThrow(
      UnauthorizedException,
    );
  });

  it('работает на dev-секрете, если JWT_ACCESS_SECRET не задан', () => {
    expect(() => new JwtStrategy(createConfig(undefined))).not.toThrow();
  });
});
