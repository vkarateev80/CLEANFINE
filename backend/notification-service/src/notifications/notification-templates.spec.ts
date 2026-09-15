import { NOTIFICATION_TEMPLATES, renderTemplate, renderText } from './notification-templates';
import { NOTIFICATION_TYPES, isNotificationType } from './notification-types';

describe('NOTIFICATION_TEMPLATES (М3.3, п.3)', () => {
  it('содержит шаблоны всех требуемых типов', () => {
    // Набор типов зафиксирован требованиями М3.3 — потеря шаблона
    // означала бы молчаливое отбрасывание события консьюмером.
    expect(Object.keys(NOTIFICATION_TEMPLATES).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('у каждого шаблона есть заголовок, текст и приоритет', () => {
    for (const type of NOTIFICATION_TYPES) {
      const template = NOTIFICATION_TEMPLATES[type];
      expect(template.type).toBe(type);
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.body.length).toBeGreaterThan(0);
      expect(['normal', 'high']).toContain(template.priority);
    }
  });

  it('аварийные и просроченные уведомления — высокий приоритет', () => {
    expect(NOTIFICATION_TEMPLATES.EMERGENCY.priority).toBe('high');
    expect(NOTIFICATION_TEMPLATES.TICKET_OVERDUE.priority).toBe('high');
  });
});

describe('renderText', () => {
  it('подставляет параметры', () => {
    expect(renderText('Заявка {ticketId} просрочена на {minutes} минут', {
      ticketId: 't-1',
      minutes: 15,
    })).toBe('Заявка t-1 просрочена на 15 минут');
  });

  it('отсутствующий параметр превращается в пустую строку, а не в "{param}"', () => {
    // Пользователь не должен видеть технические скобки в push-уведомлении.
    expect(renderText('{employeeName} покинул территорию', {})).toBe(' покинул территорию');
  });

  it('null-параметр тоже даёт пустую строку', () => {
    expect(renderText('{a}-{b}', { a: null, b: 'x' })).toBe('-x');
  });

  it('не трогает текст без подстановок', () => {
    expect(renderText('Новая задача', {})).toBe('Новая задача');
  });
});

describe('renderTemplate', () => {
  it('рендерит NEW_TICKET с описанием заявки', () => {
    expect(renderTemplate('NEW_TICKET', { ticketDescription: 'Помыть 3 этаж' })).toEqual({
      type: 'NEW_TICKET',
      title: 'Новая задача',
      body: 'Вам назначена задача: Помыть 3 этаж',
      priority: 'normal',
    });
  });

  it('рендерит EMERGENCY', () => {
    const rendered = renderTemplate('EMERGENCY', {
      type: 'Затопление',
      objectName: 'БЦ «Северный»',
      floor: '3 этаж',
    });

    expect(rendered.title).toBe('🚨 АВАРИЙНАЯ СИТУАЦИЯ');
    expect(rendered.body).toBe('Затопление на объекте БЦ «Северный», 3 этаж');
    expect(rendered.priority).toBe('high');
  });

  it('рендерит MATERIAL_LOW и GEOFENCE_EXIT', () => {
    expect(
      renderTemplate('MATERIAL_LOW', { materialName: 'Мыло', objectName: 'Офис' }).body,
    ).toBe('Мыло на объекте Офис ниже порога');
    expect(renderTemplate('GEOFENCE_EXIT', { employeeName: 'Иванов' }).body).toBe(
      'Иванов покинул территорию объекта',
    );
  });

  it('рендерит TICKET_OVERDUE', () => {
    expect(renderTemplate('TICKET_OVERDUE', { ticketId: 't-7', minutes: 30 }).body).toBe(
      'Заявка t-7 просрочена на 30 минут',
    );
  });
});

describe('isNotificationType', () => {
  it('распознаёт известные типы', () => {
    expect(isNotificationType('EMERGENCY')).toBe(true);
  });

  it.each([['emergency'], ['UNKNOWN'], [42], [undefined]])(
    'отвергает значение %s',
    (value) => {
      // Настройки подписок и payload из брокера проходят через эту проверку.
      expect(isNotificationType(value)).toBe(false);
    },
  );
});
