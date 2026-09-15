import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Извлекает сам access-токен из заголовка Authorization.
 * Нужен там, где core вызывает другой сервис от имени пользователя
 * (например, загрузка плана в file-service): пробрасываем токен как есть.
 */
export const AccessToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers?: Record<string, string> }>();
  const header = request.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
});
