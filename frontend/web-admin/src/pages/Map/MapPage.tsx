import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  ResponsiveTable,
  Select,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { mapboxToken } from '../Objects/utils';
import { MapCanvas } from './MapCanvas';
import {
  DEFAULT_CENTER,
  LAT_RANGE,
  LNG_RANGE,
  apiStatus,
  formatCoordinate,
  formatDateTime,
  formatDistance,
  parseCoordinate,
  shortId,
  type LatLng,
} from './helpers';
import {
  NEARBY_RADIUS_OPTIONS,
  type GeofenceEntity,
  type NearbyEmployee,
  type TrackPointEntity,
} from '../../types/gps';
import {
  useEmployeeNames,
  useGeofences,
  useNearbyEmployees,
  useObjectOptions,
  useTrackHistory,
} from './useMap';

/**
 * Экран «Карта» (М3.7): геозоны объекта и ближние сотрудники на Mapbox GL.
 *
 * Ключевое требование — работоспособность БЕЗ ключа Mapbox. Токен берётся из
 * `VITE_MAPBOX_TOKEN` (см. `.env.example`), поэтому экран разведён на две части:
 *  - карта (компонент `MapCanvas`) монтируется только при непустом токене;
 *  - данные (геозоны и сотрудники) загружаются и показываются таблицами всегда.
 * Так функциональность проверяема на стенде без ключа, а не выглядит «сломанной».
 *
 * Центр поиска = центр карты: он меняется выбором объекта, кликом по карте или
 * координатами в полях ввода, и от него же считается выдача `employees/nearby`.
 */

/** Радиус поиска по умолчанию, м — совпадает с дефолтом DTO gps-service (500). */
const DEFAULT_RADIUS = 500;

export function MapPage() {
  const token = mapboxToken();

  const objects = useObjectOptions();
  const [objectId, setObjectId] = useState<string>('');
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  /** Черновик координат в полях: применяется кнопкой, чтобы карта не «прыгала» на каждый символ. */
  const [latDraft, setLatDraft] = useState(formatCoordinate(DEFAULT_CENTER.lat));
  const [lngDraft, setLngDraft] = useState(formatCoordinate(DEFAULT_CENTER.lng));
  const [trackUserId, setTrackUserId] = useState<string | null>(null);

  const geofences = useGeofences(objectId === '' ? null : objectId);
  const nearby = useNearbyEmployees(center, radius);
  const employees = useEmployeeNames();
  const track = useTrackHistory();

  const employeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of employees.data?.items ?? []) map.set(user.id, user.fullName);
    return map;
  }, [employees.data]);

  const employeesList = useMemo<NearbyEmployee[]>(
    () => nearby.data?.employees ?? [],
    [nearby.data],
  );
  const geofencesList = useMemo<GeofenceEntity[]>(
    () => geofences.data?.geofences ?? [],
    [geofences.data],
  );

  const selectedObject = useMemo(
    () => (objects.data?.items ?? []).find((object) => object.id === objectId) ?? null,
    [objects.data, objectId],
  );

  /**
   * При выборе объекта подставляем его координаты: карта центрируется на объект,
   * а выдача ближних сотрудников сразу считается от него.
   */
  function selectObject(nextId: string) {
    setObjectId(nextId);
    const next = (objects.data?.items ?? []).find((object) => object.id === nextId);
    if (next) applyCenter({ lat: next.lat, lng: next.lng });
    setTrackUserId(null);
    track.reset();
  }

  function applyCenter(next: LatLng) {
    setCenter(next);
    setLatDraft(formatCoordinate(next.lat));
    setLngDraft(formatCoordinate(next.lng));
  }

  function applyDraft() {
    const lat = parseCoordinate(latDraft, LAT_RANGE.min, LAT_RANGE.max);
    const lng = parseCoordinate(lngDraft, LNG_RANGE.min, LNG_RANGE.max);
    if (lat === null || lng === null) {
      // Возврат к текущему центру: иначе в полях остаётся невалидный ввод,
      // а карта показывает другое место — расхождение интерфейса и данных.
      setLatDraft(formatCoordinate(center.lat));
      setLngDraft(formatCoordinate(center.lng));
      return;
    }
    setCenter({ lat, lng });
  }

  // Клик по карте/выбор объекта двигают центр; поля должны следовать за ним.
  useEffect(() => {
    setLatDraft(formatCoordinate(center.lat));
    setLngDraft(formatCoordinate(center.lng));
  }, [center.lat, center.lng]);

  function refreshAll() {
    void objects.refetch();
    void geofences.refetch();
    void nearby.refetch();
    if (employees.data) void employees.refetch();
  }

  function toggleTrack(employee: NearbyEmployee) {
    if (trackUserId === employee.userId) {
      setTrackUserId(null);
      track.reset();
      return;
    }
    setTrackUserId(employee.userId);
    track.mutate(employee.userId);
  }

  const trackPoints: TrackPointEntity[] = track.data?.tracks ?? [];
  const geofencesForbidden = apiStatus(geofences.error) === 403;
  const refreshing = geofences.isFetching || nearby.isFetching;

  /**
   * Колонки геозон: `cell` — прежняя ячейка таблицы, `card` — роль в карточке
   * телефона (сущность — название геозоны, остальное — поля карточки).
   *
   * `rowTestId` не передан: примитив держит в DOM и таблицу, и карточки, поэтому
   * один id на два представления дал бы два совпадения, а прежние хуки строк
   * (`map-geofence-row-<id>`) сохранены в табличной ячейке
   * (см. `TableOnlyTestId` в UI-ките).
   */
  const geofenceColumns: ResponsiveColumn<GeofenceEntity>[] = [
    {
      key: 'name',
      header: 'Название',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (geofence) => (
        <>
          <TableOnlyTestId id={`map-geofence-row-${geofence.id}`}>
            <span className="block text-neutral-800">{geofence.name ?? 'Без названия'}</span>
          </TableOnlyTestId>
          <span className="block font-mono text-xs font-normal text-neutral-400">
            {shortId(geofence.id)}
          </span>
        </>
      ),
    },
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'w-[160px]',
      card: 'field',
      cardLabel: 'Объект',
      cell: (geofence) =>
        geofence.objectId === objectId && selectedObject ? (
          selectedObject.name
        ) : (
          <span className="font-mono text-xs text-neutral-400">{shortId(geofence.objectId)}</span>
        ),
    },
    {
      key: 'radius',
      header: 'Радиус',
      thClassName: 'w-[140px]',
      mono: true,
      card: 'field',
      cardLabel: 'Радиус',
      cell: (geofence) => (geofence.radiusMeters === null ? '—' : `${geofence.radiusMeters} м`),
    },
    {
      key: 'boundary',
      header: 'Полигон',
      thClassName: 'w-[200px]',
      card: 'field',
      cardLabel: 'Полигон',
      cell: (geofence) =>
        geofence.boundary ? (
          <span className="font-mono text-xs text-neutral-500">
            {geofence.boundary.coordinates[0]?.length ?? 0} координат
          </span>
        ) : (
          <span className="text-xs text-neutral-400">нет геометрии</span>
        ),
    },
    {
      key: 'points',
      header: 'Точек',
      thClassName: 'w-[120px]',
      mono: true,
      card: 'field',
      cardLabel: 'Точек',
      cell: (geofence) => geofence.boundary?.coordinates.length ?? 0,
    },
  ];

  /** Колонки ближайших сотрудников: сущность — сотрудник, трек — действие. */
  const employeeColumns: ResponsiveColumn<NearbyEmployee>[] = [
    {
      key: 'employee',
      header: 'Сотрудник',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (employee) => (
        <>
          <TableOnlyTestId id={`map-employee-row-${employee.userId}`}>
            <span className="block text-neutral-800">
              {employeeNames.get(employee.userId) ?? 'Сотрудник'}
            </span>
          </TableOnlyTestId>
          <span className="block font-mono text-xs font-normal text-neutral-400">
            {shortId(employee.userId)}
          </span>
        </>
      ),
    },
    {
      key: 'distance',
      header: 'Расстояние',
      thClassName: 'w-[140px]',
      mono: true,
      card: 'field',
      cardLabel: 'Расстояние',
      cell: (employee) => formatDistance(employee.distanceMeters),
    },
    {
      key: 'coords',
      header: 'Координаты',
      thClassName: 'w-[180px]',
      mono: true,
      card: 'field',
      cardLabel: 'Координаты',
      cell: (employee) => `${formatCoordinate(employee.lat)}, ${formatCoordinate(employee.lng)}`,
    },
    {
      key: 'timestamp',
      header: 'Точка от',
      thClassName: 'w-[150px]',
      mono: true,
      card: 'field',
      cardLabel: 'Точка от',
      cell: (employee) => formatDateTime(employee.timestamp),
    },
    {
      key: 'battery',
      header: 'Заряд',
      thClassName: 'w-[120px]',
      mono: true,
      card: 'field',
      cardLabel: 'Заряд',
      cell: (employee) => (employee.batteryLevel === null ? '—' : `${employee.batteryLevel} %`),
    },
    {
      key: 'track',
      header: 'Трек',
      thClassName: 'w-[140px]',
      card: 'actions',
      cell: (employee) => (
        <TableOnlyTestId id={`map-track-${employee.userId}`}>
          <Button
            variant={trackUserId === employee.userId ? 'secondary' : 'ghost'}
            size="sm"
            loading={track.isPending && trackUserId === employee.userId}
            onClick={() => toggleTrack(employee)}
          >
            {trackUserId === employee.userId ? 'Скрыть' : 'Показать'}
          </Button>
        </TableOnlyTestId>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Карта"
        subtitle="Геозоны объектов и сотрудники поблизости — Mapbox GL"
        actions={
          <>
            <Button
              variant="secondary"
              className="max-lg:min-h-[44px]"
              onClick={() => applyCenter(DEFAULT_CENTER)}
            >
              Сбросить центр
            </Button>
            <Button
              variant="primary"
              data-testid="map-refresh"
              // Кнопки шапки — `size="md"` (~40 px): на телефоне и планшете ≥44 px.
              className="max-lg:min-h-[44px]"
              loading={refreshing}
              onClick={refreshAll}
            >
              Обновить
            </Button>
          </>
        }
      />

      <Card className="flex flex-col gap-4">
        {/*
          На телефоне фильтры и «Найти здесь» — одной колонкой во всю ширину:
          `w-72`/`w-44`/`w-40` рядом не помещаются в 360 px и распирали бы карточку.
          `max-md:[&>*]:w-full` растягивает прямых детей, контролы внутри `Field`
          уже `w-full`; на планшете и desktop вид прежний.
        */}
        <div className="flex flex-wrap items-end gap-4 max-md:[&>*]:w-full">
          <div className="w-72">
            <Field label="Объект" htmlFor="map-object">
              <Select
                id="map-object"
                data-testid="map-object-select"
                aria-label="Объект"
                value={objectId}
                disabled={objects.isLoading}
                onChange={(event) => selectObject(event.target.value)}
              >
                {/* Пустой вариант — «все геозоны стенда»: без выбранного объекта
                    карта и список не должны выглядеть пустыми. */}
                <option value="">Все объекты ({objects.data?.total ?? 0})</option>
                {(objects.data?.items ?? []).map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="w-44">
            <Field label="Радиус поиска" htmlFor="map-radius">
              <Select
                id="map-radius"
                data-testid="map-radius-select"
                aria-label="Радиус поиска"
                value={String(radius)}
                onChange={(event) => setRadius(Number(event.target.value))}
              >
                {NEARBY_RADIUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option >= 1000 ? `${option / 1000} км` : `${option} м`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="w-40">
            <Field label="Широта" htmlFor="map-lat">
              <Input
                id="map-lat"
                data-testid="map-lat"
                value={latDraft}
                onChange={(event) => setLatDraft(event.target.value)}
                onBlur={applyDraft}
              />
            </Field>
          </div>

          <div className="w-40">
            <Field label="Долгота" htmlFor="map-lng">
              <Input
                id="map-lng"
                data-testid="map-lng"
                value={lngDraft}
                onChange={(event) => setLngDraft(event.target.value)}
                onBlur={applyDraft}
              />
            </Field>
          </div>

          <Button
            variant="secondary"
            data-testid="map-center-apply"
            className="max-lg:min-h-[44px]"
            onClick={applyDraft}
          >
            Найти здесь
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="info">Геозон: {geofencesList.length}</Badge>
          <Badge tone="success">Сотрудников рядом: {employeesList.length}</Badge>
          <Badge tone="neutral">
            Радиус: {radius >= 1000 ? `${radius / 1000} км` : `${radius} м`}
          </Badge>
          {selectedObject && (
            <span className="text-xs text-neutral-500">
              {selectedObject.name} · {selectedObject.address} ·{' '}
              <span className="font-mono">
                {formatCoordinate(selectedObject.lat)}, {formatCoordinate(selectedObject.lng)}
              </span>
            </span>
          )}
        </div>

        {refreshing && !nearby.isLoading && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-500" />
          </div>
        )}
      </Card>

      {token ? (
        <MapCanvas
          accessToken={token}
          center={center}
          geofences={geofencesList}
          employees={employeesList}
          employeeNames={employeeNames}
          track={track.data ? { userId: track.data.userId, points: trackPoints } : null}
          onPickCenter={applyCenter}
        />
      ) : (
        <EmptyState
          title="Ключ Mapbox не настроен"
          hint={
            'Карта не отображается, но данные ниже загружаются и доступны в таблицах. ' +
            'Получите бесплатный токен на https://account.mapbox.com/access-tokens/ ' +
            'и задайте VITE_MAPBOX_TOKEN в .env (см. .env.example), затем перезапустите vite.'
          }
        />
      )}

      {geofences.isError && (
        <ErrorBanner
          error={
            geofencesForbidden
              ? new Error('Недостаточно прав для просмотра геозон')
              : geofences.error
          }
          onRetry={() => void geofences.refetch()}
        />
      )}
      {nearby.isError && (
        <SoftWarning>
          Ближние сотрудники недоступны: gps-service не ответил на запрос. Проверьте, что сервис
          запущен на :3004.
        </SoftWarning>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-neutral-800">
            Геозоны{selectedObject ? ` объекта «${selectedObject.name}»` : ''}
          </h2>
          <span className="text-xs text-neutral-500">{geofencesList.length} шт.</span>
        </div>
        <ResponsiveTable<GeofenceEntity>
          items={geofencesList}
          getKey={(geofence) => geofence.id}
          columns={geofenceColumns}
          loading={geofences.isLoading}
          skeletonRows={3}
          empty={
            selectedObject ? 'У объекта нет геозон — создайте её через API геозон' : 'Геозон нет'
          }
        />
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-neutral-800">
            Сотрудники в радиусе {radius >= 1000 ? `${radius / 1000} км` : `${radius} м`}
          </h2>
          <span className="text-xs text-neutral-500">
            {nearby.data ? `точки не старше ${nearby.data.maxAgeMinutes} мин` : ''}
          </span>
        </div>
        <ResponsiveTable<NearbyEmployee>
          items={employeesList}
          getKey={(employee) => employee.userId}
          columns={employeeColumns}
          // Второй список на странице: свой контейнерный хук, чтобы канонический
          // `card-list`/`responsive-table` остался в DOM ровно один (иначе строгий
          // селектор проверки «таблица скрыта, карточки видны» падал бы на двух
          // совпадениях).
          testId="map-employees-list"
          loading={nearby.isLoading}
          skeletonRows={3}
          empty={
            nearby.isError
              ? 'Не удалось получить список сотрудников'
              : 'В радиусе поиска нет сотрудников со свежими точками'
          }
        />
      </Card>

      {trackUserId && (
        <Card className="flex flex-col gap-2" testId="map-track-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">
              Трек: {employeeNames.get(trackUserId) ?? shortId(trackUserId)}
            </h2>
            <span className="text-xs text-neutral-500">
              {track.isPending
                ? 'Загрузка…'
                : track.data
                  ? `${track.data.count} точек за 24 часа`
                  : track.isError
                    ? 'Ошибка загрузки трека'
                    : ''}
            </span>
          </div>
          {track.isError && (
            <ErrorBanner error={track.error} onRetry={() => track.mutate(trackUserId)} />
          )}
          {track.data && track.data.count === 0 && (
            <p className="text-sm text-neutral-500">За последние 24 часа точек нет.</p>
          )}
          {track.data && track.data.count > 0 && !token && (
            <p className="text-sm text-neutral-500">
              Первая точка: {formatDateTime(track.data.tracks[0].timestamp)}, последняя:{' '}
              {formatDateTime(track.data.tracks[track.data.tracks.length - 1].timestamp)}. Линия
              трека рисуется на карте, когда задан ключ Mapbox.
            </p>
          )}
          {track.data && track.data.count > 0 && (
            <p className="text-xs text-neutral-400">
              Период: {track.data.from ? formatDateTime(track.data.from) : '—'} …{' '}
              {track.data.to ? formatDateTime(track.data.to) : '—'}. Радиус поиска не влияет на
              трек.
            </p>
          )}
        </Card>
      )}

      <p className="text-xs text-neutral-400">
        Источник данных: gps-service (:3004). Имена сотрудников подтягиваются из auth-service
        (/api/users) и доступны только ролям ADMIN и SUPERVISOR — остальным видно короткий id.
      </p>
    </div>
  );
}
