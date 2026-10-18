import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

/**
 * Граница ошибок всего приложения (14.10.2026). Без неё любое исключение в
 * рендере размонтировало дерево целиком — пользователь видел белую страницу
 * без объяснений. Теперь: текст ошибки, «Обновить» и «Сбросить данные»
 * (очистка localStorage, sessionStorage и кэшей service worker — лечит
 * устаревшее сохранённое состояние после выката).
 */

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

const WRAP: CSSProperties = {
  fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
  maxWidth: 520,
  margin: '48px auto',
  padding: '0 16px',
  color: '#1e293b',
  lineHeight: 1.5,
};

const BUTTON: CSSProperties = {
  font: 'inherit',
  padding: '10px 16px',
  borderRadius: 8,
  border: 0,
  cursor: 'pointer',
};

export async function resetClientState(): Promise<void> {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* хранилище недоступно */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* кэшей нет */
  }
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CLEANFINE] ошибка рендера', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private reset = (): void => {
    void resetClientState().finally(() => window.location.reload());
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div role="alert" data-testid="app-error-boundary" style={WRAP}>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
          {t('Страница не открылась')}
        </div>
        <p style={{ margin: '0 0 12px' }}>
          {t('Ошибка:')} <span style={{ fontFamily: 'ui-monospace, monospace' }}>{error.message}</span>
        </p>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          {t('Попробуйте обновить страницу. Если ошибка повторяется — сбросьте сохранённые данные приложения и войдите заново; если и это не помогает, пришлите текст ошибки администратору.')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...BUTTON, background: '#2563eb', color: '#fff' }}
            onClick={this.reload}
          >
            {t('Обновить')}
          </button>
          <button
            type="button"
            style={{ ...BUTTON, background: '#e2e8f0', color: '#1e293b' }}
            onClick={this.reset}
          >
            {t('Сбросить данные и войти заново')}
          </button>
        </div>
      </div>
    );
  }
}
