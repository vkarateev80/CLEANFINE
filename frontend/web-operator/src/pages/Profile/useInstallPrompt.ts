import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Установка PWA. Chrome/Android дают событие `beforeinstallprompt`; iOS Safari
 * — нет, там только подсказка «Поделиться → На экран Домой». Уже установленное
 * приложение (`display-mode: standalone`) подсказок не показывает.
 */
export function useInstallPrompt(): {
  canInstall: boolean;
  iosHint: boolean;
  prompt: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(Boolean(isStandalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return {
    canInstall: Boolean(deferred) && !standalone,
    iosHint: isIos && !standalone,
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    },
  };
}
