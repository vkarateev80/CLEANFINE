import { useEffect, useState } from 'react';
import { sendSelfTest } from '../../api/notifications';
import { Button } from '../../components/ui';
import {
  PUSH_SUPPORT_TEXT,
  currentSubscription,
  pushSupport,
  subscribeWebPush,
  unsubscribeWebPush,
} from '../../lib/webPush';

/**
 * Блок push в колокольчике (12.10.2026): одна кнопка «Включить» запрашивает
 * разрешение браузера и подписывает его на push, «Проверить» просит сервер
 * прислать тестовое уведомление. Раньше здесь был только запрос разрешения
 * на уведомления страницы, без push при закрытой вкладке.
 */
export function PushControls() {
  const [support, setSupport] = useState(() => pushSupport());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void currentSubscription().then((subscription) => {
      if (!cancelled) {
        setSubscribed(
          Boolean(subscription) &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted',
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (subscribed) {
        await unsubscribeWebPush();
        setSubscribed(false);
        setMessage('Push выключен');
      } else {
        const result = await subscribeWebPush();
        setSupport(pushSupport());
        if (result === 'ready') {
          setSubscribed(true);
          setMessage('Push включён: уведомления придут даже при закрытой вкладке');
        } else {
          setMessage(PUSH_SUPPORT_TEXT[result]);
        }
      }
    } catch (error) {
      setMessage(`Не удалось: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendSelfTest();
      setMessage(
        result.devices > 0
          ? `Тестовое уведомление отправлено (${result.devices} устр.)`
          : 'Push не включён ни на одном устройстве — уведомление только в списке',
      );
    } catch (error) {
      setMessage(`Проверка не удалась: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const statusText =
    subscribed === null
      ? 'Проверяем…'
      : subscribed
        ? PUSH_SUPPORT_TEXT.ready
        : support === 'ready'
          ? 'Push в этом браузере выключен'
          : PUSH_SUPPORT_TEXT[support];

  return (
    <div
      className="flex flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-600"
      data-testid="notification-push-controls"
    >
      <div className="flex items-center justify-between gap-2">
        <span data-testid="notification-push-status">{statusText}</span>
        <div className="flex gap-1">
          <Button
            variant={subscribed ? 'secondary' : 'primary'}
            size="sm"
            loading={busy}
            disabled={subscribed === null || (!subscribed && support !== 'ready')}
            data-testid="notification-push-toggle"
            onClick={() => void toggle()}
          >
            {subscribed ? 'Выключить' : 'Включить push'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            data-testid="notification-push-test"
            onClick={() => void test()}
          >
            Проверить
          </Button>
        </div>
      </div>
      {message && <span className="text-neutral-700">{message}</span>}
    </div>
  );
}
