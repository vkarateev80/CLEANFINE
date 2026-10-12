import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ALLOWED_TRANSITIONS, type TicketStatus } from '@cleaning-ops/shared/types/tickets';
import {
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  completeTicketOperation,
} from '../../api/tickets';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DetailRow,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '../../components/ui';
import { useCanAssignTicket, useCanTransitionTicketStatus } from '../../hooks/usePermissions';
import { ChatPanel } from '../Messages/ChatPanel';
import { TicketRouteProgress } from './TicketRouteProgress';
import { ROUTES } from '../../router/routes';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TRANSITION_CONFIRM,
  TICKET_TRANSITION_LABELS,
  TICKET_TYPE_LABELS,
  type TicketOperationCompletionEntity,
} from '../../types/tickets';
import {
  TicketPriorityBadge,
  TicketStatusBadge,
  deadlineHint,
  formatDateTime,
  shortId,
} from './ticketHelpers';
import {
  useAssigneeOptions,
  useRoomTechCard,
  useTicket,
  useTicketRoom,
  userName,
} from './useTickets';

/**
 * Карточка заявки (М3.7): паспорт, история назначений, комментарии, операции
 * техкарты и переходы статусов.
 *
 * Кнопки переходов строятся ТОЛЬКО из `ALLOWED_TRANSITIONS` текущего статуса
 * (shared/types/tickets): экран не дублирует state machine и не может предложить
 * переход, который бэкенд отвергнет 400 «Invalid status transition».
 */
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canAssign = useCanAssignTicket();
  const canTransition = useCanTransitionTicketStatus();

  const ticketQuery = useTicket(id);
  const assignees = useAssigneeOptions();
  const roomQuery = useTicketRoom(ticketQuery.data?.roomId);
  const techCardQuery = useRoomTechCard(roomQuery.data?.techCardId);

  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<TicketStatus | null>(null);

  const ticket = ticketQuery.data;

  // Список операций берётся из техкарты помещения заявки: ticket-service хранит
  // только факты завершения (operationId), справочник операций живёт в core-service.
  const operations = useMemo(() => techCardQuery.data?.operations ?? [], [techCardQuery.data]);
  const operationsTotal = operations.length;
  const completedByOperation = useMemo(() => {
    const map = new Map<string, TicketOperationCompletionEntity>();
    for (const item of ticket?.operations ?? []) map.set(item.operationId, item);
    return map;
  }, [ticket]);

  const status = useMutation({
    mutationFn: (next: TicketStatus) => changeTicketStatus(id as string, next),
    onSuccess: () => {
      setPendingTransition(null);
      void ticketQuery.refetch();
    },
  });

  const assign = useMutation({
    mutationFn: (assigneeId: string) => assignTicket(id as string, assigneeId),
    onSuccess: () => {
      setSelectedAssignee('');
      void ticketQuery.refetch();
    },
  });

  const comment = useMutation({
    mutationFn: (text: string) => addTicketComment(id as string, { text }),
    onSuccess: () => {
      setCommentText('');
      setCommentError(null);
      void ticketQuery.refetch();
    },
  });

  const completeOperation = useMutation({
    mutationFn: ({ operationId, photoUrl }: { operationId: string; photoUrl?: string }) =>
      completeTicketOperation(id as string, operationId, {
        ...(photoUrl ? { photoUrl } : {}),
        // Бэкенд запоминает ожидаемое число операций по первому вызову — без него
        // нельзя определить «все операции завершены».
        ...(operationsTotal > 0 ? { totalOperations: operationsTotal } : {}),
      }),
    onSuccess: (result) => {
      setOperationMessage(
        result.alreadyCompleted
          ? 'Операция уже была отмечена ранее'
          : result.allOperationsCompleted
            ? 'Операция выполнена — все операции техкарты завершены'
            : `Операция выполнена (${result.completedOperations} из ${result.operationsTotal ?? '?'})`,
      );
      void ticketQuery.refetch();
    },
    onError: () => setOperationMessage(null),
  });

  function submitComment() {
    const text = commentText.trim();
    if (text === '') {
      setCommentError('Комментарий не может быть пустым');
      return;
    }
    if (text.length > 4000) {
      setCommentError('Не больше 4000 символов');
      return;
    }
    setCommentError(null);
    comment.mutate(text);
  }

  function applyTransition(next: TicketStatus) {
    if (TICKET_TRANSITION_CONFIRM.includes(next)) {
      setPendingTransition(next);
      return;
    }
    status.mutate(next);
  }

  if (ticketQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <LoadingBlock label="Загрузка заявки…" />
        <LoadingBlock label="Загрузка комментариев и операций…" />
      </div>
    );
  }

  if (ticketQuery.error || !ticket) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner
          error={ticketQuery.error ?? new Error('Заявка не найдена')}
          onRetry={() => void ticketQuery.refetch()}
        />
        <div>
          <Link to={ROUTES.tickets} className="text-sm text-primary-600 hover:underline">
            ← К списку заявок
          </Link>
        </div>
      </div>
    );
  }

  const allowedTransitions = ALLOWED_TRANSITIONS[ticket.status];
  const operationsCompleted = ticket.operations.length;
  const assigneeName = userName(assignees.data?.items, ticket.assigneeId);
  const authorName = (authorId: string) =>
    userName(assignees.data?.items, authorId) ?? shortId(authorId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: 'Заявки', to: ROUTES.tickets }, { label: shortId(ticket.id) }]}
          />
        }
        title={TICKET_TYPE_LABELS[ticket.type]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge
              priority={ticket.priority}
              label={TICKET_PRIORITY_LABELS[ticket.priority]}
            />
            <span className="font-mono text-xs text-neutral-400">{ticket.id}</span>
          </span>
        }
        actions={
          canTransition ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="ticket-transitions">
              {allowedTransitions.length === 0 && (
                <span className="text-xs text-neutral-500">Переходов из этого статуса нет</span>
              )}
              {allowedTransitions.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={TICKET_TRANSITION_CONFIRM.includes(next) ? 'secondary' : 'primary'}
                  data-testid={`ticket-transition-${next}`}
                  loading={status.isPending && status.variables === next}
                  disabled={status.isPending}
                  onClick={() => applyTransition(next)}
                >
                  {TICKET_TRANSITION_LABELS[next]}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      {status.isError && <ErrorBanner error={status.error} />}
      {assign.isError && <ErrorBanner error={assign.error} />}

      {/* Переходы, требующие подтверждения: закрытие/отклонение/просрочка. */}
      {pendingTransition !== null && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning-500">
          <span className="text-sm text-neutral-700">
            Перевести заявку в статус «{TICKET_STATUS_LABELS[pendingTransition]}»?
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingTransition(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={status.isPending}
              data-testid="ticket-transition-confirm"
              onClick={() => status.mutate(pendingTransition)}
            >
              Подтвердить
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-neutral-900" data-testid="ticket-passport">
              Паспорт заявки
            </h2>
            <p className="whitespace-pre-wrap text-sm text-neutral-800">{ticket.description}</p>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <DetailRow label="Создана">{formatDateTime(ticket.createdAt)}</DetailRow>
              <DetailRow label="Автор">{authorName(ticket.createdBy)}</DetailRow>
              <DetailRow label="Дедлайн реакции">
                {formatDateTime(ticket.reactionDeadline)}
                {deadlineHint(ticket.reactionDeadline) && (
                  <span className="ml-2 text-xs text-neutral-400">
                    ({deadlineHint(ticket.reactionDeadline)})
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Назначена">{formatDateTime(ticket.assignedAt)}</DetailRow>
              <DetailRow label="Принята">{formatDateTime(ticket.acceptedAt)}</DetailRow>
              <DetailRow label="Прибытие">{formatDateTime(ticket.arrivedAt)}</DetailRow>
              <DetailRow label="Дедлайн прибытия">
                {formatDateTime(ticket.arrivalDeadline)}
                {deadlineHint(ticket.arrivalDeadline) && (
                  <span className="ml-2 text-xs text-neutral-400">
                    ({deadlineHint(ticket.arrivalDeadline)})
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Выполнена">{formatDateTime(ticket.completedAt)}</DetailRow>
              <DetailRow label="Проверена">{formatDateTime(ticket.verifiedAt)}</DetailRow>
              <DetailRow label="Закрыта">{formatDateTime(ticket.closedAt)}</DetailRow>
            </div>

            <div className="flex flex-wrap gap-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
              <span>
                Объект:{' '}
                <Link
                  to={ROUTES.object(ticket.objectId)}
                  className="text-primary-600 hover:underline"
                >
                  {shortId(ticket.objectId)}
                </Link>
              </span>
              <span>
                Помещение:{' '}
                {ticket.roomId ? (
                  roomQuery.data ? (
                    <span className="text-neutral-700">{roomQuery.data.name}</span>
                  ) : (
                    <span className="font-mono">{shortId(ticket.roomId)}</span>
                  )
                ) : (
                  'объект целиком'
                )}
              </span>
              {ticket.lat !== null && ticket.lng !== null && (
                <span className="font-mono">
                  {ticket.lat.toFixed(6)}, {ticket.lng.toFixed(6)}
                </span>
              )}
              {ticket.escalatedAt && (
                <span className="text-warning-600">
                  эскалация {formatDateTime(ticket.escalatedAt)}
                </span>
              )}
              {ticket.overdueAt && (
                <span className="text-danger-600">
                  просрочена {formatDateTime(ticket.overdueAt)}
                </span>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-neutral-900" data-testid="ticket-assignments">
              Назначение и история
            </h2>

            <div className="flex flex-wrap items-end gap-3">
              <DetailRow label="Текущий исполнитель">
                {assigneeName ?? (ticket.assigneeId ? shortId(ticket.assigneeId) : 'не назначен')}
              </DetailRow>

              {canAssign && (
                <div className="ml-auto flex items-end gap-2">
                  <Field label="Назначить исполнителя" htmlFor="ticket-assignee-select">
                    <select
                      id="ticket-assignee-select"
                      data-testid="ticket-assignee-select"
                      className="w-64 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                      value={selectedAssignee}
                      disabled={assignees.isLoading}
                      onChange={(event) => setSelectedAssignee(event.target.value)}
                    >
                      <option value="">Выберите сотрудника</option>
                      {(assignees.data?.supervisors.length ?? 0) > 0 && (
                        <optgroup label="Бригадиры">
                          {assignees.data?.supervisors.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {(assignees.data?.operators.length ?? 0) > 0 && (
                        <optgroup label="Операторы">
                          {assignees.data?.operators.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>
                  <Button
                    size="sm"
                    data-testid="ticket-assign-submit"
                    disabled={selectedAssignee === ''}
                    loading={assign.isPending}
                    onClick={() => assign.mutate(selectedAssignee)}
                  >
                    Назначить
                  </Button>
                </div>
              )}
            </div>

            {!canAssign && (
              <p className="rounded-lg bg-neutral-100 px-4 py-2 text-xs text-neutral-600">
                Назначение исполнителя доступно ролям ADMIN и SUPERVISOR.
              </p>
            )}

            {ticket.assignments.length === 0 ? (
              <p className="text-xs text-neutral-400">История назначений пуста</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ticket.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-800">
                      {userName(assignees.data?.items, assignment.assigneeId) ??
                        shortId(assignment.assigneeId)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      назначил {authorName(assignment.assignedBy)} ·{' '}
                      {formatDateTime(assignment.assignedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-neutral-900" data-testid="ticket-comments">
              Комментарии · {ticket.comments.length}
            </h2>

            {ticket.comments.length === 0 ? (
              <p className="text-xs text-neutral-400">Комментариев пока нет</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {ticket.comments.map((item) => (
                  <li key={item.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">
                        {authorName(item.authorId)}
                      </span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{item.text}</p>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
              {comment.isError ? <ErrorBanner error={comment.error} /> : null}
              <Field label="Новый комментарий" htmlFor="ticket-comment-text" error={commentError}>
                <Textarea
                  id="ticket-comment-text"
                  data-testid="ticket-comment-text"
                  value={commentText}
                  maxLength={4000}
                  invalid={Boolean(commentError)}
                  onChange={(event) => {
                    setCommentText(event.target.value);
                    setCommentError(null);
                  }}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  data-testid="ticket-comment-submit"
                  loading={comment.isPending}
                  disabled={commentText.trim() === ''}
                  onClick={submitComment}
                >
                  Добавить комментарий
                </Button>
              </div>
            </div>
          </Card>

          {/*
            Чат заявки (М5.3) — отдельный блок под комментариями. Комментарий
            фиксирует факт в истории заявки, чат нужен для живого обсуждения;
            чат создаётся идемпотентно по ticketId, поэтому блок монтируется
            при каждом открытии карточки без риска «второго» чата.
          */}
          {/* Проход оператора по маршруту: серый → жёлтый → зелёный (12.10.2026). */}
          <TicketRouteProgress ticket={ticket} />

          <ChatPanel
            kind="ticket"
            refId={ticket.id}
            title="Чат заявки"
            testId="ticket-chat"
            emptyHint="Обсудите заявку: сообщения видят исполнитель, бригадир и администратор."
          />
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-neutral-900" data-testid="ticket-operations">
                Операции техкарты
              </h2>
              <Badge
                tone={
                  operationsTotal > 0 && operationsCompleted >= operationsTotal
                    ? 'success'
                    : 'neutral'
                }
              >
                {operationsCompleted} / {operationsTotal || '—'}
              </Badge>
            </div>

            {ticket.roomId === null && (
              <p className="text-xs text-neutral-400">
                У заявки не указано помещение — техкарта не определена. Отметьте операцию вручную по
                id, если он известен исполнителю.
              </p>
            )}

            {roomQuery.isLoading || techCardQuery.isLoading ? (
              <LoadingBlock label="Загрузка операций…" />
            ) : roomQuery.error ? (
              <p className="text-xs text-neutral-400">
                Помещение недоступно — операции техкарты не загружены.
              </p>
            ) : ticket.roomId !== null && !roomQuery.data?.techCardId ? (
              <p className="text-xs text-neutral-400">
                Помещение не привязано к техкарте — список операций пуст.
              </p>
            ) : operations.length === 0 ? (
              <p className="text-xs text-neutral-400">
                {ticket.operations.length > 0
                  ? 'Операции отмечены, но техкарта помещения недоступна для чтения.'
                  : 'В техкарте помещения нет операций.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {operations.map((operation) => {
                  const completion = completedByOperation.get(operation.id);
                  const done = completion !== undefined;
                  return (
                    <li
                      key={operation.id}
                      data-testid={`ticket-operation-${operation.id}`}
                      className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-neutral-900">
                          {operation.name}
                        </span>
                        <span className="font-mono text-xs text-neutral-500">
                          {operation.estimatedTimeMin} мин
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        {operation.requiresPhoto && <span title="Требуется фото">📷 фото</span>}
                        {operation.requiresQr && <span title="Требуется QR">▣ QR</span>}
                        {done && (
                          <span className="text-success-600">
                            выполнено {formatDateTime(completion.completedAt)}
                          </span>
                        )}
                      </div>

                      {!done && canTransition && (
                        <div className="flex flex-wrap items-center gap-2">
                          {operation.requiresPhoto && (
                            <Input
                              aria-label={`URL фото для операции «${operation.name}»`}
                              placeholder="URL фото (file-service)"
                              className="max-w-[240px] text-xs"
                              value={photoUrls[operation.id] ?? ''}
                              onChange={(event) =>
                                setPhotoUrls((current) => ({
                                  ...current,
                                  [operation.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            data-testid={`ticket-operation-complete-${operation.id}`}
                            loading={
                              completeOperation.isPending &&
                              completeOperation.variables?.operationId === operation.id
                            }
                            disabled={completeOperation.isPending}
                            onClick={() =>
                              completeOperation.mutate({
                                operationId: operation.id,
                                ...(photoUrls[operation.id]
                                  ? { photoUrl: photoUrls[operation.id] }
                                  : {}),
                              })
                            }
                          >
                            Выполнено
                          </Button>
                        </div>
                      )}

                      {done && completion.photoUrl && (
                        <a
                          href={completion.photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Фотоотчёт
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {completeOperation.isError && <ErrorBanner error={completeOperation.error} />}
            {operationMessage && !completeOperation.isError && (
              <p className="text-xs text-success-600" role="status">
                {operationMessage}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-neutral-900">Служебное</h2>
            <div className="flex flex-col gap-3">
              <DetailRow label="ID заявки">
                <span className="font-mono text-xs">{ticket.id}</span>
              </DetailRow>
              <DetailRow label="ID объекта">
                <span className="font-mono text-xs">{ticket.objectId}</span>
              </DetailRow>
              <DetailRow label="Room ID">
                <span className="font-mono text-xs">{ticket.roomId ?? '—'}</span>
              </DetailRow>
              <DetailRow label="Операций учтено">
                <span className="font-mono text-xs">
                  {ticket.operationsTotal ?? operationsTotal ?? '—'}
                </span>
              </DetailRow>
              <DetailRow label="Обновлена">{formatDateTime(ticket.updatedAt)}</DetailRow>
            </div>

            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.tickets)}>
                ← К списку заявок
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
