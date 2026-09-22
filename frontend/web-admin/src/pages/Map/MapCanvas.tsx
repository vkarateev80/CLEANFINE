import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeofenceEntity, NearbyEmployee, TrackPointEntity } from '../../types/gps';
import { formatCoordinate, formatDistance, shortId, type LatLng } from './helpers';

/**
 * Карта Mapbox GL: полигоны геозон, маркеры ближних сотрудников и опционально
 * трек выбранного сотрудника.
 *
 * Библиотека грузится ДИНАМИЧЕСКИ (`import('mapbox-gl')`) — и не только ради
 * размера чанка. При пустом `VITE_MAPBOX_TOKEN` компонент вообще не монтируется
 * (страница показывает заглушку и таблицы), но статический импорт всё равно
 * тянул бы mapbox-gl в общую сборку админки и в первую загрузку любого экрана.
 *
 * Токен приходит пропом, а не читается из `import.meta.env` здесь: решение
 * «карта или заглушка» принимает страница, компонент только рисует карту.
 */

export interface MapCanvasProps {
  accessToken: string;
  center: LatLng;
  geofences: GeofenceEntity[];
  employees: NearbyEmployee[];
  /** Имена сотрудников по userId: gps-service их не отдаёт (кросс-БД). */
  employeeNames: Map<string, string>;
  /** Трек выбранного сотрудника; `null` — трек не выбран. */
  track: { userId: string; points: TrackPointEntity[] } | null;
  /** Клик по карте или перетаскивание маркера: новая точка поиска. */
  onPickCenter: (point: LatLng) => void;
}

/** Публичный стиль Mapbox: `mapbox://styles/<owner>/<style>`. */
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

const GEOFENCE_SOURCE = 'map-geofences';
const EMPLOYEE_SOURCE = 'map-employees';
const TRACK_SOURCE = 'map-track';

const GEOFENCE_FILL_LAYER = 'map-geofences-fill';
const GEOFENCE_LINE_LAYER = 'map-geofences-line';
const EMPLOYEE_CIRCLE_LAYER = 'map-employees-circle';
const EMPLOYEE_LABEL_LAYER = 'map-employees-label';
const TRACK_LINE_LAYER = 'map-track-line';

/** Точки для попапа и «клик по маркеру — не перенос центра». */
const CLICKABLE_LAYERS = [GEOFENCE_FILL_LAYER, EMPLOYEE_CIRCLE_LAYER, TRACK_LINE_LAYER];

/**
 * Появление источника/слоя: при первом рендере создаём, при следующих просто
 * обновляем данные — повторный `addSource` бросает «source already exists» и
 * роняет карту.
 */
function ensureSource(
  map: import('mapbox-gl').Map,
  id: string,
  data: GeoJSON.FeatureCollection,
): void {
  const source = map.getSource(id) as import('mapbox-gl').GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(id, { type: 'geojson', data });
}

function ensureLayer(map: import('mapbox-gl').Map, layer: import('mapbox-gl').LayerSpecification) {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer);
  }
}

export function MapCanvas({
  accessToken,
  center,
  geofences,
  employees,
  employeeNames,
  track,
  onPickCenter,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('mapbox-gl').Map | null>(null);
  const mapboxRef = useRef<typeof import('mapbox-gl') | null>(null);
  const centerMarkerRef = useRef<import('mapbox-gl').Marker | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Живые данные для отрисовки: карта создаётся один раз и не должна пересоздаваться. */
  const stateRef = useRef({ geofences, employees, employeeNames, track, center });
  stateRef.current = { geofences, employees, employeeNames, track, center };

  /** Колбэк в ref: эффект загрузки не пересоздаёт карту при новом замыкании. */
  const pickCenterRef = useRef(onPickCenter);
  pickCenterRef.current = onPickCenter;
  /** Функция отрисовки, доступная эффектам после `load`. */
  const renderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let mapboxgl: typeof import('mapbox-gl');
      try {
        mapboxgl = await import('mapbox-gl');
      } catch {
        if (!cancelled) setError('Не удалось загрузить библиотеку карты (mapbox-gl)');
        return;
      }
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Токен передаём опцией `Map`, а не через `mapboxgl.accessToken`: у ESM-сборки
      // это свойство живёт на объекте-неймспейсе, и присваивание статическому
      // импорту запрещено компилятором. Опция задаёт тот же глобальный токен,
      // но без обходных путей.
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [stateRef.current.center.lng, stateRef.current.center.lat],
        zoom: 15,
        attributionControl: true,
        accessToken,
      });
      mapRef.current = map;
      mapboxRef.current = mapboxgl;

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');

      const centerMarker = new mapboxgl.Marker({ color: '#2563eb', draggable: true })
        .setLngLat([stateRef.current.center.lng, stateRef.current.center.lat])
        .addTo(map);
      centerMarker.on('dragend', () => {
        const position = centerMarker.getLngLat();
        pickCenterRef.current({ lat: position.lat, lng: position.lng });
      });
      centerMarkerRef.current = centerMarker;

      map.on('error', (event) => {
        // Ошибки приходят и на каждую недоступную плитку — карту не роняем,
        // но причину показываем: при неверном токене это единственный сигнал.
        setError(event.error?.message ?? 'Ошибка карты');
      });

      map.on('load', () => {
        if (cancelled) return;
        setError(null);
        renderRef.current?.();
        setReady(true);
      });

      map.on('click', (event) => {
        // Клик по данным открывает попап, а не переносит центр поиска: иначе
        // просмотр сотрудника двигал бы саму выдачу и список «прыгал».
        const feature = map.queryRenderedFeatures(event.point, { layers: CLICKABLE_LAYERS })[0];
        const layerId = feature?.layer?.id;
        if (feature && layerId) {
          const properties = (feature.properties ?? {}) as Record<string, unknown>;
          const label =
            layerId === GEOFENCE_FILL_LAYER
              ? `Геозона: ${String(properties.name ?? 'без названия')}`
              : layerId === TRACK_LINE_LAYER
                ? 'Трек сотрудника'
                : `${String(properties.label ?? 'Сотрудник')} · ${String(properties.distance ?? '')}`;
          new mapboxgl.Popup({ closeButton: false })
            .setLngLat(event.lngLat)
            .setHTML(`<div style="font-size:12px">${label}</div>`)
            .addTo(map);
          return;
        }
        pickCenterRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      });

      renderRef.current = () => {
        const current = mapRef.current;
        if (!current) return;
        const snapshot = stateRef.current;

        const geofences = snapshot.geofences.flatMap((geofence) =>
          geofence.boundary === null
            ? []
            : [
                {
                  type: 'Feature' as const,
                  id: geofence.id,
                  properties: {
                    id: geofence.id,
                    name: geofence.name ?? 'Без названия',
                    radiusMeters: geofence.radiusMeters,
                  },
                  geometry: geofence.boundary,
                },
              ],
        );
        ensureSource(current, GEOFENCE_SOURCE, { type: 'FeatureCollection', features: geofences });
        ensureLayer(current, {
          id: GEOFENCE_FILL_LAYER,
          type: 'fill',
          source: GEOFENCE_SOURCE,
          paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 },
        });
        ensureLayer(current, {
          id: GEOFENCE_LINE_LAYER,
          type: 'line',
          source: GEOFENCE_SOURCE,
          paint: { 'line-color': '#1d4ed8', 'line-width': 2 },
        });

        const employees = snapshot.employees.map((employee) => {
          const name = snapshot.employeeNames.get(employee.userId) ?? shortId(employee.userId);
          return {
            type: 'Feature' as const,
            id: employee.userId,
            properties: {
              userId: employee.userId,
              label: name,
              distance: formatDistance(employee.distanceMeters),
            },
            geometry: { type: 'Point' as const, coordinates: [employee.lng, employee.lat] },
          };
        });
        ensureSource(current, EMPLOYEE_SOURCE, { type: 'FeatureCollection', features: employees });
        ensureLayer(current, {
          id: EMPLOYEE_CIRCLE_LAYER,
          type: 'circle',
          source: EMPLOYEE_SOURCE,
          paint: {
            'circle-radius': 7,
            'circle-color': '#16a34a',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        });
        ensureLayer(current, {
          id: EMPLOYEE_LABEL_LAYER,
          type: 'symbol',
          source: EMPLOYEE_SOURCE,
          layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.5] },
          paint: { 'text-color': '#14532d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });

        const trackPoints = snapshot.track?.points ?? [];
        const trackFeatures =
          snapshot.track && trackPoints.length > 1
            ? [
                {
                  type: 'Feature' as const,
                  properties: {},
                  geometry: {
                    type: 'LineString' as const,
                    coordinates: trackPoints.map((point) => [point.lng, point.lat]),
                  },
                },
              ]
            : [];
        ensureSource(current, TRACK_SOURCE, { type: 'FeatureCollection', features: trackFeatures });
        ensureLayer(current, {
          id: TRACK_LINE_LAYER,
          type: 'line',
          source: TRACK_SOURCE,
          paint: { 'line-color': '#dc2626', 'line-width': 3, 'line-opacity': 0.8 },
        });
      };

      // Слои данных создаём сразу после `load`, а не ждём изменения пропсов:
      // карта может открыться уже с загруженными геозонами.
      if (map.loaded()) {
        renderRef.current();
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      renderRef.current = null;
      centerMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [accessToken]);

  // Данные изменились после `load` — перерисовываем.
  useEffect(() => {
    if (ready) renderRef.current?.();
  }, [ready, geofences, employees, employeeNames, track]);

  // Центр изменился выбором объекта или кликом снаружи — переезжаем и двигаем маркер.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.easeTo({ center: [center.lng, center.lat], duration: 400 });
    centerMarkerRef.current?.setLngLat([center.lng, center.lat]);
  }, [ready, center.lat, center.lng]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
      {/*
        Высота карты: на телефоне 360 px вместо 520 — при 520 карта занимает
        почти весь экран, и до списков геозон под ней приходится долго листать.
        Ширина всегда 100%, жесты pan/zoom остаются нативными (их даёт mapbox-gl).
      */}
      <div
        ref={containerRef}
        className="h-[520px] w-full max-md:h-[360px]"
        data-testid="map-canvas"
      />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100/80 text-sm text-neutral-500">
          Загрузка карты…
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute bottom-3 left-3 right-3 rounded-lg border border-danger-500 bg-white/95 px-3 py-2 text-xs text-danger-600"
          data-testid="map-error"
        >
          {error}
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-neutral-200 bg-white/90 px-3 py-1 font-mono text-xs text-neutral-600">
        {formatCoordinate(center.lat)}, {formatCoordinate(center.lng)}
      </div>
    </div>
  );
}
