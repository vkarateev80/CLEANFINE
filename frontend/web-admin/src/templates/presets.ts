/**
 * Библиотеки пресетов для свободных полей-параметров в формах.
 *
 * Система не имеет закрытых справочников для этих значений (`Object.type`,
 * `Room.floorType`, `Room.zone` — свободные строки), поэтому пресеты живут
 * как `<datalist>`-подсказки: показывают готовую библиотеку по всем
 * категориям, но не мешают ввести своё. Группа «Виды покрытий» пока нигде
 * не хранится отдельным полем — она входит в подсказки типа помещения
 * (решение владельца 28.09: словари как группы подсказок, без изменения БД).
 *
 * Сотрудники: свободного поля-параметра нет (раздел «Сотрудники» — заглушка,
 * роли — закрытый enum), поэтому группа пресетов здесь не нужна — появится
 * вместе с формой.
 */

export type PresetId =
  | 'object-types'
  | 'room-types'
  | 'floor-coverings'
  | 'zones'
  | 'material-names'
  | 'material-units'
  | 'material-suppliers'
  | 'operation-names'
  | 'equipment';

/** Значение списка: строка либо пара «значение → человеческая подпись». */
export type PresetOptionValue = string | { value: string; label: string };

/** Категория внутри библиотеки: заголовок группы в выпадающем списке. */
export interface PresetOptionGroup {
  label: string;
  values: readonly PresetOptionValue[];
}

export interface PresetLibrary {
  id: PresetId;
  label: string;
  /** Плоский список (для подсказок и склейки); у библиотек с группами — склейка групп. */
  values: readonly PresetOptionValue[];
  /** Разбиение по категориям — показывается заголовками в PresetInput. */
  groups?: readonly PresetOptionGroup[];
}

/** Склейка групп в плоский список без дублей (порядок групп сохраняется). */
function flattenGroups(groups: readonly PresetOptionGroup[]): PresetOptionValue[] {
  const seen = new Set<string>();
  const result: PresetOptionValue[] = [];
  for (const group of groups) {
    for (const option of group.values) {
      const value = typeof option === 'string' ? option : option.value;
      if (!seen.has(value)) {
        seen.add(value);
        result.push(option);
      }
    }
  }
  return result;
}

/**
 * Виды помещений по категориям (12.10.2026, запрос владельца: «добавь
 * столовую и ещё типы, сгруппируй»). Цвет инвентаря выводится из названия
 * ключевыми словами (`shared/types/color-coding`): санитарные — красный,
 * пищевые — зелёный, витрины/стёкла — жёлтый, остальное — синий.
 */
const ROOM_TYPE_GROUPS: readonly PresetOptionGroup[] = [
  {
    label: 'Рабочие зоны',
    values: [
      'Офис',
      'Кабинет',
      'Открытая зона',
      'Переговорная',
      'Приёмная',
      'Колл-центр',
      'Учебный класс',
    ],
  },
  {
    label: 'Общие зоны',
    values: [
      'Холл',
      'Ресепшен',
      'Входная группа',
      'Лифтовой холл',
      'Коридор',
      'Лестничная клетка',
      'Зона ожидания',
      'Гардероб',
      'Актовый зал',
      'Конференц-зал',
    ],
  },
  {
    label: 'Санитарные зоны',
    values: ['Санузел', 'Душевая', 'Санитарная зона', 'Раздевалка', 'Комната матери и ребёнка'],
  },
  {
    label: 'Пищевые зоны',
    values: ['Столовая', 'Кухня', 'Буфет', 'Кофе-пойнт', 'Кафе', 'Обеденная зона'],
  },
  {
    label: 'Торговые зоны',
    values: ['Торговый зал', 'Витрина', 'Кассовая зона', 'Примерочная'],
  },
  {
    label: 'Служебные и технические',
    values: [
      'Кладовая',
      'Подсобное помещение',
      'Комната уборочного инвентаря',
      'Склад',
      'Архив',
      'Серверная',
      'Техническое помещение',
      'Электрощитовая',
      'Пост охраны',
    ],
  },
  {
    label: 'Медицинские и спортивные',
    values: [
      'Палата',
      'Процедурный кабинет',
      'Регистратура',
      'Спортзал',
      'Тренажёрный зал',
      'Бассейн',
    ],
  },
  {
    label: 'Прочее',
    values: ['Терраса', 'Балкон', 'Парковка', 'Курительная комната'],
  },
];

export const PRESET_LIBRARIES: Record<PresetId, PresetLibrary> = {
  'object-types': {
    id: 'object-types',
    label: 'Типы объектов',
    values: [
      'Бизнес-центр',
      'Торговый центр',
      'Офис',
      'Склад',
      'Производство',
      'Школа',
      'Больница',
      'Гостиница',
      'Жилой комплекс',
      'Магазин',
      'Аэропорт',
      'Вокзал',
      'Спортивный комплекс',
      'Бизнес-парк',
    ],
  },
  'room-types': {
    id: 'room-types',
    label: 'Виды помещения',
    groups: ROOM_TYPE_GROUPS,
    values: flattenGroups(ROOM_TYPE_GROUPS),
  },
  'floor-coverings': {
    id: 'floor-coverings',
    label: 'Виды покрытий',
    values: [
      'Линолеум',
      'Ковролин',
      'Керамическая плитка',
      'Паркет',
      'Ламинат',
      'Наливной пол',
      'Бетонное покрытие',
      'Ковровое покрытие',
      'Натуральный камень',
    ],
  },
  zones: {
    id: 'zones',
    label: 'Зоны',
    // Четыре цветовые зоны задают цвет инвентаря явно (важнее типа помещения) —
    // см. `@cleaning-ops/shared/types/color-coding`; остальные — обычные метки.
    values: [
      'Красная зона',
      'Синяя зона',
      'Зелёная зона',
      'Жёлтая зона',
      'Публичная',
      'Служебная',
      'Зона A',
      'Зона B',
      'Зона C',
    ],
  },
  'material-names': {
    id: 'material-names',
    label: 'Названия материалов',
    values: [
      'Мыльный раствор',
      'Средство для мытья полов',
      'Средство для стекла',
      'Универсальное дезинфицирующее средство',
      'Порошок для чистки',
      'Мешки для мусора',
      'Перчатки латексные',
      'Салфетки микрофибры',
    ],
  },
  'material-units': {
    id: 'material-units',
    label: 'Единицы измерения',
    values: ['л', 'мл', 'г', 'кг', 'шт', 'уп'],
  },
  'material-suppliers': {
    id: 'material-suppliers',
    label: 'Поставщики',
    values: ['ООО «Химторг»', 'ООО «Чистота-Сервис»', 'ТД «Клининг-Снаб»'],
  },
  'operation-names': {
    id: 'operation-names',
    label: 'Названия операций',
    values: [
      'Вынести мусор',
      'Протереть пыль',
      'Протереть рабочие поверхности',
      'Помыть пол',
      'Помыть стекло',
      'Полить растения',
      'Убрать санитарную зону',
      'Заправить пост уборки',
    ],
  },
  equipment: {
    id: 'equipment',
    label: 'Оборудование',
    // Формат поля: «инвентарь, через запятую; СИЗ после точки с запятой» —
    // JSON остаётся только форматом хранения на сервере (см. techCardHelpers).
    values: [
      'швабра, ведро; перчатки',
      // Инвентарь по цветовой кодировке зон (таблички «четыре цвета»):
      'красные швабра, ведро, салфетки, ершик; перчатки',
      'синие швабра, ведро, салфетки, распылитель; перчатки',
      'зелёные швабра, ведро, салфетки, губка; перчатки',
      'жёлтые стеклосгон, ведро, салфетки, распылитель; перчатки',
      'пылесос; маска',
      'салфетки, скребок; перчатки',
      'мешки для мусора; перчатки, маска',
      { value: '; перчатки', label: 'перчатки (только СИЗ)' },
    ],
  },
};

/**
 * Значения одной или нескольких библиотек, без дублей (порядок сохраняется):
 * полю «Тип помещения» отдаются и виды помещений, и покрытия одной строкой.
 */
/** Строковые значения (для подсказок и join): объекты → их `value`. */
export function presetValues(...ids: PresetId[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    for (const option of PRESET_LIBRARIES[id].values) {
      const value = typeof option === 'string' ? option : option.value;
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
  }
  return result;
}

/** Сырые опции для PresetInput: строки и пары «значение/подпись» как есть. */
export function presetOptions(...ids: PresetId[]): PresetOptionValue[] {
  return ids.flatMap((id) => [...PRESET_LIBRARIES[id].values]);
}

/**
 * Группы для PresetInput с заголовками: библиотека с категориями отдаёт их
 * как есть, без категорий — одну группу с подписью библиотеки.
 */
export function presetGroups(...ids: PresetId[]): PresetOptionGroup[] {
  return ids.flatMap((id) => {
    const library = PRESET_LIBRARIES[id];
    return library.groups ? [...library.groups] : [{ label: library.label, values: library.values }];
  });
}
