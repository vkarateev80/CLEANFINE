import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, PageHeader } from '../../components/ui';
import { useCanMoveMaterials } from '../../hooks/usePermissions';
import { MOVEMENT_TYPE_LABELS, type CreateMovementResult } from '../../types/materials';
import { CatalogPanel } from './CatalogPanel';
import { MovementModal, type MovementPreset } from './MovementModal';
import { MovementsPanel } from './MovementsPanel';
import { ReportPanel } from './ReportPanel';
import { StocksPanel } from './StocksPanel';
import { formatQuantity } from './materialsHelpers';
import { useObjectOptions } from './useMaterials';

/**
 * Экран «Материалы» (М4.3) — четыре вкладки одного раздела:
 *  • «Справочник» — что за материалы есть, нормы, пороги, цены, поставщики;
 *  • «Остатки» — сколько чего лежит на объекте и что ниже порога;
 *  • «История» — движения по материалу за период;
 *  • «Отчёт» — сколько израсходовано и во сколько это обошлось.
 *
 * Вкладка и фильтры живут в query-строке (`?tab=stocks&stockObjectId=…`), как на
 * остальных экранах: ссылку на конкретный отчёт можно передать коллеге, а возврат
 * назад восстанавливает состояние. Ключи фильтров у вкладок разные, поэтому
 * переключение вкладок не сбрасывает чужой отбор.
 *
 * Права — по фактическим `@Roles` material-service (см. `usePermissions.ts`):
 * чтение доступно всем авторизованным, справочник правят ADMIN/SUPERVISOR,
 * движения проводит ещё и OPERATOR. Поэтому раздел не закрыт RoleGuard'ом в
 * роутере, а кнопки внутри зависят от роли.
 */

type TabKey = 'catalog' | 'stocks' | 'movements' | 'report';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'catalog', label: 'Справочник' },
  { key: 'stocks', label: 'Остатки' },
  { key: 'movements', label: 'История движений' },
  { key: 'report', label: 'Отчёт по расходу' },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'catalog' || value === 'stocks' || value === 'movements' || value === 'report';
}

export function MaterialsPage() {
  const [params, setParams] = useSearchParams();
  const canMove = useCanMoveMaterials();
  const objects = useObjectOptions();

  const tabParam = params.get('tab');
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'catalog';

  /** Открытая модалка движения: `null` — закрыта. */
  const [movement, setMovement] = useState<MovementPreset | null>(null);
  /** Результат последнего движения — строка-подтверждение над вкладками. */
  const [notice, setNotice] = useState<string | null>(null);

  function selectTab(next: TabKey) {
    setParams(
      (current) => {
        const paramsNext = new URLSearchParams(current);
        if (next === 'catalog') paramsNext.delete('tab');
        else paramsNext.set('tab', next);
        return paramsNext;
      },
      { replace: true },
    );
  }

  function handleMovementDone(
    result: CreateMovementResult,
    materialName: string,
    unit: string,
  ) {
    const movementType = MOVEMENT_TYPE_LABELS[result.movement.type];
    const balances = result.stocks
      .map((stock) => {
        const objectName =
          (objects.data?.items ?? []).find((object) => object.id === stock.objectId)?.name ??
          stock.objectId;
        return `${objectName}: ${formatQuantity(stock.quantity)} ${unit}`;
      })
      .join(', ');
    setNotice(
      `${movementType} · ${materialName} — ${formatQuantity(result.movement.quantity)} ${unit}. ` +
        `Остаток после операции: ${balances}`,
    );
    setMovement(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Материалы"
        subtitle="Справочник, остатки по объектам, движения и отчёт по расходу"
        actions={
          canMove ? (
            <Button
              variant="primary"
              data-testid="movement-open-button"
              onClick={() => {
                setNotice(null);
                setMovement({});
              }}
            >
              Приход / расход
            </Button>
          ) : null
        }
      />

      {notice && (
        <div
          role="status"
          data-testid="movement-notice"
          className="flex items-start justify-between gap-3 rounded-lg border border-success-500 bg-white px-4 py-3 text-sm text-success-600"
        >
          <span>{notice}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice(null)} aria-label="Скрыть">
            ✕
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-neutral-200" role="tablist">
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`materials-tab-${item.key}`}
              onClick={() => selectTab(item.key)}
              className={[
                '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
                active
                  ? 'border-primary-500 font-medium text-primary-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800',
              ].join(' ')}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'catalog' && (
        <CatalogPanel
          onMove={(preset) => {
            setNotice(null);
            setMovement(preset);
          }}
        />
      )}
      {tab === 'stocks' && (
        <StocksPanel
          onMove={(preset) => {
            setNotice(null);
            setMovement(preset);
          }}
        />
      )}
      {tab === 'movements' && <MovementsPanel />}
      {tab === 'report' && <ReportPanel />}

      {/*
        Модалка монтируется заново на каждое открытие (`key` по предзаполнению):
        иначе состояние формы осталось бы от предыдущего вызова — с прежним
        материалом и количеством.
      */}
      {movement && (
        <MovementModal
          key={`${movement.materialId ?? ''}-${movement.objectId ?? ''}-${movement.type ?? ''}`}
          open
          preset={movement}
          onClose={() => setMovement(null)}
          onDone={handleMovementDone}
        />
      )}
    </div>
  );
}
