import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@cleaning-ops/shared/types/roles';
import {
  createUser,
  deactivateUser,
  deleteUser,
  listUsers,
  updateUser,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../../api/users';
import type { Paginated } from '../../types/core';
import type { SessionUser } from '../../types';

/**
 * Данные экрана «Сотрудники»: запрос и мутации react-query.
 * Ключ списка — `['users', 'list', params]`: он не пересекается с
 * `['users', 'clients']` (выбор заказчика в форме объекта), но инвалидация
 * префиксом `['users']` обновляет оба.
 */

export interface EmployeeListParams {
  skip: number;
  take: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
}

export const employeeKeys = {
  list: (params: EmployeeListParams) => ['users', 'list', params] as const,
  all: ['users'] as const,
};

export interface EmployeesQueryResult {
  data: Paginated<SessionUser> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

export function useEmployees(params: EmployeeListParams): EmployeesQueryResult {
  const query = useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => listUsers(params),
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

function useInvalidateEmployees() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: employeeKeys.all });
}

export function useCreateEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeactivateEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: invalidate,
  });
}

export function useDeleteEmployee() {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: invalidate,
  });
}
