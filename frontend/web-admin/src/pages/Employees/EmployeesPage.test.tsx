import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listUsers } from '../../api/users';
import { useAuthStore } from '../../stores/authStore';
import type { SessionUser } from '../../types';
import { EmployeesPage } from './EmployeesPage';

vi.mock('../../api/users', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  getUser: vi.fn(),
}));

const mockListUsers = vi.mocked(listUsers);

const EMPLOYEE: SessionUser = {
  id: 'emp-1',
  email: 'operator@cleaning-ops.com',
  phone: '+79990000003',
  fullName: 'Оператор',
  role: 'OPERATOR',
  avatarUrl: null,
  isActive: true,
};

const INACTIVE: SessionUser = {
  id: 'emp-2',
  email: 'fired@cleaning-ops.com',
  phone: null,
  fullName: 'Уволенный',
  role: 'OPERATOR',
  avatarUrl: null,
  isActive: false,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmployeesPage />
    </QueryClientProvider>,
  );
}

describe('Раздел «Сотрудники»', () => {
  beforeEach(() => {
    mockListUsers.mockResolvedValue({ items: [EMPLOYEE, INACTIVE], total: 2 });
    useAuthStore.setState({
      user: { ...EMPLOYEE, role: 'ADMIN', fullName: 'Администратор', email: 'admin@x.ru' },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('показывает список сотрудников со статусами', async () => {
    renderPage();
    expect(screen.getByTestId('employees-page')).toBeInTheDocument();

    // Ждём строки таблицы: «Оператор» есть и в фильтре ролей, а строки
    // дублируются в двух представлениях ResponsiveTable (desktop + карточки).
    const [activeRow] = await screen.findAllByTestId('employee-row-emp-1');
    const [inactiveRow] = await screen.findAllByTestId('employee-row-emp-2');
    // ФИО «Оператор» совпадает с лейблом роли — сверяемся по email.
    expect(within(activeRow).getByText('operator@cleaning-ops.com')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('fired@cleaning-ops.com')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Уволенный')).toBeInTheDocument();
    expect(within(activeRow).getByText('Активен')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Деактивирован')).toBeInTheDocument();
  });

  it('ADMIN видит кнопку создания и открывает форму', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('employee-create-button'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/ФИО/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Email/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Пароль/)).toBeInTheDocument();
    // Роль — закрытый enum из shared
    const role = within(dialog).getByLabelText(/Роль/) as HTMLSelectElement;
    expect(role.options.length).toBe(4);
    expect(role.value).toBe('OPERATOR');
  });

  it('SUPERVISOR — режим просмотра без кнопки создания', async () => {
    useAuthStore.setState({
      user: { ...EMPLOYEE, role: 'SUPERVISOR', fullName: 'Бригадир', email: 'sup@x.ru' },
    });
    renderPage();
    await screen.findAllByTestId('employee-row-emp-1');
    expect(screen.queryByTestId('employee-create-button')).not.toBeInTheDocument();
    expect(screen.getByText(/Режим просмотра/)).toBeInTheDocument();
  });
});
