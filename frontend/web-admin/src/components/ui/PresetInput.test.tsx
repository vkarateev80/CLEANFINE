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
