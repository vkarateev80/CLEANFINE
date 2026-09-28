import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs, PageHeader } from '../../components/ui';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import { RouteEditor } from './RouteEditor';
import { RouteListPage } from './RouteListPage';

/**
 * «Конструктор маршрутов» (М2.7, поток D3): один компонент обслуживает и выбор
 * маршрута (`/routes`), и редактор (`/routes/:id`) — так устроен роутер: оба пути
 * ведут на `RouteBuilderPage` под одним `RoleGuard`. Различаются они наличием `:id`.
 *
 * Выбранные объект и этаж живут в query-параметрах: ссылку на конкретный маршрут
 * можно переслать, и она откроет тот же этаж, а не сбросит выбор.
 */

export function RouteBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const objectId = searchParams.get('objectId');
  const floorId = searchParams.get('floorId');

  function selectObject(nextObjectId: string) {
    // Смена объекта обнуляет этаж: этажи другого объекта к нему не относятся.
    const next = new URLSearchParams(searchParams);
    next.set('objectId', nextObjectId);
    next.delete('floorId');
    setSearchParams(next, { replace: true });
  }

  function selectFloor(nextFloorId: string) {
    const next = new URLSearchParams(searchParams);
    if (nextFloorId === '') {
      next.delete('floorId');
    } else {
      next.set('floorId', nextFloorId);
    }
    setSearchParams(next, { replace: true });
  }

  /** Выбор и создание маршрута — переход в редактор, поэтому путь, а не query. */
  function openRoute(routeId: string, routeFloorId: string) {
    const params = new URLSearchParams();
    if (objectId) params.set('objectId', objectId);
    params.set('floorId', routeFloorId);
    navigate(`${ROUTES.route(routeId)}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Конструктор маршрутов"
        subtitle="Порядок обхода помещений этажа: точки слева, план с маркерами справа."
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: 'Дашборд', to: ROUTES.dashboard },
              { label: 'Маршруты', to: ROUTES.routes },
              ...(id ? [{ label: 'Редактор маршрута' }] : []),
            ]}
          />
        }
      />

      {!canEdit ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <div className="text-sm font-medium text-neutral-500">Недостаточно прав</div>
          <div className="mt-1 text-xs text-neutral-400">
            Конструктор маршрутов доступен ролям «Администратор» и «Бригадир».
          </div>
          <Link
            to={ROUTES.dashboard}
            className="mt-3 inline-block text-sm text-primary-600 hover:underline"
          >
            На дашборд
          </Link>
        </div>
      ) : id ? (
        <RouteEditor
          routeId={id}
          objectId={objectId}
          floorId={floorId}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      ) : (
        <RouteListPage
          objectId={objectId}
          floorId={floorId}
          onSelectObject={selectObject}
          onSelectFloor={selectFloor}
          onOpenRoute={openRoute}
          onCreateRoute={openRoute}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
