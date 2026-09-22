import { useEffect, useState } from 'react';

/**
 * Подписка на CSS media query из JS — нужна каркасу для перехода через 768 px:
 * при повороте планшета в портрет drawer обязан закрыться, иначе он «залипнет»
 * поверх рейки/сайдбара (System Design §3.5).
 *
 * Логика навигации по ширине живёт в классах Tailwind; хук отвечает только за
 * те случаи, где нужен побочный эффект (сброс состояния), а не вид.
 *
 * Первое значение берётся в инициализаторе `useState`, а не в эффекте: иначе
 * первый кадр отрисовался бы с заведомо неверным значением (false). В эффекте
 * значение синхронизируется повторно — на случай, если `query` изменился.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMediaSafe(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Синхронизация с текущим состоянием: между рендером и подпиской query мог
    // смениться (или окно успеть измениться).
    setMatches(list.matches);
    // addEventListener('change') вместо устаревшего addListener: он снимается
    // парной отпиской и не течёт при частых перерисовках каркаса.
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** `matchMedia` может отсутствовать в среде без DOM (jsdom-тесты, SSR-снапшот). */
function matchMediaSafe(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}
