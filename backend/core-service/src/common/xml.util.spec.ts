import { escapeXml, truncate } from './xml.util';

describe('escapeXml', () => {
  it('экранирует все опасные для XML символы', () => {
    // Без экранирования пользовательские данные ломают SVG водяного знака
    // или позволяют внедрить собственную разметку.
    expect(escapeXml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&apos;');
  });

  it('заменяет амперсанд первым, чтобы не испортить уже сделанные замены', () => {
    // Если бы & заменялся последним, '&lt;' превратился бы в '&amp;lt;'.
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('&')).toBe('&amp;');
  });

  it('не является идемпотентной: повторный вызов экранирует амперсанд второй раз', () => {
    // Важно для вызывающего кода: экранировать нужно ровно один раз.
    expect(escapeXml(escapeXml('&'))).toBe('&amp;amp;');
  });

  it('безопасный текст остаётся без изменений', () => {
    expect(escapeXml('План 1 этажа')).toBe('План 1 этажа');
  });

  it('пустая строка возвращается как есть', () => {
    expect(escapeXml('')).toBe('');
  });
});

describe('truncate', () => {
  it('короткое значение не трогает', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('значение ровно по границе остаётся полным', () => {
    // Граница включительная: length === max ещё помещается.
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('длинное значение обрезается до max символов с многоточием', () => {
    const result = truncate('abcdefghij', 5);

    expect(result).toBe('abcd…');
    expect(result).toHaveLength(5);
  });

  it('max = 1 оставляет только многоточие', () => {
    expect(truncate('abcdef', 1)).toBe('…');
  });
});
