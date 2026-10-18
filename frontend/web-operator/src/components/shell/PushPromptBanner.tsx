import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { PUSH_SUPPORT_TEXT, pushSupport, subscribeWebPush, type PushSupport } from '../../lib/webPush';
import { showToast } from '../../stores/uiStore';
import { t } from '../../i18n';

const DISMISS_KEY = 'cleanfine-operator-push-dismissed';

/**
 * Баннер на «Сегодня» (12.10.2026): предлагает включить push, пока разрешение
 * не дано. Раньше подписка пряталась в профиле, и операторы её не включали —
 * «уведомления не работают». На iPhone вне установленного приложения push
 * недоступен: показываем подсказку про «На экран Домой».
 */
export function PushPromptBanner() {
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(pushSupport());
  }, []);

  if (dismissed) return null;
  const needsInstall = support === 'ios-needs-install';
  const canEnable = support === 'ready' && permission === 'default';
  if (!needsInstall && !canEnable) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function enable() {
    setBusy(true);
    try {
      const result = await subscribeWebPush();
      setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      setSupport(pushSupport());
      if (result === 'ready') {
        showToast(t('Push включён: уведомления придут даже при закрытом приложении'), 'success');
        dismiss();
      } else {
        showToast(t(PUSH_SUPPORT_TEXT[result]), 'error');
      }
    } catch {
      showToast(t('Не удалось включить push'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-primary-200 bg-primary-50 p-3"
      data-testid="push_prompt_banner"
    >
      <div className="text-sm font-medium text-neutral-900">
        🔔 {needsInstall ? t('Уведомления на iPhone') : t('Включите уведомления')}
      </div>
      <div className="text-xs text-neutral-700">
        {needsInstall
          ? t('Чтобы приходили push о заявках и сообщениях, добавьте приложение на экран «Домой»: «Поделиться» → «На экран Домой», затем откройте его оттуда и включите уведомления в профиле.')
          : t('Новые заявки, SOS и сообщения будут приходить даже при закрытом приложении, со звуком и вибрацией.')}
      </div>
      <div className="flex gap-2">
        {canEnable && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() => void enable()}
            data-testid="push_prompt_enable"
          >
            {t('Включить')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={dismiss} data-testid="push_prompt_later">
          {t('Позже')}
        </Button>
      </div>
    </section>
  );
}
