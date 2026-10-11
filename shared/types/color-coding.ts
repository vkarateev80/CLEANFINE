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
  return isGlassOperation(operationName) ? 'YELLOW' : roomZone;
}

/** Операция со стёклами, зеркалами, окнами, витринами — жёлтый инвентарь. */
export function isGlassOperation(operationName: string): boolean {
  const normalized = normalize(operationName);
  return GLASS_OPERATION_KEYWORDS.some((word) => normalized.includes(word));
}

/**
 * Слово цвета в оборудовании — прилагательное **целым словом** («синие»,
 * «Красная», «жёлтый:»), а не вхождением, как в поле «Зона»: цвет одной
 * позиции красит весь набор операции, и «синтетические салфетки» не должны
 * перекрасить его в синий.
 */
const EQUIPMENT_COLOR_WORD =
  /^(красн|син|зелен|желт)(ый|ий|ая|яя|ое|ее|ые|ие|ого|его|ом|ем|ой|ей|ую|юю|ым|им|ых|их|ыми|ими)$/;

const EQUIPMENT_COLOR_STEMS: Record<string, ColorZone> = {
  красн: 'RED',
  син: 'BLUE',
  зелен: 'GREEN',
  желт: 'YELLOW',
};

function colorWordZone(word: string): ColorZone | null {
  const match = EQUIPMENT_COLOR_WORD.exec(normalize(word));
  return match ? EQUIPMENT_COLOR_STEMS[match[1]] : null;
}

/** Цвет, названный в подписи инвентаря («синие швабра» → синий); `null` — не назван. */
export function colorZoneFromEquipment(label: string | null | undefined): ColorZone | null {
  for (const word of (label ?? '').split(/[^a-zа-яё]+/i)) {
    const zone = colorWordZone(word);
    if (zone !== null) return zone;
  }
  return null;
}

/**
 * Подпись без ведущего слова цвета: «синие швабра» → «швабра», «Синие швабра»
 * → «Швабра». Цвет показывает сам чип; подпись из одного слова цвета не трогаем.
 */
export function stripColorWord(label: string): string {
  const match = /^\s*([a-zа-яё]+)[\s:,.;—–-]+(.+)$/i.exec(label);
  if (!match || colorWordZone(match[1]) === null) return label;
  const rest = match[2].trim();
  if (rest === '') return label;
  return match[1][0] === match[1][0].toUpperCase() ? rest[0].toUpperCase() + rest.slice(1) : rest;
}

/**
 * Цвет инвентаря операции — один на весь набор. Технолог пишет цвет один раз
 * («синие швабра, ведро, салфетки; перчатки»), и он относится ко всем позициям,
 * включая СИЗ. Порядок: цвет, названный в оборудовании (первый по порядку
 * позиций) → стёкла и зеркала — жёлтый → цвет помещения. Явное слово важнее
 * выведенного, как поле «Зона» важнее типа помещения.
 */
export function operationInventoryZone(
  operationName: string,
  equipment: readonly string[],
  roomZone: ColorZone,
): ColorZone;
export function operationInventoryZone(
  operationName: string,
  equipment: readonly string[],
  roomZone: ColorZone | null,
): ColorZone | null;
export function operationInventoryZone(
  operationName: string,
  equipment: readonly string[],
  roomZone: ColorZone | null,
): ColorZone | null {
  for (const label of equipment) {
    const named = colorZoneFromEquipment(label);
    if (named !== null) return named;
  }
  return isGlassOperation(operationName) ? 'YELLOW' : roomZone;
}

/**
 * Чип инвентаря в цвете операции (`operationInventoryZone`): слово цвета
 * снимается — его говорит цвет чипа. Позиция, названная другим цветом
 * («…; красные перчатки» в синем наборе), остаётся своего цвета и с подписью
 * как написал технолог.
 */
export function equipmentChip<Z extends ColorZone | null>(
  label: string,
  inventoryZone: Z,
): { label: string; zone: ColorZone | Z } {
  const own = colorZoneFromEquipment(label);
  if (own !== null && own !== inventoryZone) return { label, zone: own };
  return { label: stripColorWord(label), zone: inventoryZone };
}

/** «Красный инвентарь — санитарные зоны (туалеты, унитазы, писсуары)». */
export function colorZoneDescription(zone: ColorZone): string {
  const meta = COLOR_ZONE_META[zone];
  return `${meta.name} инвентарь — ${meta.zoneName.toLowerCase()} (${meta.where})`;
}
