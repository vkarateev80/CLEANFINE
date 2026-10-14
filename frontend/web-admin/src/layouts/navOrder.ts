import type { NavItem } from './AdminLayout';

/**
 * Личный порядок пунктов бокового меню (14.10.2026, запрос владельца: «менять
 * местами окошки в боковой панели для админа и менеджера»).
 *
 * Сохранённый порядок — список путей (`NavItem.to`). Пункты, которых в нём нет
 * (новый раздел после выката), встают на своё место по умолчанию — сразу после
 * ближайшего «соседа сверху» из стандартного списка, а не в конец. Пути, которых
 * больше нет или которые роли недоступны, молча пропускаются.
 */
export function applyNavOrder(items: NavItem[], order: readonly string[] | undefined): NavItem[] {
  if (!order || order.length === 0) return items;
  const byPath = new Map(items.map((item) => [item.to, item]));
  const result: NavItem[] = [];
  for (const path of order) {
    const item = byPath.get(path);
    if (item && !result.includes(item)) result.push(item);
  }
  items.forEach((item, index) => {
    if (result.includes(item)) return;
    // Ближайший сосед сверху из стандартного порядка, уже стоящий в результате.
    let anchor = -1;
    for (let i = index - 1; i >= 0 && anchor < 0; i -= 1) {
      anchor = result.indexOf(items[i]);
    }
    result.splice(anchor + 1, 0, item);
  });
  return result;
}

/** Порядок совпадает со стандартным — хранить нечего. */
export function isDefaultOrder(items: NavItem[], order: readonly string[]): boolean {
  return items.length === order.length && items.every((item, index) => item.to === order[index]);
}
