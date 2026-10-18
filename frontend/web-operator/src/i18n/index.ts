import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import kyJson from '../../../../shared/i18n/ky.json';
import uzJson from '../../../../shared/i18n/uz.json';

/**
 * Языки интерфейса оператора (решение владельца 18.10.2026): русский —
 * исходный, кыргызский (кириллица) и узбекский (латиница). Словарь общий с
 * нативным приложением — `shared/i18n/*.json`, ключ — русская строка.
 */
export type Lang = 'ru' | 'ky' | 'uz';

export const LANGUAGES: ReadonlyArray<{ code: Lang; native: string; short: string }> = [
  { code: 'ru', native: 'Русский', short: 'RU' },
  { code: 'ky', native: 'Кыргызча', short: 'KY' },
  { code: 'uz', native: 'Oʻzbekcha', short: 'UZ' },
];

const DICTS: Record<Exclude<Lang, 'ru'>, Record<string, string>> = {
  ky: kyJson as Record<string, string>,
  uz: uzJson as Record<string, string>,
};

export function isLang(value: unknown): value is Lang {
  return value === 'ru' || value === 'ky' || value === 'uz';
}

/** Язык браузера, если он среди поддерживаемых; иначе русский. */
export function detectLang(languages: readonly string[] = browserLanguages()): Lang {
  for (const tag of languages) {
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(code)) return code;
  }
  return 'ru';
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/** Выбор оператора — в localStorage; переживает выход из аккаунта. */
export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: detectLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'cleanfine-operator-lang' },
  ),
);

/**
 * Перевод русской строки интерфейса на текущий язык; нет перевода — та же
 * строка. `args` подставляются в плейсхолдеры `{name}` после перевода.
 */
export function t(source: string, args?: Record<string, string | number>): string {
  const lang = useLangStore.getState().lang;
  let text = lang === 'ru' ? source : (DICTS[lang][source] ?? source);
  if (args) {
    for (const [key, value] of Object.entries(args)) {
      text = text.split(`{${key}}`).join(String(value));
    }
  }
  return text;
}

/** Текущий язык как реактивное значение (для переключателя и `key` корня). */
export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** `<html lang>` — для переносов, озвучки и автоперевода браузера. */
export function applyDocumentLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
