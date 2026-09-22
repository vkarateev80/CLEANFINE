import { Button } from './Button';
import { Select } from './Input';

export interface PaginationProps {
  total: number;
  skip: number;
  take: number;
  /** `take` меняется отдельно — страница сбрасывает `skip` в 0. */
  onChange: (next: { skip: number; take: number }) => void;
  disabled?: boolean;
}

const PAGE_SIZES = [25, 50, 100];

/**
 * Серверная пагинация `skip`/`take` — соглашение всех сервисов (ответ `{ items, total }`).
 * Максимум `take` на бэкенде — 100, поэтому больших значений в списке нет.
 */
export function Pagination({ total, skip, take, onChange, disabled }: PaginationProps) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);
  const canPrev = skip > 0;
  const canNext = skip + take < total;

  return (
    // `px-3 md:px-4`: на телефоне отступ строки меньше — счётчик и «На странице»
    // должны ужиматься, а не выдавливать кнопки навигации за экран.
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-3 py-3 text-sm text-neutral-500 md:px-4">
      <span className="font-mono text-xs">
        {from}–{to} из {total}
      </span>

      {/* `max-md:flex-wrap`, а не безусловный `flex-wrap`: в узкой десктопной панели
          (левая колонка каскада маршрутов `lg:grid-cols-[22rem_…]` = 352 px, ширина
          самой пагинации на стенде — 318 px) перенос выбрасывал «Назад/Вперёд» на
          вторую строку, и пагинация росла с 87 до 131 px — видимое изменение desktop,
          запрещённое критерием приёмки. На телефоне перенос нужен: счётчик и
          «На странице» не должны выдавливать кнопки за экран. */}
      <div className="flex items-center gap-3 max-md:flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          На странице
          <Select
            value={take}
            disabled={disabled}
            onChange={(event) => onChange({ skip: 0, take: Number(event.target.value) })}
            // `py-1 text-xs` — десктопная плотность строки; на телефоне поле всё
            // равно ≥44 px из `CONTROL` (`max-lg:min-h-[44px]`).
            className="w-20 py-1 text-xs"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>

        {/* Кнопки на телефоне растягиваются на равные доли строки: `size="sm"`
            даёт тач-высоту 44 px, а `flex-1` — ширину, достаточную для пальца. */}
        <div className="flex gap-2 max-md:flex-1">
          <Button
            variant="secondary"
            size="sm"
            className="max-md:flex-1"
            disabled={disabled || !canPrev}
            onClick={() => onChange({ skip: Math.max(0, skip - take), take })}
          >
            Назад
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="max-md:flex-1"
            disabled={disabled || !canNext}
            onClick={() => onChange({ skip: skip + take, take })}
          >
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}
