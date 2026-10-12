import { getWebPushPublicKey, registerDevice, unregisterDevice } from '../api/notifications';

/**
 * Web Push для PWA оператора (09.10.2026). Подписка браузера (`PushSubscription`)
 * регистрируется в notification-service как устройство платформы `web`;
 * сервер шлёт push по VAPID, а `public/sw.js` показывает его даже при
 * закрытой вкладке. Без service worker (dev-режим, iOS не в режиме «на экран
 * Домой») подписка невозможна — `support` объясняет почему.
 */

export type PushSupport =
  | 'ready'
  | 'denied'
  | 'no-service-worker'
  | 'no-push'
  | 'ios-needs-install'
  | 'server-off';

const LAST_SUBSCRIPTION_KEY = 'cleanfine-operator-push';

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Что браузер умеет прямо сейчас (без запроса разрешения). */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'no-service-worker';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-needs-install' : 'no-push';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  if (existing) return existing;
  if (!import.meta.env.PROD) return null;
  return navigator.serviceWorker.ready.catch(() => null);
}

/** Текущая подписка браузера, если есть. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await serviceWorkerReady();
  if (!registration) return null;
  return registration.pushManager.getSubscription().catch(() => null);
}

/**
 * Подписаться и зарегистрировать устройство на сервере.
 * Возвращает `ready` при успехе, иначе причину.
 */
export async function subscribeWebPush(): Promise<PushSupport | 'ready'> {
  const support = pushSupport();
  if (support !== 'ready') return support;
  const publicKey = await getWebPushPublicKey().catch(() => null);
  if (!publicKey) return 'server-off';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await serviceWorkerReady();
  if (!registration) return 'no-service-worker';
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const token = JSON.stringify(subscription.toJSON());
  await registerDevice({ token, platform: 'web' });
  try {
    localStorage.setItem(LAST_SUBSCRIPTION_KEY, token);
  } catch {
    /* приватный режим — подписка всё равно зарегистрирована */
  }
  return 'ready';
}

/**
 * Тихое переподключение при старте: если разрешение уже дано и подписка есть,
 * убеждаемся, что сервер знает актуальный токен (после смены пользователя на
 * том же телефоне устройство перепривязывается к новому владельцу).
 */
export async function resubscribeIfGranted(): Promise<void> {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  const token = JSON.stringify(subscription.toJSON());
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SUBSCRIPTION_KEY);
  } catch {
    /* ignore */
  }
  if (last === token) return;
  await registerDevice({ token, platform: 'web' });
  try {
    localStorage.setItem(LAST_SUBSCRIPTION_KEY, token);
  } catch {
    /* ignore */
  }
}

/** Снять подписку на сервере и в браузере (выход, выключение push). */
export async function unsubscribeWebPush(): Promise<void> {
  const subscription = await currentSubscription();
  const token = subscription ? JSON.stringify(subscription.toJSON()) : null;
  try {
    if (token) await unregisterDevice(token);
  } catch {
    /* без сети — токен останется, сервер пометит его невалидным при 410 */
  }
  try {
    localStorage.removeItem(LAST_SUBSCRIPTION_KEY);
  } catch {
    /* ignore */
  }
  if (subscription) await subscription.unsubscribe().catch(() => false);
}

export const PUSH_SUPPORT_TEXT: Record<PushSupport, string> = {
  ready: 'Push включён на этом устройстве',
  denied: 'Уведомления запрещены в настройках браузера',
  'no-service-worker': 'Push доступен только в установленном приложении',
  'no-push': 'Этот браузер не поддерживает push-уведомления',
  'ios-needs-install': 'На iPhone: «Поделиться» → «На экран Домой», затем включите push',
  'server-off': 'Push на сервере не настроен',
};
