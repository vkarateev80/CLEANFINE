import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { ConfigService } from '@nestjs/config';

function buildStrategy(secret = 'dev-access-secret') {
  const config = { get: jest.fn(() => secret) } as unknown as ConfigService;
  return new JwtStrategy(config);
}

describe('JwtStrategy (chat-service)', () => {
  it('доверяет payload токена auth-service и возвращает пользователя', () => {
    const user = buildStrategy().validate({
      sub: 'u-1',
      email: 'admin@cleaning-ops.com',
      role: 'ADMIN',
    });
    expect(user).toEqual({
      id: 'u-1',
      email: 'admin@cleaning-ops.com',
      role: 'ADMIN',
      fullName: '',
    });
  });

  it('отвергает payload без sub', () => {
    expect(() =>
      buildStrategy().validate({ sub: '', email: 'a@b.c', role: 'ADMIN' }),
    ).toThrow(UnauthorizedException);
  });

  it('создаётся с общим секретом JWT_ACCESS_SECRET', () => {
    // Тот же секрет, что у auth-service: иначе токены auth не принимались бы.
    expect(() => buildStrategy('shared-secret')).not.toThrow();
  });
});
