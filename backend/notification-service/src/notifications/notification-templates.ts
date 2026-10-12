import type { NotificationPriority, NotificationType } from './notification-types';

/**
 * Шаблоны уведомлений (docs/agents/BACKEND_NOTIFICATIONS.md, п.3).
 *
 * Шаблон — заголовок/текст с подстановочными параметрами вида {param},
 * приоритет и тип. Ключ шаблона совпадает с NotificationType, поэтому один
 * и тот же словарь используется в шаблонах, в БД (notifications.type)
 * и в настройках подписок (notification_preferences.disabledTypes).
 */
export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
}

/** Параметры подстановки: значения приводятся к строке, пустые дают ''. */
export type TemplateParams = Record<string, string | number | null | undefined>;

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  NEW_TICKET: {
    type: 'NEW_TICKET',
    title: 'Новая задача',
    body: 'Вам назначена задача: {ticketDescription}',
    priority: 'normal',
  },
  EMERGENCY: {
    type: 'EMERGENCY',
    title: '🚨 АВАРИЙНАЯ СИТУАЦИЯ',
    body: '{type} на объекте {objectName}, {floor}',
    priority: 'high',
  },
  TICKET_OVERDUE: {
    type: 'TICKET_OVERDUE',
    title: '⚠️ Заявка просрочена',
    body: 'Заявка {ticketId} просрочена на {minutes} минут',
    priority: 'high',
  },
  GEOFENCE_EXIT: {
    type: 'GEOFENCE_EXIT',
    title: '⚠️ Внимание',
    body: '{employeeName} покинул территорию объекта',
    priority: 'normal',
  },
  MATERIAL_LOW: {
    type: 'MATERIAL_LOW',
    title: '📦 Материал заканчивается',
    body: '{materialName} на объекте {objectName} ниже порога',
    priority: 'normal',
  },
  // Параметры — только те, что реально есть в payload schedule.missed_checkin
  // (event-payloads.ts schedule-service): objectName и plannedStart.
  // Имени графика в событии нет, поэтому «имя» — это объект смены.
  SCHEDULE_MISSED: {
    type: 'SCHEDULE_MISSED',
    title: '⚠️ Неявка на смену',
    body: 'Неявка на смену: {objectName}, плановое начало {plannedStart}',
    priority: 'high',
  },
  // Параметры — ровно те поля, что присылает chat-service во внутреннем вызове
  // POST /api/notifications/internal/chat-message: заголовок (название чата) и
  // текст (превью сообщения) уже собраны отправителем, поэтому шаблон их только
  // подставляет. Остальное содержимое запроса (data: chatId/messageId/тип чата)
  // уходит в payload и push.data как есть — в тексте оно не нужно, но по нему
  // клиент открывает нужный чат из уведомления.
  CHAT_MESSAGE: {
    type: 'CHAT_MESSAGE',
    title: '{title}',
    body: '{body}',
    priority: 'high',
  },
  // Заголовок зависит от нового статуса («▶️ Заявка в работе», «✅ Заявка
  // выполнена»), поэтому его собирает resolveEvent, а шаблон только подставляет.
  TICKET_STATUS: {
    type: 'TICKET_STATUS',
    title: '{title}',
    body: '{body}',
    priority: 'normal',
  },
  SYSTEM: {
    type: 'SYSTEM',
    title: '{title}',
    body: '{body}',
    priority: 'high',
  },
};

export interface RenderedNotification {
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Подставляет параметры в текст шаблона.
 * Отсутствующий/пустой параметр даёт пустую строку, а не литерал "{param}":
 * пользователь не должен видеть технические скобки в push-уведомлении.
 */
export function renderText(template: string, params: TemplateParams): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

/** Рендер шаблона по типу уведомления. */
export function renderTemplate(
  type: NotificationType,
  params: TemplateParams = {},
): RenderedNotification {
  const template = NOTIFICATION_TEMPLATES[type];
  return {
    type: template.type,
    title: renderText(template.title, params),
    body: renderText(template.body, params),
    priority: template.priority,
  };
}
