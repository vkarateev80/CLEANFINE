import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Broken(): never {
  throw new Error('Cannot read properties of undefined');
}

describe('AppErrorBoundary', () => {
  it('ошибка рендера → текст ошибки и кнопки вместо белой страницы', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );
    const alert = screen.getByTestId('app-error-boundary');
    expect(alert).toHaveTextContent('Страница не открылась');
    expect(alert).toHaveTextContent('Cannot read properties of undefined');
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Сбросить данные и войти заново' }),
    ).toBeInTheDocument();
    silence.mockRestore();
  });

  it('без ошибки рендерит детей как есть', () => {
    render(
      <AppErrorBoundary>
        <span>всё в порядке</span>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('всё в порядке')).toBeInTheDocument();
    expect(screen.queryByTestId('app-error-boundary')).not.toBeInTheDocument();
  });
});
