import { useEffect, useState } from 'react';

/**
 * Отложенное значение для поиска. Без него запрос уходит на каждое нажатие
 * клавиши, а серверный поиск в core-service — это `ILIKE` по трём полям.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Сброс таймера на каждое изменение — суть debounce; очистка обязательна,
    // иначе на размонтировании останется висеть таймер и setState после unmount.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
