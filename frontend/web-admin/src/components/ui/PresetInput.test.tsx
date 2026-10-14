import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PresetInput } from './PresetInput';

const OPTIONS = ['Вынести мусор', 'Протереть пыль', 'Помыть пол'];

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <PresetInput
      id="op-name"
      data-testid="op-name"
      value={value}
      options={OPTIONS}
      onValueChange={setValue}
    />
  );
}

function optionTexts(): string[] {
  return screen.queryAllByRole('option').map((el) => el.textContent ?? '');
}

describe('PresetInput — выпадающая библиотека', () => {
  it('при фокусе показывает весь список', () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId('op-name'));
    expect(optionTexts()).toEqual(OPTIONS);
  });

  it('выбор пункта заполняет значение и закрывает список', () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId('op-name'));
    fireEvent.mouseDown(screen.getByTestId('preset-option-Протереть пыль'));
    expect((screen.getByTestId('op-name') as HTMLInputElement).value).toBe('Протереть пыль');
    expect(screen.queryByTestId('preset-list')).not.toBeInTheDocument();
  });

  /**
   * Регрессия нативного datalist: Chromium после выбора при повторном открытии
   * показывал только совпадение с текущим значением. Наш список обязан
   * показывать библиотеку целиком.
   */
  it('повторный фокус после выбора снова показывает весь список', () => {
    render(<Harness initial="Протереть пыль" />);
    const input = screen.getByTestId('op-name');
    fireEvent.focus(input);
    expect(optionTexts()).toEqual(OPTIONS);
    expect(optionTexts()).not.toEqual(['Протереть пыль']);
  });

  it('набор текста фильтрует список по подстроке', () => {
    render(<Harness />);
    const input = screen.getByTestId('op-name');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'пыль' } });
    expect(optionTexts()).toEqual(['Протереть пыль']);
  });

  it('опции со своей подписью: в списке — подпись, в значение — value', () => {
    const mockChange = vi.fn();
    render(
      <PresetInput
        id="eq"
        data-testid="eq"
        value=""
        options={['швабра; перчатки', { value: '; маска', label: 'маска (только СИЗ)' }]}
        onValueChange={mockChange}
      />,
    );
    fireEvent.focus(screen.getByTestId('eq'));
    expect(screen.getByText('маска (только СИЗ)')).toBeInTheDocument();
    expect(screen.queryByText('; маска')).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('preset-option-; маска'));
    expect(mockChange).toHaveBeenCalledWith('; маска');
  });

  it('группы: заголовки категорий, порядок пунктов сквозной, повтор показан один раз', () => {
    const mockChange = vi.fn();
    render(
      <PresetInput
        id="type"
        data-testid="type"
        value=""
        groups={[
          { label: 'Свои на этом этаже', values: ['Лобби'] },
          { label: 'Пищевые зоны', values: ['Столовая', 'Кухня'] },
          { label: 'Виды покрытий', values: ['Линолеум', 'Столовая'] },
        ]}
        onValueChange={mockChange}
      />,
    );
    fireEvent.focus(screen.getByTestId('type'));
    expect(screen.getAllByTestId('preset-group').map((el) => el.textContent)).toEqual([
      'Свои на этом этаже',
      'Пищевые зоны',
      'Виды покрытий',
    ]);
    expect(optionTexts()).toEqual(['Лобби', 'Столовая', 'Кухня', 'Линолеум']);
    fireEvent.mouseDown(screen.getByTestId('preset-option-Кухня'));
    expect(mockChange).toHaveBeenCalledWith('Кухня');
  });

  it('группы: фильтр скрывает опустевшие категории, стрелки идут сквозь группы', () => {
    function GroupedHarness() {
      const [value, setValue] = useState('');
      return (
        <PresetInput
          id="type"
          data-testid="type"
          value={value}
          groups={[
            { label: 'Рабочие зоны', values: ['Офис', 'Кабинет'] },
            { label: 'Пищевые зоны', values: ['Столовая', 'Кухня'] },
          ]}
          onValueChange={setValue}
        />
      );
    }
    render(<GroupedHarness />);
    const input = screen.getByTestId('type') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'стол' } });
    expect(screen.getAllByTestId('preset-group').map((el) => el.textContent)).toEqual([
      'Пищевые зоны',
    ]);
    expect(optionTexts()).toEqual(['Столовая']);

    // Полный список: третий пункт сверху — первый во второй группе.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Столовая');
  });

  it('свободный ввод сохраняется: своё значение не из списка', () => {
    render(<Harness />);
    const input = screen.getByTestId('op-name') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Моя операция' } });
    expect(input.value).toBe('Моя операция');
    // список остаётся открытым, но ничего не совпало — панель скрыта
    expect(screen.queryByTestId('preset-list')).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(input.value).toBe('Моя операция');
  });
});
