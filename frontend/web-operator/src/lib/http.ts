import { useEffect, useState } from 'react';

/**
 * HTTP-статус ответа NestJS. `unknown`, потому что сюда попадает и `Error`, и
 * ответ axios (тот же помощник, что `apiStatus` в web-admin).
 */
export function apiStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const { response } = error as { response?: { status?: unknown } };
  return typeof response?.status === 'number' ? response.status : null;
}

/** 403 — «нет доступа», а не «ошибка сети»: экран отказа, без кнопки «Повторить». */
export function isForbidden(error: unknown): boolean {
  return apiStatus(error) === 403;
}

/**
 * Скрыт ли таб-бар под клавиатурой.
 *
 * `visualViewport` — единственный надёжный способ понять, что открыта экранная
 * клавиатура: `focus`/`blur` срабатывают и при переключении между полями, а на
 * iOS клавиатура не меняет ни `window.innerHeight`, ни `resize` документа.
 * Если API недоступен (старые браузеры), хук возвращает `false` — таб-бар
 * остаётся, как и до оптимизации.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      // Порог 150 px: адресная строка мобильного браузера «съедает» до ~100 px,
      // и без запаса таб-бар мигал бы при скролле страницы.
      setOpen(window.innerHeight - viewport.height > 150);
    };

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return open;
}
