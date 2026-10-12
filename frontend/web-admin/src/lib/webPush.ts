import { getWebPushPublicKey, registerDevice, unregisterDevice } from '../api/notifications';

/**
 * Web Push в админке (12.10.2026): подписка браузера регистрируется в
 * notification-service устройством платформы `web`; `public/sw.js` показывает
 * push даже при закрытой вкладке. Тот же приём, что в рабочем месте оператора.
 */
export type PushSupport = 'ready' | 'denied' | 'no-service-worker' | 'no-push' | 'server-off';

const LAST_SUBSCRIPTION_KEY = 'cleanfine-admin-push';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'no-service-worker';
  if (!('PushManager' in window) || !('Notification' in window)) return 'no-push';
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
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  if (!import.meta.env.PROD) return null;
  return navigator.serviceWorker.ready.catch(() => null);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await serviceWorkerReady();
  if (!registration) return null;
  return registration.pushManager.getSubscription().catch(() => null);
}

/** Запрос разрешения + подписка + регистрация на сервере. */
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
    /* ignore */
  }
  return 'ready';
}

/** Тихое переподключение при старте: подписка есть, но сервер мог её не знать. */
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

export async function unsubscribeWebPush(): Promise<void> {
  const subscription = await currentSubscription();
  const token = subscription ? JSON.stringify(subscription.toJSON()) : null;
  try {
    if (token) await unregisterDevice(token);
  } catch {
    /* сервер пометит подписку невалидной при 410 */
  }
  try {
    localStorage.removeItem(LAST_SUBSCRIPTION_KEY);
  } catch {
    /* ignore */
  }
  if (subscription) await subscription.unsubscribe().catch(() => false);
}

export const PUSH_SUPPORT_TEXT: Record<PushSupport, string> = {
  ready: 'Push включён в этом браузере',
  denied: 'Уведомления запрещены в настройках браузера для cleanfine.ru',
  'no-service-worker': 'Push недоступен: нет service worker (dev-режим или старый браузер)',
  'no-push': 'Этот браузер не поддерживает push-уведомления',
  'server-off': 'Push на сервере не настроен',
};
