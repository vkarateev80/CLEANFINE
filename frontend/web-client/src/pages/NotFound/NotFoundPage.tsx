import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

/**
 * 404 портала. Ссылок в админку здесь нет намеренно: это разное ПО с разными
 * доменами, и «перейти в админ-панель» из портала заказчика — не тот путь,
 * который существует у клиента (DS-004, `overview.md` п. 3).
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-4xl" aria-hidden="true">
        🧹
      </div>
      <h1 className="text-xl font-semibold text-neutral-900">Страница не найдена</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Возможно, ссылка устарела. Вернитесь на главную — там статус вашего объекта.
      </p>
      <Link to="/dashboard">
        <Button variant="primary" className="min-h-[44px]">
          На главную
        </Button>
      </Link>
    </div>
  );
}
