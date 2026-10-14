import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listUsers, setUserPassword } from '../../api/users';
import { useAuthStore } from '../../stores/authStore';
import type { SessionUser } from '../../types';
import { EmployeesPage } from './EmployeesPage';

vi.mock('../../api/users', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  setUserPassword: vi.fn(),
}));

const mockListUsers = vi.mocked(listUsers);
const mockSetUserPassword = vi.mocked(setUserPassword);

const EMPLOYEE: SessionUser = {
  id: 'emp-1',
  email: 'operator',
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
    expect(within(activeRow).getByText('operator')).toBeInTheDocument();
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
    expect(role.options.length).toBe(5);
    expect(role.value).toBe('OPERATOR');
  });

  it('ADMIN: «Удалить» открывает подтверждение с предупреждением о необратимости', async () => {
    renderPage();
    const [row] = await screen.findAllByTestId('employee-row-emp-1');
    fireEvent.click(within(row).getByTestId('employee-delete-emp-1'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/насовсем/)).toBeInTheDocument();
    expect(within(dialog).getByText(/нельзя|необратимо/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
    // Деактивация — отдельное действие, эта кнопка не про неё
    expect(
      within(dialog).queryByRole('button', { name: 'Деактивировать' }),
    ).not.toBeInTheDocument();
  });

  it('ADMIN: «Пароль» открывает форму, проверяет совпадение и шлёт новый пароль', async () => {
    mockSetUserPassword.mockResolvedValue(undefined);
    renderPage();
    const [row] = await screen.findAllByTestId('employee-row-emp-1');
    fireEvent.click(within(row).getByTestId('employee-password-emp-1'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Новый пароль — Оператор/)).toBeInTheDocument();
    const password = within(dialog).getByLabelText(/^Новый пароль/) as HTMLInputElement;
    const repeat = within(dialog).getByLabelText(/Повторите пароль/) as HTMLInputElement;
    expect(password.type).toBe('password');

    // Короткий и несовпадающий — на сервер не уходит.
    fireEvent.change(password, { target: { value: '123' } });
    fireEvent.change(repeat, { target: { value: '124' } });
    fireEvent.click(within(dialog).getByTestId('employee-password-submit'));
    expect(await within(dialog).findByText(/не короче 6 символов/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Пароли не совпадают/)).toBeInTheDocument();
    expect(mockSetUserPassword).not.toHaveBeenCalled();

    fireEvent.change(password, { target: { value: 'new-pass-123' } });
    fireEvent.change(repeat, { target: { value: 'new-pass-123' } });
    fireEvent.click(within(dialog).getByTestId('employee-password-submit'));
    expect(await screen.findByTestId('employees-notice')).toHaveTextContent(/Пароль для «Оператор» обновлён/);
    expect(mockSetUserPassword).toHaveBeenCalledWith('emp-1', 'new-pass-123');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
