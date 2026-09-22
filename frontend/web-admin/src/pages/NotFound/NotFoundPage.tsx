import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    // `px-4 text-center` — запас на 360 px: при узком экране и увеличенном
    // системном шрифте длинная строка не должна упираться в край. На ≥768 px
    // отступы шире, вид прежний.
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-50 px-4 text-center md:px-6">
      <div className="text-6xl max-md:text-5xl">404</div>
      <div className="break-words text-neutral-600">Страница не найдена</div>
      {/* Ссылка-действие: на телефоне это тач-таргет, поэтому поднимаем высоту
          до 44 px (`max-lg:` не действует на desktop). */}
      <Link
        to="/dashboard"
        className="inline-flex items-center rounded-lg px-2 text-primary-600 hover:underline max-lg:min-h-[44px]"
      >
        На дашборд
      </Link>
    </div>
  );
}
