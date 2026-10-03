import { useMemo, useState, type FormEvent } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@cleaning-ops/shared/types/roles';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { ResponsiveTable, type ResponsiveColumn } from '../../components/ui/ResponsiveTable';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useIsAdmin } from '../../hooks/usePermissions';
import type { SessionUser } from '../../types';
import {
  useCreateEmployee,
  useDeactivateEmployee,
  useDeleteEmployee,
  useEmployees,
  useUpdateEmployee,
} from './useEmployees';

/**
 * Раздел «Сотрудники» (`/employees`, RoleGuard ADMIN/SUPERVISOR).
 *
 * Справочник пользователей auth-service: список и поиск — ADMIN и SUPERVISOR
 * (`GET /users`), создание/правка/деактивация — только ADMIN (`POST`/`PATCH`/
 * `DELETE`). DELETE — мягкая деактивация: строка остаётся, вход блокируется (401),
 * возврат — `PATCH { isActive: true }` (UAT A8, раздел docs/UAT_ADMIN.md).
 *
 * Роль — закрытый enum (Select), пароль задаётся при создании и дальше не
 * редактируется: API смены пароля для админки нет.
 */

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type DialogKind = 'create' | 'edit' | 'deactivate' | 'delete';

interface ActiveDialog {
  kind: DialogKind;
  employee?: SessionUser;
}

interface CreateFormState {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
}

interface EditFormState {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
}

const EMPTY_CREATE: CreateFormState = {
  fullName: '',
  email: '',
  phone: '',
  role: 'OPERATOR',
  password: '',
};

function validateEmail(email: string): string | null {
  return email.includes('@') && email.includes('.') ? null : 'Некорректный email';
}

export function EmployeesPage() {
  const isAdmin = useIsAdmin();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [skip, setSkip] = useState(0);
  const [take, setTake] = useState(PAGE_SIZE_OPTIONS[0]);

  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [dialogError, setDialogError] = useState<unknown>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE);
  const [editForm, setEditForm] = useState<EditFormState>({
    fullName: '',
    email: '',
    phone: '',
    role: 'OPERATOR',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const trimmedSearch = debouncedSearch.trim();
  const params = useMemo(
    () => ({
      skip,
      take,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(statusFilter ? { isActive: statusFilter === 'active' } : {}),
    }),
    [skip, take, trimmedSearch, roleFilter, statusFilter],
  );

  const { data, isLoading, isFetching, error, refetch } = useEmployees(params);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deactivateEmployee = useDeactivateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const busy =
    createEmployee.isPending ||
    updateEmployee.isPending ||
    deactivateEmployee.isPending ||
    deleteEmployee.isPending;

  function resetFilters() {
    setSkip(0);
  }

  function openCreate() {
    setDialogError(null);
    setFieldErrors({});
    setCreateForm(EMPTY_CREATE);
    setDialog({ kind: 'create' });
  }

  function openEdit(employee: SessionUser) {
    setDialogError(null);
    setFieldErrors({});
    setEditForm({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone ?? '',
      role: employee.role,
    });
    setDialog({ kind: 'edit', employee });
  }

  function openDeactivate(employee: SessionUser) {
    setDialogError(null);
    setDialog({ kind: 'deactivate', employee });
  }

  function openDelete(employee: SessionUser) {
    setDialogError(null);
    setDialog({ kind: 'delete', employee });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string | null> = {
      fullName: createForm.fullName.trim() ? null : 'Укажите ФИО',
      email: validateEmail(createForm.email.trim()),
      password: createForm.password.length >= 6 ? null : 'Пароль должен быть не короче 6 символов',
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setDialogError(null);
    try {
      await createEmployee.mutateAsync({
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim() || undefined,
        role: createForm.role,
        password: createForm.password,
      });
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!dialog?.employee) return;
    const errors: Record<string, string | null> = {
      fullName: editForm.fullName.trim() ? null : 'Укажите ФИО',
      email: validateEmail(editForm.email.trim()),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setDialogError(null);
    try {
      await updateEmployee.mutateAsync({
        id: dialog.employee.id,
        payload: {
          fullName: editForm.fullName.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || undefined,
          role: editForm.role,
        },
      });
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleDeactivate() {
    if (!dialog?.employee) return;
    setDialogError(null);
    try {
      await deactivateEmployee.mutateAsync(dialog.employee.id);
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleDelete() {
    if (!dialog?.employee) return;
    setDialogError(null);
    try {
      await deleteEmployee.mutateAsync(dialog.employee.id);
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleReactivate(employee: SessionUser) {
    setDialogError(null);
    try {
      await updateEmployee.mutateAsync({ id: employee.id, payload: { isActive: true } });
    } catch (err) {
      setDialogError(err);
    }
  }

  const columns: ResponsiveColumn<SessionUser>[] = [
    {
      key: 'fullName',
      header: 'ФИО',
      cell: (employee) => <span className="font-medium text-neutral-900">{employee.fullName}</span>,
      card: 'title',
    },
    {
      key: 'email',
      header: 'Email',
      cell: (employee) => <span className="break-all text-sm">{employee.email}</span>,
      card: 'subtitle',
    },
    {
      key: 'phone',
      header: 'Телефон',
      mono: true,
      cell: (employee) => employee.phone ?? '—',
      card: 'field',
      cardLabel: 'Телефон',
    },
    {
      key: 'role',
      header: 'Роль',
      cell: (employee) => ROLE_LABELS[employee.role],
      card: 'field',
      cardLabel: 'Роль',
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (employee) =>
        employee.isActive ? (
          <Badge tone="success">Активен</Badge>
        ) : (
          <Badge tone="neutral">Деактивирован</Badge>
        ),
      card: 'field',
      cardLabel: 'Статус',
    },
    {
      key: 'actions',
      header: 'Действия',
      align: 'right',
      cell: (employee) =>
        isAdmin ? (
          <span className="flex justify-end gap-2 max-md:flex-col max-md:items-stretch">
            <Button
              variant="ghost"
              size="sm"
              className="max-md:px-2 max-md:text-xs"
              aria-label={`Редактировать «${employee.fullName}»`}
              onClick={() => openEdit(employee)}
            >
              Изменить
            </Button>
            {employee.isActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-600 max-md:px-2 max-md:text-xs"
                aria-label={`Деактивировать «${employee.fullName}»`}
                onClick={() => openDeactivate(employee)}
              >
                Деактивировать
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="max-md:px-2 max-md:text-xs"
                aria-label={`Активировать «${employee.fullName}»`}
                onClick={() => void handleReactivate(employee)}
                loading={updateEmployee.isPending}
              >
                Активировать
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 max-md:px-2 max-md:text-xs"
              aria-label={`Удалить «${employee.fullName}»`}
              data-testid={`employee-delete-${employee.id}`}
              onClick={() => openDelete(employee)}
            >
              Удалить
            </Button>
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
      card: 'actions',
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="employees-page">
      <PageHeader
        title="Сотрудники"
        subtitle={
          <>
            Всего: <span className="font-mono">{total}</span> · справочник пользователей
            auth-service
          </>
        }
        actions={
          isAdmin ? (
            <Button
              data-testid="employee-create-button"
              className="max-md:w-full max-lg:min-h-[44px]"
              onClick={openCreate}
            >
              + Добавить сотрудника
            </Button>
          ) : undefined
        }
      />

      {!isAdmin && (
        <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Режим просмотра: создание, правка и деактивация доступны роли ADMIN.
        </p>
      )}

      <ErrorBanner error={dialogError} />
      <ErrorBanner error={error} onRetry={refetch} />

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-neutral-500 max-md:w-full">
            <span className="max-md:sr-only">Поиск</span>
            <Input
              type="search"
              placeholder="ФИО, email или телефон"
              value={search}
              className="w-72 max-md:w-full"
              onChange={(event) => {
                setSearch(event.target.value);
                resetFilters();
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <span>Роль</span>
            <Select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as '' | Role);
                resetFilters();
              }}
            >
              <option value="">Все роли</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <span>Статус</span>
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as '' | 'active' | 'inactive');
                resetFilters();
              }}
            >
              <option value="">Все</option>
              <option value="active">Активные</option>
              <option value="inactive">Деактивированные</option>
            </Select>
          </label>
        </div>

        <ResponsiveTable
          items={items}
          getKey={(employee) => employee.id}
          columns={columns}
          loading={isLoading || isFetching}
          empty="Сотрудников не найдено"
          testId="employees-table"
          rowTestId={(employee) => `employee-row-${employee.id}`}
        />

        <div className="border-t border-neutral-200 px-4 py-3">
          <Pagination
            total={total}
            skip={skip}
            take={take}
            disabled={isFetching}
            onChange={({ skip: nextSkip, take: nextTake }) => {
              setSkip(nextSkip);
              setTake(nextTake);
            }}
          />
        </div>
      </Card>

      {/* ----------------------------------------------------------- создание */}
      <Modal
        open={dialog?.kind === 'create'}
        title="Новый сотрудник"
        onClose={() => (busy ? undefined : setDialog(null))}
        busy={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="employee-create-form"
              loading={busy}
              data-testid="employee-create-submit"
            >
              Создать
            </Button>
          </>
        }
      >
        <form
          id="employee-create-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleCreate(event)}
        >
          <Field label="ФИО" htmlFor="employee-full-name" required error={fieldErrors.fullName}>
            <Input
              id="employee-full-name"
              value={createForm.fullName}
              invalid={Boolean(fieldErrors.fullName)}
              maxLength={120}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
            />
          </Field>
          <Field label="Email" htmlFor="employee-email" required error={fieldErrors.email}>
            <Input
              id="employee-email"
              type="email"
              value={createForm.email}
              invalid={Boolean(fieldErrors.email)}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </Field>
          <Field label="Телефон" htmlFor="employee-phone" hint="Необязательно, формат +7…">
            <Input
              id="employee-phone"
              value={createForm.phone}
              placeholder="+79990000005"
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </Field>
          <Field label="Роль" htmlFor="employee-role" required>
            <Select
              id="employee-role"
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, role: event.target.value as Role }))
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Пароль"
            htmlFor="employee-password"
            required
            error={fieldErrors.password}
            hint="От 6 символов — сообщите сотруднику, дальше он сможет сменить его сам"
          >
            <Input
              id="employee-password"
              type="password"
              autoComplete="new-password"
              value={createForm.password}
              invalid={Boolean(fieldErrors.password)}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </Field>
          {dialogError !== null && <ErrorBanner error={dialogError} />}
        </form>
      </Modal>

      {/* ------------------------------------------------------------- правка */}
      <Modal
        open={dialog?.kind === 'edit'}
        title={`Правка: ${dialog?.employee?.fullName ?? ''}`}
        onClose={() => (busy ? undefined : setDialog(null))}
        busy={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="employee-edit-form"
              loading={busy}
              data-testid="employee-edit-submit"
            >
              Сохранить
            </Button>
          </>
        }
      >
        <form
          id="employee-edit-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleEdit(event)}
        >
          <Field label="ФИО" htmlFor="employee-edit-name" required error={fieldErrors.fullName}>
            <Input
              id="employee-edit-name"
              value={editForm.fullName}
              invalid={Boolean(fieldErrors.fullName)}
              maxLength={120}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
            />
          </Field>
          <Field label="Email" htmlFor="employee-edit-email" required error={fieldErrors.email}>
            <Input
              id="employee-edit-email"
              type="email"
              value={editForm.email}
              invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>
          <Field label="Телефон" htmlFor="employee-edit-phone" hint="Пустое поле очищает телефон">
            <Input
              id="employee-edit-phone"
              value={editForm.phone}
              placeholder="+79990000005"
              onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </Field>
          <Field label="Роль" htmlFor="employee-edit-role" required>
            <Select
              id="employee-edit-role"
              value={editForm.role}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, role: event.target.value as Role }))
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
          {dialogError !== null && <ErrorBanner error={dialogError} />}
        </form>
      </Modal>

      {/* ------------------------------------------------------ деактивация */}
      <ConfirmDialog
        open={dialog?.kind === 'deactivate'}
        title="Деактивация сотрудника"
        message={`Сотрудник «${dialog?.employee?.fullName ?? ''}» потеряет вход в систему.
          Данные и история сохранятся; вернуть доступ можно кнопкой «Активировать».`}
        confirmLabel="Деактивировать"
        busy={deactivateEmployee.isPending}
        onConfirm={() => void handleDeactivate()}
        onCancel={() => setDialog(null)}
      />

      {/* ---------------------------------------------------------- удаление */}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Удаление сотрудника"
        message={`Сотрудник «${dialog?.employee?.fullName ?? ''}» будет удалён насовсем —
          восстановить его нельзя. Вход станет невозможным, история (заявки, смены)
          сохранится, но имя сотрудника в ней уже не отобразится.`}
        confirmLabel="Удалить"
        busy={deleteEmployee.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
