import { useId, useState, type KeyboardEvent } from 'react';
import type { PresetOptionValue } from '../../templates/presets';
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
 */

export interface PresetInputProps extends Omit<InputProps, 'onChange' | 'value' | 'list'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Вся библиотека значений: строки или пары «значение → человеческая подпись». */
  options: PresetOptionValue[];
}

export function PresetInput({ value, onValueChange, options, ...inputProps }: PresetInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  /** false — показываем весь список; true — фильтруем по набранному тексту. */
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);

  const normalized = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  const query = typed ? value.trim().toLowerCase() : '';
  const filtered = query
    ? normalized.filter(
        (option) =>
          option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
      )
    : normalized;

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
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={index === active}
              data-testid={`preset-option-${option.value}`}
              className={[
                'cursor-pointer px-3 py-1.5 text-sm',
                index === active ? 'bg-primary-50 text-primary-700' : 'text-neutral-700',
                'hover:bg-neutral-50',
              ].join(' ')}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option.value);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
