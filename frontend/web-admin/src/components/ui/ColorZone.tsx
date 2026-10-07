import {
  COLOR_ZONES,
  COLOR_ZONE_META,
  colorZoneDescription,
  type ColorZone,
} from '@cleaning-ops/shared/types/color-coding';

/**
 * Цветовая кодировка инвентаря в UI: точка, бейдж и легенда.
 *
 * Цвета — фирменные цвета табличек (`COLOR_ZONE_META.hex`), а не токены темы:
 * красный/синий/зелёный/жёлтый инвентаря должны совпадать с реальными
 * табличками на постах уборки, иначе система теряет смысл. Поэтому здесь
 * inline-стили, а не tailwind-классы.
 */

export function ColorZoneDot({
  zone,
  size = 10,
  className,
}: {
  zone: ColorZone;
  size?: number;
  className?: string;
}) {
  const meta = COLOR_ZONE_META[zone];
  return (
    <span
      aria-hidden="true"
      data-testid={`color-zone-dot-${zone}`}
      className={['inline-block shrink-0 rounded-full', className ?? ''].join(' ')}
      style={{
        width: size,
        height: size,
        backgroundColor: meta.hex,
        boxShadow: `inset 0 0 0 1px ${meta.hexDark}`,
      }}
    />
  );
}

/**
 * Бейдж «● Красный»: подпись — название цвета, всплывающая подсказка — зона.
 * `detail` добавляет зону прямо в подпись («Красный · санитарные зоны»).
 */
export function ColorZoneBadge({
  zone,
  detail = false,
  className,
}: {
  zone: ColorZone;
  detail?: boolean;
  className?: string;
}) {
  const meta = COLOR_ZONE_META[zone];
  return (
    <span
      data-testid={`color-zone-badge-${zone}`}
      title={colorZoneDescription(zone)}
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className ?? '',
      ].join(' ')}
      style={{ backgroundColor: meta.hexSoft, borderColor: meta.hex, color: meta.hexDark }}
    >
      <ColorZoneDot zone={zone} size={8} />
      <span className="truncate">
        {meta.name}
        {detail && <span className="font-normal"> · {meta.zoneName.toLowerCase()}</span>}
      </span>
    </span>
  );
}

/** Легенда четырёх цветов для плана этажа и экспликации. */
export function ColorZoneLegend({ className }: { className?: string }) {
  return (
    <ul
      data-testid="color-zone-legend"
      aria-label="Цветовая кодировка инвентаря"
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600',
        className ?? '',
      ].join(' ')}
    >
      {COLOR_ZONES.map((zone) => (
        <li key={zone} className="flex items-center gap-1.5" title={colorZoneDescription(zone)}>
          <ColorZoneDot zone={zone} size={8} />
          {COLOR_ZONE_META[zone].zoneName}
        </li>
      ))}
    </ul>
  );
}
