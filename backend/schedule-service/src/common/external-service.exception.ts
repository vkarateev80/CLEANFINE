/**
 * 502 для внешних зависимостей, от которых зависит результат HTTP-запроса.
 *
 * Используется вместо ServiceUnavailableException (он даёт 503): по заданию М4.5
 * недоступность gps-service при check-in — это 502 «Bad Gateway», потому что виноват
 * не наш сервис, а вышестоящий, и клиенту важно отличить это от «сервис выключен».
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalServiceUnavailableException extends HttpException {
  constructor(
    message: string,
    readonly service: string,
  ) {
    super(message, HttpStatus.BAD_GATEWAY);
  }
}

/** gps-service не подтвердил геозону (недоступен/ответил ошибкой/нарушил контракт). */
export function geofenceUnavailable(): ExternalServiceUnavailableException {
  return new ExternalServiceUnavailableException(
    'Не удалось подтвердить геозону: сервис геозон недоступен, check-in не выполнен',
    'gps-service',
  );
}

/** ticket-service недоступен — генерацию смен прерываем, заявки не создадутся. */
export function ticketServiceUnavailable(): ExternalServiceUnavailableException {
  return new ExternalServiceUnavailableException(
    'ticket-service недоступен: генерация смен прервана, чтобы не создавать смены без плановых заявок',
    'ticket-service',
  );
}
