import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addOperation,
  createTechCard,
  deleteOperation,
  deleteTechCard,
  getTechCard,
  listTechCards,
  reorderOperations,
  updateOperation,
  updateTechCard,
} from '../../api/core';
import type {
  CreateOperationPayload,
  TechCardDetail,
  Paginated,
  TechCardEntity,
  TechCardListItem,
  TechOperationEntity,
  UpdateOperationPayload,
} from '../../types/core';

/**
 * Данные экранов «Техкарты»: запросы и мутации react-query.
 * Вынесено из страниц, потому что список и редактор делят одни ключи кэша:
 * создание или удаление техкарты должно обновить и таблицу, и открытую карточку.
 */

export interface TechCardListParams {
  skip: number;
  take: number;
  search?: string;
}

/** Ключи кэша — по правилам проекта: `['tech-cards', params]` и `['tech-card', id]`. */
export const techCardKeys = {
  list: (params: TechCardListParams) => ['tech-cards', params] as const,
  /** Префикс для инвалидации всех постраничных вариантов списка. */
  lists: ['tech-cards'] as const,
  detail: (id: string) => ['tech-card', id] as const,
};

export interface TechCardsQueryResult {
  data: Paginated<TechCardListItem> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

export function useTechCards(params: TechCardListParams): TechCardsQueryResult {
  const query = useQuery({
    queryKey: techCardKeys.list(params),
    queryFn: () => listTechCards(params),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface TechCardQueryResult {
  data: TechCardDetail | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useTechCard(id: string | undefined): TechCardQueryResult {
  const query = useQuery({
    queryKey: techCardKeys.detail(id ?? ''),
    queryFn: () => getTechCard(id as string),
    enabled: Boolean(id),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Создание и переименование меняют и список, и карточку — инвалидируем оба ключа. */
function useInvalidateCard(id?: string) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: techCardKeys.lists });
    if (id) await queryClient.invalidateQueries({ queryKey: techCardKeys.detail(id) });
  };
}

export interface MutationsResult<TData, TVariables> {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
}

export function useCreateTechCard(): MutationsResult<TechCardEntity, string> {
  const invalidate = useInvalidateCard();
  const mutation = useMutation({
    mutationFn: (name: string) => createTechCard(name),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useUpdateTechCard(id: string): MutationsResult<TechCardEntity, string> {
  const invalidate = useInvalidateCard(id);
  const mutation = useMutation({
    mutationFn: (name: string) => updateTechCard(id, name),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useDeleteTechCard(): MutationsResult<void, string> {
  const invalidate = useInvalidateCard();
  const mutation = useMutation({
    mutationFn: (id: string) => deleteTechCard(id),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useAddOperation(
  techCardId: string,
): MutationsResult<TechOperationEntity, CreateOperationPayload> {
  const invalidate = useInvalidateCard(techCardId);
  const mutation = useMutation({
    mutationFn: (payload: CreateOperationPayload) => addOperation(techCardId, payload),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useUpdateOperation(
  techCardId: string,
): MutationsResult<TechOperationEntity, { id: string; payload: UpdateOperationPayload }> {
  const invalidate = useInvalidateCard(techCardId);
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOperationPayload }) =>
      updateOperation(id, payload),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useDeleteOperation(techCardId: string): MutationsResult<void, string> {
  const invalidate = useInvalidateCard(techCardId);
  const mutation = useMutation({
    mutationFn: (operationId: string) => deleteOperation(operationId),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

/**
 * Переупорядочивание: `onReorder` из `SortableList` отдаёт полный новый порядок
 * id — ровно то, что требует бэкенд (частичный список он отвергает 400).
 */
export function useReorderOperations(techCardId: string): MutationsResult<void, string[]> {
  const invalidate = useInvalidateCard(techCardId);
  const mutation = useMutation({
    mutationFn: (operationIds: string[]) =>
      reorderOperations(techCardId, operationIds).then(() => undefined),
    onSuccess: () => invalidate(),
  });
  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
}
