import { CurrentUser } from './current-user.decorator';

/**
 * CurrentUser — параметрный декоратор (createParamDecorator): его результатом
 * пользуется Nest, подставляя request.user в аргумент обработчика. Юнит-тест
 * фиксирует контракт декоратора: он применяется к параметру метода без ошибок
 * и является функцией.
 */
describe('CurrentUser (chat-service)', () => {
  it('применяется к параметру обработчика', () => {
    expect(typeof CurrentUser()).toBe('function');

    class Controller {
      handler(@CurrentUser() _user: unknown): string {
        return 'ok';
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    expect(descriptor?.value).toBeInstanceOf(Function);
  });
});
