import { useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';

/** Экран задаёт заголовок шапки каркаса; при размонтировании ничего не сбрасывает — следующий экран задаст свой. */
export function useHeaderTitle(title: string): void {
  const setTitle = useUiStore((s) => s.setTitle);
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}
