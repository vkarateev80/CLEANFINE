import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu, menuPosition } from './ActionMenu';

describe('ActionMenu', () => {
  it('меню рисуется вне обрезающей обёртки таблицы (дефект 07.11.2026)', () => {
    const onDelete = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div data-testid="table-wrap" style={{ overflow: 'hidden' }} onClick={onRowClick}>
        <div onClick={(event) => event.stopPropagation()}>
          <ActionMenu
            label="Действия: Этаж 1"
            items={[
              { label: 'Редактировать', onSelect: vi.fn() },
              { label: 'Удалить', tone: 'danger', onSelect: onDelete },
            ]}
          />
        </div>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия: Этаж 1' }));
    const menu = screen.getByRole('menu');
    expect(screen.getByTestId('table-wrap').contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // Клик по пункту не проваливается в строку таблицы.
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('закрывается по клику вне и по Esc, клик внутри меню не закрывает', () => {
    render(<ActionMenu items={[{ label: 'Удалить', onSelect: vi.fn() }]} />);
    const toggle = screen.getByRole('button', { name: 'Действия' });

    fireEvent.click(toggle);
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('menuPosition', () => {
  const viewport = { width: 1280, height: 800 };

  it('по умолчанию — под кнопкой, правый край по кнопке', () => {
    expect(menuPosition({ top: 100, bottom: 132, right: 900 }, 80, viewport)).toEqual({
      top: 136,
      left: 900 - 224,
    });
  });

  it('у нижнего края окна — над кнопкой', () => {
    expect(menuPosition({ top: 740, bottom: 772, right: 900 }, 80, viewport)).toEqual({
      top: 740 - 4 - 80,
      left: 676,
    });
  });

  it('не выходит за левый и правый край окна', () => {
    expect(menuPosition({ top: 100, bottom: 132, right: 40 }, 80, viewport).left).toBe(8);
    expect(menuPosition({ top: 100, bottom: 132, right: 1400 }, 80, viewport).left).toBe(
      1280 - 224 - 8,
    );
  });
});
