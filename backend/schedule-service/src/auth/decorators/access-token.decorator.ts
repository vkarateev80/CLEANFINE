import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Извлекает сам access-токен из заголовка Authorization.
 *
 * Нужен check-in/check-out: проверка геозоны в gps-service идёт с токеном самого
 * пользователя (проброс), а не со служебным. Обоснование выбора:
 *  - gps-service получает в URL userId и сам решает, доверять ли вызывающему;
 *  - проброс пользовательского токена не требует лишнего логина в auth-service
 *    на каждый check-in (служебный токен нужен только cron-проходам и созданию заявок,
 *    где пользовательского токена нет вообще);
 *  - при недоступности auth-service check-in продолжает работать: критичным является
 *    только ответ gps-service, а не служебная сессия.
 */
export const AccessToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers?: Record<string, string> }>();
  const header = request.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
});
