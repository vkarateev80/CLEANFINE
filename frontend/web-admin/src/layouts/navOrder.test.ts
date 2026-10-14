import { describe, expect, it } from 'vitest';
import type { NavItem } from './AdminLayout';
import { applyNavOrder, isDefaultOrder } from './navOrder';

const ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Доска действий', icon: '📊' },
  { to: '/objects', label: 'Объекты', icon: '🏢' },
  { to: '/tech-cards', label: 'Техкарты', icon: '🧾' },
  { to: '/routes', label: 'Маршруты', icon: '🗺️' },
  { to: '/tickets', label: 'Заявки', icon: '🎫' },
];

const paths = (items: NavItem[]) => items.map((item) => item.to);

describe('applyNavOrder — личный порядок меню', () => {
  it('без сохранённого порядка — стандартный список', () => {
    expect(applyNavOrder(ITEMS, undefined)).toBe(ITEMS);
    expect(applyNavOrder(ITEMS, [])).toBe(ITEMS);
  });

  it('переставляет по сохранённому порядку', () => {
    const order = ['/tickets', '/objects', '/dashboard', '/routes', '/tech-cards'];
    expect(paths(applyNavOrder(ITEMS, order))).toEqual(order);
  });

  it('новый пункт встаёт после соседа сверху из стандартного списка, а не в конец', () => {
    // Сохранили порядок, когда «Маршрутов» ещё не было: они должны оказаться
    // сразу после «Техкарт» (их стандартный сосед сверху), где бы те ни стояли.
    const order = ['/tickets', '/tech-cards', '/dashboard', '/objects'];
    expect(paths(applyNavOrder(ITEMS, order))).toEqual([
      '/tickets',
      '/tech-cards',
      '/routes',
      '/dashboard',
      '/objects',
    ]);
  });

  it('пункт, стоящий первым по умолчанию, без соседа сверху встаёт в начало', () => {
    const order = ['/tickets', '/objects'];
    expect(paths(applyNavOrder(ITEMS, order))).toEqual([
      '/dashboard',
      '/tickets',
      '/objects',
      '/tech-cards',
      '/routes',
    ]);
  });

  it('неизвестные и повторные пути пропускаются (роль сменилась, раздел убрали)', () => {
    const order = ['/reports', '/routes', '/routes', '/objects'];
    // «Заявки» идут за своим стандартным соседом сверху — «Маршрутами».
    expect(paths(applyNavOrder(ITEMS, order))).toEqual([
      '/dashboard',
      '/routes',
      '/tickets',
      '/objects',
      '/tech-cards',
    ]);
  });

  it('isDefaultOrder узнаёт стандартный порядок', () => {
    expect(isDefaultOrder(ITEMS, paths(ITEMS))).toBe(true);
    expect(isDefaultOrder(ITEMS, ['/objects', '/dashboard', '/tech-cards', '/routes', '/tickets'])).toBe(false);
    expect(isDefaultOrder(ITEMS, paths(ITEMS).slice(1))).toBe(false);
  });
});
