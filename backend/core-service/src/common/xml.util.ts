/**
 * XML-экранирование для подстановки пользовательских данных в SVG водяного знака.
 * Без него символы `<`, `&`, кавычки ломают SVG или позволяют внедрить разметку.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Обрезка длинных значений, чтобы текст не выезжал за пределы плашки. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
