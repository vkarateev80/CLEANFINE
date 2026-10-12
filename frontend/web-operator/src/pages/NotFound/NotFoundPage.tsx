import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md p-4 pt-12">
      <EmptyState
        title="Страница не найдена"
        hint="Такого раздела в приложении нет."
        action={
          <Link to="/today">
            <Button variant="primary" className="min-h-[48px]">
              На главную
            </Button>
          </Link>
        }
      />
    </div>
  );
}
