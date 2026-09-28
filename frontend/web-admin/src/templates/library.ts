import type { CreateObjectPayload } from '../types/core';

/**
 * Библиотека шаблонов (раздел «Шаблоны», `/templates`).
 *
 * Шаблон — это описанная в коде «заготовка» реальной сущности: техкарты
 * с набором операций, маршрута с планом точек или объекта с типовой
 * этажностью. Кнопка «Создать из шаблона» разворачивает заготовку через
 * штатные POST-эндпоинты (`instantiate.ts`), поэтому на сервере появляются
 * обычные сущности — никакого отдельного хранения шаблонов и отдельного API.
 *
 * Данные статические и служат демо-контентом по всем категориям: правки здесь
 * видны всем без миграций; свои заготовки команды могут добавлять коммитом.
 */

export type TemplateCategoryId = 'tech-cards' | 'routes' | 'objects';

export interface TemplateCategory {
  id: TemplateCategoryId;
  label: string;
  icon: string;
}

export interface TechCardOperationTemplate {
  name: string;
  estimatedTimeMin: number;
  description?: string;
  requiresPhoto?: boolean;
  requiresQr?: boolean;
}

export interface TechCardTemplate {
  id: string;
  category: 'tech-cards';
  name: string;
  description: string;
  operations: TechCardOperationTemplate[];
}

export interface RoutePointTemplate {
  /** Подпись точки в описании шаблона; при создании точка привязывается к помещению этажа. */
  label: string;
  estimatedTimeMin: number;
}

export interface RouteTemplate {
  id: string;
  category: 'routes';
  name: string;
  description: string;
  points: RoutePointTemplate[];
}

export type ObjectTemplatePreset = Omit<
  CreateObjectPayload,
  'name' | 'clientName' | 'clientContact'
>;

export interface ObjectTemplate {
  id: string;
  category: 'objects';
  name: string;
  description: string;
  /** Поля объекта без имени/заказчика — их задаёт форма создания. */
  preset: ObjectTemplatePreset;
  /** Значения по умолчанию для формы заказчика (подставляются, редактируются). */
  clientDefaults: { clientName: string; clientContact: string };
}

export type LibraryTemplate = TechCardTemplate | RouteTemplate | ObjectTemplate;

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'tech-cards', label: 'Техкарты', icon: '🧾' },
  { id: 'routes', label: 'Маршруты', icon: '🗺️' },
  { id: 'objects', label: 'Объекты', icon: '🏢' },
];

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  // ------------------------------------------------------------------ техкарты
  {
    id: 'tc-office',
    category: 'tech-cards',
    name: 'Офисная уборка',
    description: 'Типовой дневной круг офиса: рабочие места, поверхности, пол, зелень.',
    operations: [
      { name: 'Вынести мусор', estimatedTimeMin: 10, requiresPhoto: true },
      { name: 'Протереть пыль', estimatedTimeMin: 5 },
      { name: 'Протереть рабочие поверхности', estimatedTimeMin: 8 },
      { name: 'Помыть пол', estimatedTimeMin: 15, requiresPhoto: true },
      { name: 'Полить растения', estimatedTimeMin: 5 },
    ],
  },
  {
    id: 'tc-sanitary',
    category: 'tech-cards',
    name: 'Санитарная зона',
    description: 'Санузлы и душевые: сантехника, зеркала, двери, пол с дезинфекцией.',
    operations: [
      { name: 'Унитазы и писсуары', estimatedTimeMin: 10, requiresPhoto: true },
      { name: 'Раковины и зеркала', estimatedTimeMin: 8 },
      { name: 'Двери и перегородки', estimatedTimeMin: 5 },
      { name: 'Помыть пол с дезинфекцией', estimatedTimeMin: 10, requiresPhoto: true },
    ],
  },
  {
    id: 'tc-front',
    category: 'tech-cards',
    name: 'Витрина и входная группа',
    description: 'Первое впечатление: стекло витрины, двери, коврики, фасад у входа.',
    operations: [
      { name: 'Помыть стекло витрины', estimatedTimeMin: 12, requiresPhoto: true },
      { name: 'Двери и ручки', estimatedTimeMin: 5 },
      { name: 'Коврики и порожек', estimatedTimeMin: 5 },
      { name: 'Фасад у входа', estimatedTimeMin: 8 },
    ],
  },

  // ------------------------------------------------------------------ маршруты
  {
    id: 'rt-daily',
    category: 'routes',
    name: 'Ежедневный обход этажа',
    description:
      'Классический дневной обход: ресепшен, открытая зона, переговорки, санузлы, кухня.',
    points: [
      { label: 'Ресепшен', estimatedTimeMin: 10 },
      { label: 'Открытая зона', estimatedTimeMin: 20 },
      { label: 'Переговорные комнаты', estimatedTimeMin: 15 },
      { label: 'Санузлы', estimatedTimeMin: 10 },
      { label: 'Кухня-зона', estimatedTimeMin: 10 },
    ],
  },
  {
    id: 'rt-night',
    category: 'routes',
    name: 'Ночной обход',
    description: 'Проверка по окончании дня: вход, этажи, аварийные выходы, территория.',
    points: [
      { label: 'Точка входа', estimatedTimeMin: 5 },
      { label: 'Этажи по очереди', estimatedTimeMin: 15 },
      { label: 'Аварийные выходы', estimatedTimeMin: 10 },
      { label: 'Территория', estimatedTimeMin: 15 },
    ],
  },

  // ------------------------------------------------------------------- объекты
  {
    id: 'obj-bc',
    category: 'objects',
    name: 'Бизнес-центр',
    description: 'Девятиэтажный БЦ: типовая площадь, этажи нумеруются с первого.',
    preset: {
      address: 'г. Москва, ул. Ленинградская, 15',
      lat: 55.8,
      lng: 37.61,
      type: 'Бизнес-центр',
      totalArea: 12500,
      floorsCount: 9,
      status: 'ACTIVE',
    },
    clientDefaults: { clientName: 'ООО «Клиент-демо»', clientContact: 'demo@example.com' },
  },
  {
    id: 'obj-office',
    category: 'objects',
    name: 'Офисный центр',
    description: 'Компактный офис на два этажа — ближайший родственник демо-«Ромашки».',
    preset: {
      address: 'г. Москва, ул. Тверская, 10',
      lat: 55.757,
      lng: 37.615,
      type: 'Офис',
      totalArea: 1500,
      floorsCount: 2,
      status: 'ACTIVE',
    },
    clientDefaults: { clientName: 'ООО «Клиент-демо»', clientContact: 'demo@example.com' },
  },
  {
    id: 'obj-retail',
    category: 'objects',
    name: 'Торговый зал',
    description: 'Магазин с одним торговым залом: витрины, зал, подсобка.',
    preset: {
      address: 'г. Москва, ул. Пятницкая, 7',
      lat: 55.748,
      lng: 37.626,
      type: 'Магазин',
      totalArea: 850,
      floorsCount: 1,
      status: 'ACTIVE',
    },
    clientDefaults: { clientName: 'ООО «Клиент-демо»', clientContact: 'demo@example.com' },
  },
];

export function templatesByCategory(category: 'tech-cards'): TechCardTemplate[];
export function templatesByCategory(category: 'routes'): RouteTemplate[];
export function templatesByCategory(category: 'objects'): ObjectTemplate[];
export function templatesByCategory(category: TemplateCategoryId | 'all'): LibraryTemplate[];
export function templatesByCategory(category: TemplateCategoryId | 'all'): LibraryTemplate[] {
  if (category === 'all') return TEMPLATE_LIBRARY;
  return TEMPLATE_LIBRARY.filter((t) => t.category === category);
}

/** Сводка содержимого для карточки: «5 операций · 43 мин» и т. п. */
export function templateSummary(template: LibraryTemplate): string[] {
  switch (template.category) {
    case 'tech-cards': {
      const total = template.operations.reduce((sum, op) => sum + op.estimatedTimeMin, 0);
      return [`${template.operations.length} операций`, `${total} мин`];
    }
    case 'routes': {
      const total = template.points.reduce((sum, p) => sum + p.estimatedTimeMin, 0);
      return [`${template.points.length} точек`, `${total} мин`];
    }
    case 'objects':
      return [
        `${template.preset.floorsCount} этажей`,
        `${template.preset.totalArea} м²`,
        template.preset.type,
      ];
  }
}

export function findTemplate(id: string): LibraryTemplate | undefined {
  return TEMPLATE_LIBRARY.find((t) => t.id === id);
}
