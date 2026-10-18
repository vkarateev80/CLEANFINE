import { describe, expect, it } from 'vitest';
import { COLOR_ZONE_META } from '@cleaning-ops/shared/types/color-coding';
import { ROLE_LABELS } from '@cleaning-ops/shared/types/roles';
import { SCHEDULE_EVENT_STATUS_LABELS } from '@cleaning-ops/shared/types/schedule';
import { POINT_STATUS_LABELS } from '../domain/progress';
import { PUSH_SUPPORT_TEXT } from '../lib/webPush';
import { LOCATION_DENIED_TEXT, LOCATION_FAILED_TEXT } from '../lib/geo';
import { PHOTO_TOO_SMALL_TEXT } from '../lib/photo';
import { ROLE_DENIED_TEXT } from '../pages/Login/LoginPage';
import { EMERGENCY_TYPES } from '../pages/Sos/SosPage';
import { NOTIFICATION_TYPE_LABELS } from '../types/notifications';
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS } from '../types/tickets';
import { STATIC_KEYS } from './staticKeys';

/** Подписи из словарей уровня модуля переводятся через `t(MAP[key])` — ключи перечислены руками. */
describe('STATIC_KEYS', () => {
  it('содержит все подписи словарей', () => {
    const keys = new Set(STATIC_KEYS);
    const labels = [
      ...Object.values(SCHEDULE_EVENT_STATUS_LABELS),
      ...Object.values(TICKET_TYPE_LABELS),
      ...Object.values(TICKET_PRIORITY_LABELS),
      ...Object.values(TICKET_STATUS_LABELS),
      ...Object.values(POINT_STATUS_LABELS),
      ...Object.values(ROLE_LABELS),
      ...Object.values(NOTIFICATION_TYPE_LABELS),
      ...Object.values(PUSH_SUPPORT_TEXT),
      ...EMERGENCY_TYPES,
      ...Object.values(COLOR_ZONE_META).map((meta) => meta.name),
      ROLE_DENIED_TEXT,
      LOCATION_DENIED_TEXT,
      LOCATION_FAILED_TEXT,
      PHOTO_TOO_SMALL_TEXT,
    ];
    const missing = labels.filter((label) => !keys.has(label));
    expect(missing, 'добавьте в src/i18n/staticKeys.ts').toEqual([]);
  });
});
