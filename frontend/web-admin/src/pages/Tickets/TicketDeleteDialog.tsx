import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteTicketChat } from '../../api/chat';
import { deleteTicket } from '../../api/tickets';
import { ConfirmDialog, ErrorBanner } from '../../components/ui';
import type { TicketEntity } from '../../types/tickets';

/**
 * Подтверждение удаления заявки (только ADMIN). Диалог перечисляет последствия:
 * удаление необратимо, а смена графика и склад живут в других сервисах и не откатываются.
 */
export function TicketDeleteDialog({
  ticket,
  onClose,
  onDeleted,
}: {
  ticket: TicketEntity;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async () => {
      await deleteTicket(ticket.id);
      // Заявки уже нет: сбой чата не должен выглядеть как неудачное удаление.
      await deleteTicketChat(ticket.id).catch(() => undefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      onDeleted();
      // Кнопка «Назад» иначе показала бы заявку из кэша, а её чат-панель создала бы чат заново.
      queryClient.removeQueries({ queryKey: ['ticket', ticket.id] });
    },
  });

  return (
    <ConfirmDialog
      open
      title="Удалить заявку?"
      message={
        <div className="flex flex-col gap-3">
          <span className="break-words">«{ticket.description}»</span>
          <span>
            Заявка исчезнет из списка и отчётов вместе с комментариями, историей назначений,
            отметками о выполнении и чатом. Действие необратимо.
          </span>
          <span className="text-xs text-neutral-500">
            Уже списанные материалы на склад не вернутся.
            {ticket.plannedStart &&
              ' Заявка создана по смене графика: смена останется в расписании без заявки, новая не создастся. Если смена идёт сейчас, оператор не сможет отмечать работу.'}
          </span>
          {remove.error ? <ErrorBanner error={remove.error} /> : null}
        </div>
      }
      confirmLabel="Удалить"
      busy={remove.isPending}
      onConfirm={() => remove.mutate()}
      onCancel={onClose}
    />
  );
}
