import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';

/**
 * Достаёт фабрику из метаданных, которые createParamDecorator пишет на метод.
 * Прямой вызов CurrentUser(...) не работает: возвращается обёртка Nest.
 */
function makeContext(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}

function extractFactory(decorator: ParameterDecorator): (data: unknown, ctx: ExecutionContext) => unknown {
  class Target {
    handler(_arg: unknown): void {
      /* noop */
    }
  }
  decorator(Target.prototype, 'handler', 0);
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown }
  >;
  const entry = Object.values(metadata)[0];
  return entry.factory;
}

describe('декораторы auth', () => {
  describe('CurrentUser', () => {
    const factory = extractFactory(CurrentUser() as unknown as ParameterDecorator);

    it('возвращает request.user', () => {
      const user = { id: 'u1', role: 'ADMIN' };
      expect(factory(undefined, makeContext(user))).toBe(user);
    });

    it('возвращает undefined, если пользователь не установлен', () => {
      expect(factory(undefined, makeContext(undefined))).toBeUndefined();
    });
  });

  describe('Public', () => {
    it('проставляет метаданные isPublic = true', () => {
      class Target {}
      Public()(Target);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, Target)).toBe(true);
    });
  });

  describe('Roles', () => {
    it('сохраняет несколько ролей', () => {
      class Target {}
      Roles('ADMIN', 'SUPERVISOR')(Target);
      expect(Reflect.getMetadata(ROLES_KEY, Target)).toEqual(['ADMIN', 'SUPERVISOR']);
    });

    it('сохраняет одну роль', () => {
      class Target {}
      Roles('CLIENT')(Target);
      expect(Reflect.getMetadata(ROLES_KEY, Target)).toEqual(['CLIENT']);
    });

    it('работает как метод-декоратор', () => {
      class Target {
        handler(): void {
          /* noop */
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'handler');
      Roles('ADMIN')(Target.prototype, 'handler', descriptor as PropertyDescriptor);
      expect(Reflect.getMetadata(ROLES_KEY, Target.prototype.handler)).toEqual(['ADMIN']);
    });
  });
});
