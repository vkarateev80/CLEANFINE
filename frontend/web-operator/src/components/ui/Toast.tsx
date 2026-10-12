import { useEffect } from 'react';
import { useUiStore } from '../../stores/uiStore';

/** Снекбар: одно сообщение, исчезает через 4 с; живая область для скринридера. */
export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const hide = useUiStore((s) => s.hideToast);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(hide, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, hide]);

  if (!toast) return null;
  const tone =
    toast.tone === 'error'
      ? 'border-danger-500 text-danger-600'
      : toast.tone === 'success'
        ? 'border-success-500 text-success-600'
        : 'border-neutral-300 text-neutral-900';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        role="status"
        data-testid="op-toast"
        className={[
          'pointer-events-auto max-w-md rounded-lg border bg-white px-4 py-3 text-sm shadow-lg',
          tone,
        ].join(' ')}
      >
        {toast.text}
      </div>
    </div>
  );
}
