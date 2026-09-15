import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Извлекает сам access-токен из заголовка Authorization.
 * Нужен там, где ticket-service вызывает другой сервис от имени пользователя
 * (поиск ближних операторов в gps-service): токен пробрасывается как есть.
 */
export const AccessToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers?: Record<string, string> }>();
  const header = request.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
});
