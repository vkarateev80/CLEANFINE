import { afterEach, describe, expect, it } from 'vitest';
import ky from '../../../../shared/i18n/ky.json';
import uz from '../../../../shared/i18n/uz.json';
import { detectLang, t, useLangStore } from './index';

/** Переводы интерфейса (ru/ky/uz, решение владельца 18.10.2026). */
describe('i18n', () => {
  afterEach(() => useLangStore.setState({ lang: 'ru' }));

  it('detectLang: язык браузера среди поддерживаемых — он, иначе русский', () => {
    expect(detectLang(['uz-UZ', 'ru'])).toBe('uz');
    expect(detectLang(['en-US', 'ky'])).toBe('ky');
    expect(detectLang(['en-US', 'en'])).toBe('ru');
    expect(detectLang([])).toBe('ru');
  });

  it('t: на русском исходник, без перевода исходник, плейсхолдеры подставляются', () => {
    expect(t('Сегодня')).toBe('Сегодня');
    useLangStore.setState({ lang: 'uz' });
    expect(t('строки-нет-в-словаре Ё')).toBe('строки-нет-в-словаре Ё');
    expect(t('Осталось {n} из {total}', { n: 2, total: 5 })).toBe('Осталось 2 из 5');
    const dict = uz as Record<string, string>;
    expect(t('Сегодня')).toBe(dict['Сегодня'] ?? 'Сегодня');
  });

  it('переводы не теряют плейсхолдеры исходника', () => {
    const re = /\{[a-zA-Z0-9_]+\}/g;
    for (const [lang, dict] of Object.entries({ ky, uz } as Record<string, Record<string, string>>)) {
      for (const [key, value] of Object.entries(dict)) {
        const src = (key.match(re) ?? []).sort().join(' ');
        const dst = (value.match(re) ?? []).sort().join(' ');
        expect(dst, `${lang}: «${key}» → «${value}»`).toBe(src);
      }
    }
  });
});
