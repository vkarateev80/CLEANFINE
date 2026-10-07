import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_LIBRARY } from '../../templates/library';
import { TemplatesPage } from './TemplatesPage';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Страница «Шаблоны»', () => {
  it('рендерит заголовок и карточки всех шаблонов', () => {
    renderPage();
    expect(screen.getByTestId('templates-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Шаблоны' })).toBeInTheDocument();
    for (const template of TEMPLATE_LIBRARY) {
      expect(screen.getByTestId(`template-card-${template.id}`)).toBeInTheDocument();
    }
  });

  it('фильтр по категории показывает только её шаблоны', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('template-category-routes'));
    expect(screen.getByTestId('template-card-rt-daily')).toBeInTheDocument();
    expect(screen.getByTestId('template-card-rt-night')).toBeInTheDocument();
    expect(screen.queryByTestId('template-card-tc-office')).not.toBeInTheDocument();
    expect(screen.queryByTestId('template-card-obj-bc')).not.toBeInTheDocument();
  });

  it('просмотр показывает состав шаблона техкарты', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('template-preview-tc-office'));
    const body = screen.getByTestId('template-preview-body');
    expect(body).toHaveTextContent('Вынести мусор');
    expect(body).toHaveTextContent('Помыть пол');
    expect(screen.getByTestId('template-preview-create')).toBeInTheDocument();
  });

  it('таблички цветовой кодировки: четыре цвета, скачивание PDF вместо создания', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('template-category-color-coding'));
    for (const zone of ['red', 'blue', 'green', 'yellow']) {
      expect(screen.getByTestId(`template-card-sign-${zone}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`template-create-sign-${zone}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`template-download-sign-${zone}`)).toHaveAttribute(
        'href',
        expect.stringContaining('color-coding/'),
      );
    }
    expect(screen.queryByTestId('template-card-tc-office')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('template-preview-sign-red'));
    const body = screen.getByTestId('template-preview-body');
    expect(body).toHaveTextContent('Санитарные зоны');
    expect(body).toHaveTextContent('Ершик');
    expect(screen.getByTestId('template-preview-download')).toBeInTheDocument();
    expect(screen.queryByTestId('template-preview-create')).not.toBeInTheDocument();
  });
});
