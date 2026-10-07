/**
 * Цветовая кодировка инвентаря (система «четырёх цветов» клининга).
 *
 * Правило отрасли: инвентарь одного цвета не покидает «свою» зону — так
 * исключается перекрёстное загрязнение. CLEANFINE не хранит цвет в БД
 * (решение владельца 28.09: словари без миграций): цвет **выводится** из
 * типа помещения (`Room.floorType`), а поле `Room.zone` может задать его явно
 * («Красная зона»). Эти же правила зеркалятся в приложении оператора
 * (`lib/core/domain/color_zone.dart`) — наборы ключевых слов менять синхронно.
 *
 * Источник текстов — таблички «сайт ЧИСТО/таблички-с-персоналом» (07.10.2026).
 */

export const COLOR_ZONES = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
export type ColorZone = (typeof COLOR_ZONES)[number];

export interface ColorZoneMeta {
  id: ColorZone;
  /** Название цвета: «Красный». */
  name: string;
  /** Название цвета в женском роде для «… зона»: «Красная». */
  adjective: string;
  /** Зона применения: «Санитарные зоны». */
  zoneName: string;
  /** Расшифровка зоны: «туалеты, унитазы, писсуары». */
  where: string;
  /** Основной цвет (как на табличках). */
  hex: string;
  /** Тёмный оттенок (обводка, текст на светлом). */
  hexDark: string;
  /** Мягкая заливка (фон помещения на плане, подложка бейджа). */
  hexSoft: string;
  /** Инвентарь зоны — подписи как на табличке. */
  tools: string[];
}

export const COLOR_ZONE_META: Record<ColorZone, ColorZoneMeta> = {
  RED: {
    id: 'RED',
    name: 'Красный',
    adjective: 'Красная',
    zoneName: 'Санитарные зоны',
    where: 'туалеты, унитазы, писсуары',
    hex: '#E30613',
    hexDark: '#A5000B',
    hexSoft: '#FDECEE',
    tools: ['Швабра', 'Ведро', 'Салфетки', 'Ершик'],
  },
  BLUE: {
    id: 'BLUE',
    name: 'Синий',
    adjective: 'Синяя',
    zoneName: 'Зоны общего пользования',
    where: 'офисы, коридоры, холлы',
    hex: '#0A5BD3',
    hexDark: '#063C8E',
    hexSoft: '#E8F0FC',
    tools: ['Швабра', 'Ведро', 'Салфетки', 'Распылитель'],
  },
  GREEN: {
    id: 'GREEN',
    name: 'Зелёный',
    adjective: 'Зелёная',
    zoneName: 'Кухни и столовые',
    where: 'зоны приёма пищи',
    hex: '#12933A',
    hexDark: '#0A6026',
    hexSoft: '#E8F5EC',
    tools: ['Швабра', 'Ведро', 'Салфетки', 'Губка'],
  },
  YELLOW: {
    id: 'YELLOW',
    name: 'Жёлтый',
    adjective: 'Жёлтая',
    zoneName: 'Специализированные зоны',
    where: 'стёкла, зеркала, особые требования',
    hex: '#FFC400',
    hexDark: '#D19A00',
    hexSoft: '#FFF7DB',
    tools: ['Стеклосгон', 'Ведро', 'Салфетки', 'Распылитель'],
  },
};

/** Явные значения поля «Зона», задающие цвет напрямую (пресеты формы помещения). */
export const COLOR_ZONE_LABELS: Record<ColorZone, string> = {
  RED: 'Красная зона',
  BLUE: 'Синяя зона',
  GREEN: 'Зелёная зона',
  YELLOW: 'Жёлтая зона',
};

/**
 * Ключевые слова типа помещения → цвет. Проверяются по вхождению в нижнем
 * регистре с ё→е; порядок важен: первое совпадение побеждает, синий — всё
 * остальное (офисы, коридоры, холлы, кабинеты, склады…).
 */
const ROOM_TYPE_KEYWORDS: ReadonlyArray<readonly [ColorZone, readonly string[]]> = [
  ['RED', ['санузел', 'санитар', 'туалет', 'уборн', 'душ', 'писсуар', 'унитаз', 'ванн', 'wc']],
  ['GREEN', ['кухн', 'столов', 'буфет', 'пищ', 'обеден', 'кафе', 'ресторан', 'кофе-пойнт', 'кофепойнт']],
  ['YELLOW', ['витрин', 'стекл', 'зеркал', 'остекл', 'оконн', 'окна']],
];

/** Ключевые слова названия операции, требующие жёлтого инвентаря независимо от зоны. */
const GLASS_OPERATION_KEYWORDS = ['стекл', 'зеркал', 'окн', 'витрин'] as const;

/** Слова в поле «Зона», задающие цвет явно. */
const ZONE_FIELD_KEYWORDS: ReadonlyArray<readonly [ColorZone, readonly string[]]> = [
  ['RED', ['красн']],
  ['GREEN', ['зелен']],
  ['YELLOW', ['желт']],
  ['BLUE', ['син']],
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/ё/g, 'е').trim();
}

function matchKeywords(
  value: string,
  table: ReadonlyArray<readonly [ColorZone, readonly string[]]>,
): ColorZone | null {
  for (const [zone, words] of table) {
    if (words.some((word) => value.includes(word))) return zone;
  }
  return null;
}

/** Явный цвет из поля «Зона»; `null`, если зона о цвете не говорит («Зона A», «Публичная»). */
export function colorZoneFromZoneField(zone: string | null | undefined): ColorZone | null {
  const normalized = normalize(zone);
  if (normalized === '') return null;
  return matchKeywords(normalized, ZONE_FIELD_KEYWORDS);
}

/** Цвет по типу помещения; всё, что не санитарное, не кухня и не стекло — синий. */
export function colorZoneFromRoomType(floorType: string | null | undefined): ColorZone {
  return matchKeywords(normalize(floorType), ROOM_TYPE_KEYWORDS) ?? 'BLUE';
}

/**
 * Цвет помещения: явная зона важнее типа; если тип ничего не говорит
 * (типовой «Офис» после импорта плана), подсказкой служит название
 * («Кухня ГД» → зелёный). Иначе — синий.
 */
export function roomColorZone(room: {
  floorType: string | null | undefined;
  zone?: string | null | undefined;
  name?: string | null | undefined;
}): ColorZone {
  const explicit = colorZoneFromZoneField(room.zone);
  if (explicit !== null) return explicit;
  const byType = matchKeywords(normalize(room.floorType), ROOM_TYPE_KEYWORDS);
  if (byType !== null) return byType;
  return matchKeywords(normalize(room.name), ROOM_TYPE_KEYWORDS) ?? 'BLUE';
}

/**
 * Цвет инвентаря операции: мытьё стёкол и зеркал — всегда жёлтый, остальные
 * операции наследуют цвет помещения, в котором выполняются.
 */
export function operationColorZone(operationName: string, roomZone: ColorZone): ColorZone {
  const normalized = normalize(operationName);
  return GLASS_OPERATION_KEYWORDS.some((word) => normalized.includes(word)) ? 'YELLOW' : roomZone;
}

/** «Красный инвентарь — санитарные зоны (туалеты, унитазы, писсуары)». */
export function colorZoneDescription(zone: ColorZone): string {
  const meta = COLOR_ZONE_META[zone];
  return `${meta.name} инвентарь — ${meta.zoneName.toLowerCase()} (${meta.where})`;
}
