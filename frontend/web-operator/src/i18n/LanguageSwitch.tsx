import { LANGUAGES, useLang, useLangStore } from './index';

/** Сегменты «RU · KY · UZ» — на экране входа и в профиле. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div
      role="radiogroup"
      aria-label="Язык интерфейса / Интерфейс тили / Interfeys tili"
      data-testid="language-switch"
      className={['inline-flex rounded-full border border-neutral-200 bg-white p-0.5', className].join(' ')}
    >
      {LANGUAGES.map((item) => {
        const active = item.code === lang;
        return (
          <button
            key={item.code}
            type="button"
            role="radio"
            aria-checked={active}
            title={item.native}
            data-testid={`language-${item.code}`}
            onClick={() => setLang(item.code)}
            className={[
              'min-h-[36px] min-w-[52px] rounded-full px-3 text-sm font-semibold transition-colors',
              active ? 'bg-primary-600 text-white' : 'text-neutral-600 hover:bg-neutral-100',
            ].join(' ')}
          >
            {item.short}
          </button>
        );
      })}
    </div>
  );
}
