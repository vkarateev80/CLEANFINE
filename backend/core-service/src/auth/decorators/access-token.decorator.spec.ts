import type { ExecutionContext } from '@nestjs/common';
import { CUSTOM_ROUTE_ARGS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AccessToken } from './access-token.decorator';
import { CurrentUser } from './current-user.decorator';

/**
 * createParamDecorator не выполняет фабрику сразу: Nest кладёт её в метаданные
 * ROUTE_ARGS_METADATA и вызывает при обработке запроса. Чтобы протестировать
 * тело декоратора, достаём фабрику из метаданных — так же, как это делает Nest.
 */
function factoryOf(decorator: (data?: unknown, ...pipes: unknown[]) => ParameterDecorator): {
  factory: (data: unknown, ctx: ExecutionContext) => unknown;
  data: unknown;
} {
  class Target {
    method(): void {
      // тело не важно: декоратор нужен только как носитель метаданных
    }
  }

  decorator()(Target.prototype, 'method', 0);

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'method') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown; data: unknown }
  >;
  const key = Object.keys(args).find((k) => k.includes(CUSTOM_ROUTE_ARGS_METADATA)) as string;

  return args[key];
}

function contextWith(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessToken', () => {
  it('снимает префикс Bearer и возвращает сам токен', () => {
    // Токен уходит в file-service от имени пользователя — лишний префикс сломал бы заголовок.
    const { factory, data } = factoryOf(AccessToken);

    expect(factory(data, contextWith({ headers: { authorization: 'Bearer token-abc' } }))).toBe(
      'token-abc',
    );
  });

  it('возвращает заголовок как есть, если схема не Bearer', () => {
    const { factory, data } = factoryOf(AccessToken);

    expect(factory(data, contextWith({ headers: { authorization: 'Basic dXNlcg==' } }))).toBe(
      'Basic dXNlcg==',
    );
  });

  it('без заголовка Authorization возвращает пустую строку, а не undefined', () => {
    // Пустая строка безопаснее: вызывающий сервис отдаст 401 от file-service,
    // а не упадёт на формировании заголовка.
    const { factory, data } = factoryOf(AccessToken);

    expect(factory(data, contextWith({ headers: {} }))).toBe('');
  });

  it('запрос вообще без headers не роняет декоратор', () => {
    const { factory, data } = factoryOf(AccessToken);

    expect(factory(data, contextWith({}))).toBe('');
  });
});

describe('CurrentUser', () => {
  it('возвращает пользователя, положенного стратегией в request.user', () => {
    const { factory, data } = factoryOf(CurrentUser);
    const user = { id: 'u1', email: 'a@b.co', role: 'ADMIN' };

    expect(factory(data, contextWith({ user }))).toBe(user);
  });

  it('без аутентификации возвращает undefined (guard должен отработать раньше)', () => {
    const { factory, data } = factoryOf(CurrentUser);

    expect(factory(data, contextWith({}))).toBeUndefined();
  });
});
