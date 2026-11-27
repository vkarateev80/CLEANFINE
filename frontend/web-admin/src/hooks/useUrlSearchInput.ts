import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Поле поиска, связанное с query-строкой: ввод живёт в локальном состоянии, в URL
 * уходит отложенное значение (`commit`).
 *
 * 07.11.2026: раньше страницы держали два эффекта, сравнивавших значение из URL с
 * отложенным вводом. Сразу после debounce они расходились «штатно», первый эффект
 * возвращал в поле прежний запрос из URL, второй писал в URL новый — и дальше по
 * кругу: набранный текст стирался и возвращался примерно раз в 300 мс.
 *
 * Теперь последнее согласованное значение хранится в ref. Изменение URL, которое
 * записали не мы (кнопка «Назад», «Сбросить фильтры»), переносится в поле; своё —
 * игнорируется. Отложенное значение уходит в URL, только если оно отличается от
 * согласованного.
 */
export function useUrlSearchInput(
  urlValue: string,
  commit: (value: string) => void,
  delayMs = 300,
): readonly [string, (value: string) => void] {
  const [input, setInput] = useState(urlValue);
  const debounced = useDebouncedValue(input, delayMs);
  const synced = useRef(urlValue);
  // Страницы передают замыкание, пересоздаваемое на каждый рендер: держим
  // последнее в ref, чтобы эффект записи зависел только от отложенного значения.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (urlValue === synced.current) return;
    synced.current = urlValue;
    setInput(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (debounced === synced.current) return;
    synced.current = debounced;
    commitRef.current(debounced);
  }, [debounced]);

  return [input, setInput] as const;
}
