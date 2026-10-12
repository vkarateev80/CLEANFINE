import {
  Fragment,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { PresetOptionGroup, PresetOptionValue } from '../../templates/presets';
import { Input, type InputProps } from './Input';

/**
 * Текстовое поле с выпадающей библиотекой значений (комбобокс).
 *
 * Заменяет нативный `<input list>` + `<datalist>`: у datalist в Chromium есть
 * известное поведение — после выбора пункта повторное открытие списка показывает
 * только совпадение с текущим значением («остаётся виден только выбранный
 * пункт»). Здесь список всегда рисуется компонентом: при открытии — вся
 * библиотека, при наборе текста — фильтр по подстроке; своё значение ввести
 * можно как раньше (поле остаётся свободным).
 *
 * Клавиатура: ↑/↓ — выбор, Enter — подтвердить, Escape — закрыть.
 * Клик по пункту использует onMouseDown с preventDefault, чтобы поле не
 * теряло фокус и не закрывало список до выбора.
 *
 * Библиотека с категориями (`groups`) рисуется с заголовками групп; пустые
 * после фильтра группы скрываются, повтор значения в двух группах показывается
 * один раз (первая группа выигрывает). ↑/↓ идут сквозь группы.
 */

export interface PresetInputProps extends Omit<InputProps, 'onChange' | 'value' | 'list'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Вся библиотека значений: строки или пары «значение → человеческая подпись». */
  options?: readonly PresetOptionValue[];
  /** Библиотека по категориям — вместо `options`; заголовки групп в списке. */
  groups?: readonly PresetOptionGroup[];
  /**
   * Маркер слева от подписи пункта (например, точка цвета инвентаря по типу
   * помещения). `null`/`undefined` — пункт без маркера.
   */
  optionMarker?: (value: string) => ReactNode;
  /** Стиль текста пункта (например, цвет шрифта по цвету инвентаря). */
  optionStyle?: (value: string) => CSSProperties | undefined;
}

interface NormalizedOption {
  value: string;
  label: string;
}

interface NormalizedGroup {
  label: string | null;
  options: NormalizedOption[];
}

function normalizeOptions(options: readonly PresetOptionValue[]): NormalizedOption[] {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
}

export function PresetInput({
  value,
  onValueChange,
  options,
  groups,
  optionMarker,
  optionStyle,
  ...inputProps
}: PresetInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** false — показываем весь список; true — фильтруем по набранному тексту. */
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);

  const sourceGroups: NormalizedGroup[] = groups
    ? groups.map((group) => ({ label: group.label, options: normalizeOptions(group.values) }))
    : [{ label: null, options: normalizeOptions(options ?? []) }];
  const seen = new Set<string>();
  const query = typed ? value.trim().toLowerCase() : '';
  const filteredGroups = sourceGroups
    .map((group) => ({
      label: group.label,
      options: group.options.filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return (
          query === '' ||
          option.label.toLowerCase().includes(query) ||
          option.value.toLowerCase().includes(query)
        );
      }),
    }))
    .filter((group) => group.options.length > 0);
  /** Плоский список для клавиатуры: индекс сквозной через все группы. */
  const filtered = filteredGroups.flatMap((group) => group.options);

  function choose(option: string) {
    onValueChange(option);
    setOpen(false);
    setTyped(false);
    setActive(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setTyped(false);
        setActive(0);
        return;
      }
      setActive((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && active >= 0 && filtered[active] !== undefined) {
      event.preventDefault();
      choose(filtered[active].value);
    } else if (event.key === 'Escape' && open) {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        {...inputProps}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onFocus={() => {
          setOpen(true);
          setTyped(false);
          setActive(-1);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setTyped(true);
          setOpen(true);
          onValueChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          data-testid="preset-list"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {filteredGroups.map((group, groupIndex) => {
            // Сквозной индекс пункта: сумма размеров предыдущих групп.
            const offset = filteredGroups
              .slice(0, groupIndex)
              .reduce((sum, previous) => sum + previous.options.length, 0);
            return (
              <Fragment key={group.label ?? '__flat'}>
                {group.label !== null && (
                  <li
                    role="presentation"
                    data-testid="preset-group"
                    className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400"
                  >
                    {group.label}
                  </li>
                )}
                {group.options.map((option, optionIndex) => {
                  const index = offset + optionIndex;
                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={index === active}
                      data-testid={`preset-option-${option.value}`}
                      className={[
                        'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                        index === active ? 'bg-primary-50 text-primary-700' : 'text-neutral-700',
                        'hover:bg-neutral-50',
                      ].join(' ')}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option.value);
                      }}
                      onMouseEnter={() => setActive(index)}
                    >
                      {optionMarker?.(option.value)}
                      <span style={optionStyle?.(option.value)}>{option.label}</span>
                    </li>
                  );
                })}
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
