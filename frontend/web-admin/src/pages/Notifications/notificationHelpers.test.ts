import { describe, expect, it } from 'vitest';
import type { NotificationEntity, NotificationsPage } from '../../types/notifications';
import {
  collectFresh,
  pageSizeFromParam,
  startSeen,
  toggleDisabledType,
} from './notificationHelpers';

function note(id: string, createdAt: string): NotificationEntity {
  return {
    id,
    userId: 'u1',
    type: 'CHAT_MESSAGE',
    title: id,
    body: '',
    payload: null,
    readAt: null,
    createdAt,
  };
}

function page(...items: NotificationEntity[]): NotificationsPage {
  return { items, total: items.length, unreadCount: items.length, page: 1, limit: 10 };
}

describe('toggleDisabledType', () => {
  it('включённый тип отключается', () => {
    expect(toggleDisabledType([], 'MATERIAL_LOW')).toEqual(['MATERIAL_LOW']);
    expect(toggleDisabledType(['EMERGENCY'], 'MATERIAL_LOW')).toEqual(['EMERGENCY', 'MATERIAL_LOW']);
  });

  it('отключённый тип включается обратно, остальные не трогаются', () => {
    expect(toggleDisabledType(['EMERGENCY', 'MATERIAL_LOW'], 'MATERIAL_LOW')).toEqual(['EMERGENCY']);
  });

  it('неизвестные типы из ответа бэкенда в PATCH не уходят', () => {
    expect(toggleDisabledType(['LEGACY_TYPE'], 'SYSTEM')).toEqual(['SYSTEM']);
  });
});

describe('pageSizeFromParam', () => {
  it('25/50/100 принимаются, остальное — 25', () => {
    expect(pageSizeFromParam('50')).toBe(50);
    expect(pageSizeFromParam('100')).toBe(100);
    expect(pageSizeFromParam(null)).toBe(25);
    expect(pageSizeFromParam('1000')).toBe(25);
    expect(pageSizeFromParam('abc')).toBe(25);
  });
});

describe('collectFresh (тостер)', () => {
  const old1 = note('old-1', '2026-11-07T08:00:00Z');
  const old2 = note('old-2', '2026-11-07T08:05:00Z');
  const newest = note('newest', '2026-11-07T09:00:00Z');

  it('уже лежавшие в непрочитанных при открытии — не новые', () => {
    const seen = startSeen(page(newest, old2, old1));
    expect(collectFresh(page(newest, old2, old1), seen)).toEqual([]);
  });

  it('после «Прочитано» на самом новом старые не всплывают (дефект 07.11.2026)', () => {
    const seen = startSeen(page(newest, old2));
    // Самое новое прочитано: на первой странице теперь старые, в том числе
    // old-1 — его раньше не было видно из-за лимита страницы.
    expect(collectFresh(page(old2, old1), seen)).toEqual([]);
  });

  it('действительно новое после прочтения — всплывает один раз', () => {
    const seen = startSeen(page(newest, old2));
    collectFresh(page(old2), seen);
    const fresh = note('fresh', '2026-11-07T09:10:00Z');
    expect(collectFresh(page(fresh, old2), seen)).toEqual([fresh]);
    expect(collectFresh(page(fresh, old2), seen)).toEqual([]);
  });

  it('пустой первый ответ: любое следующее уведомление — новое', () => {
    const seen = startSeen(page());
    expect(collectFresh(page(old1), seen)).toEqual([old1]);
  });

  it('почти одновременные уведомления, пришедшие не по порядку, не теряются', () => {
    const seen = startSeen(page());
    const later = note('later', '2026-11-07T10:00:02Z');
    const earlier = note('earlier', '2026-11-07T10:00:00Z');
    expect(collectFresh(page(later), seen)).toEqual([later]);
    expect(collectFresh(page(later, earlier), seen)).toEqual([earlier]);
  });
});
