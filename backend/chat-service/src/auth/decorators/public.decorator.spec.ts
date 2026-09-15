import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public (chat-service)', () => {
  it('устанавливает метаданные isPublic на методе', () => {
    // SetMetadata пишет метаданные в цель декоратора: проверяем через Reflect,
    // а не через форму вызова — так тест не зависит от сигнатуры декоратора.
    class Target {
      @Public()
      health(): string {
        return 'ok';
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'health');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, descriptor?.value as object)).toBe(true);
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });
});
