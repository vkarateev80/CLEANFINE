import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-50">
      <div className="text-6xl">404</div>
      <div className="text-neutral-600">Страница не найдена</div>
      <Link to="/dashboard" className="text-primary-600 hover:underline">
        На дашборд
      </Link>
    </div>
  );
}
