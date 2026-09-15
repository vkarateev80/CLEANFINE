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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-500">
      <span className="font-mono text-xs">
        {from}–{to} из {total}
      </span>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          На странице
          <Select
            value={take}
            disabled={disabled}
            onChange={(event) => onChange({ skip: 0, take: Number(event.target.value) })}
            className="w-20 py-1 text-xs"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || !canPrev}
            onClick={() => onChange({ skip: Math.max(0, skip - take), take })}
          >
            Назад
          </Button>
          <Button
            variant="secondary"
            size="sm"
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
