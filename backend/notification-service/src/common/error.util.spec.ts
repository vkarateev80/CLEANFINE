import { errorMessage } from './error.util';

describe('errorMessage', () => {
  it('возвращает message у Error', () => {
    expect(errorMessage(new Error('ECONNREFUSED'))).toBe('ECONNREFUSED');
  });

  it('приводит не-Error значение к строке', () => {
    // amqplib/Prisma умеют бросать строки и объекты — лог не должен падать на них.
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
