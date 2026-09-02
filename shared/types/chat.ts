/**
 * Типы чатов. Источник: УСТАВ.md → Агент Backend Chat (п.2).
 */
export const CHAT_TYPES = ['object', 'ticket', 'direct', 'system'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

export const CHAT_TYPE_LABELS: Record<ChatType, string> = {
  object: 'Чат объекта (все сотрудники)',
  ticket: 'Чат заявки (исполнитель, бригадир, админ)',
  direct: 'Личные сообщения',
  system: 'Системные уведомления',
};
