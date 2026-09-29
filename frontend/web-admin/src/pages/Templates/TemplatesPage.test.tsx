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

  it('просмотр показывает состав шаблона техкарды', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('template-preview-tc-office'));
    const body = screen.getByTestId('template-preview-body');
    expect(body).toHaveTextContent('Вынести мусор');
    expect(body).toHaveTextContent('Помыть пол');
    expect(screen.getByTestId('template-preview-create')).toBeInTheDocument();
  });
});
