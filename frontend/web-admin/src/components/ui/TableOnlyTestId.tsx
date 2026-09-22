import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * `data-testid`, который существует ТОЛЬКО в табличном представлении списка.
 *
 * ПОЧЕМУ ЭТО НУЖНО. `ResponsiveTable` рендерит оба представления в DOM сразу
 * (переключение — чисто CSS: `hidden md:block` у таблицы и `md:hidden` у карточек).
 * Значит один и тот же id, поставленный и на `<tr>` (проп `rowTestId`), и на карточку,
 * оказывается в DOM дважды — а e2e-набор читает эти id строго: `toHaveCount(1)` по
 * `[data-testid^="schedule-row-"]` (schedule.ui.spec.ts) и `getByTestId('event-status-…')`
 * дают на двух совпадениях ошибку strict-режима Playwright. Поэтому прежние хуки строк
 * и ячеек списков остаются в таблице (desktop-вид и его селекторы не меняются), а у
 * карточек свои канонические хуки `card-list` / `card`, которые ждёт отдел проверки.
 *
 * ПОЧЕМУ ОПРЕДЕЛЯЕМ ПО РОДИТЕЛЮ, А НЕ ПО ШИРИНЕ. `<td>` в дереве карточки не бывает
 * (карточка рендерит ячейку в `<div>`/`<dd>`), поэтому признак «я в таблице» — это факт
 * разметки, а не вьюпорт: он не зависит от media query, от порядка применения классов и
 * от момента подписки на ширину. `useLayoutEffect` — чтобы атрибут стоял уже к первой
 * отрисовке (в тестах не бывает кадра без хука).
 *
 * Живёт рядом с `ResponsiveTable`: это общий механизм адаптива, а не особенность одного
 * экрана. Прежде файл лежал в `pages/Materials` (каталог первого потребителя) с оговоркой
 * «его место — UI-кит, но править соседний отдел нельзя»; оговорка снята — хелпер
 * переехал и экспортируется из barrel'а `components/ui`.
 */
export function TableOnlyTestId({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inTable, setInTable] = useState(false);

  useLayoutEffect(() => {
    if (ref.current?.closest('td')) setInTable(true);
  }, []);

  return (
    <span ref={ref} data-testid={inTable ? id : undefined}>
      {children}
    </span>
  );
}
