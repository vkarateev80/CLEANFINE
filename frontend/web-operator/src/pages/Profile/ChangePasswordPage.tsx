import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Input';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { apiStatus } from '../../lib/http';
import { useAuthStore } from '../../stores/authStore';
import { t } from '../../i18n';

/**
 * Смена пароля (profile.md §3.2). После успеха сервер отзывает все сессии —
 * чистим токены и ведём на /login с пояснением.
 */
export function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const logoutLocal = useAuthStore((s) => s.logout);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 6) {
      setError(t('Новый пароль должен быть не короче 6 символов'));
      return;
    }
    if (next !== repeat) {
      setError(t('Пароли не совпадают'));
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next);
      logoutLocal();
      navigate('/login', { replace: true, state: { notice: t('Пароль изменён. Войдите заново.') } });
    } catch (caught) {
      const status = apiStatus(caught);
      setError(
        status === 401 || status === 400
          ? errorMessage(caught)
          : t('Не удалось сменить пароль. Повторите позже'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FullscreenLayout
      title={t('Сменить пароль')}
      backTo="/profile"
      showSos={false}
      testId="change_password_page"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label={t('Текущий пароль')} htmlFor="current_password_field" required>
          <Input
            id="current_password_field"
            type="password"
            autoComplete="current-password"
            className="min-h-[48px]"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={loading}
            data-testid="current_password_field"
          />
        </Field>
        <Field
          label={t('Новый пароль')}
          htmlFor="new_password_field"
          required
          hint={t('Не короче 6 символов')}
        >
          <Input
            id="new_password_field"
            type="password"
            autoComplete="new-password"
            className="min-h-[48px]"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={loading}
            data-testid="new_password_field"
          />
        </Field>
        <Field label={t('Повторите новый пароль')} htmlFor="new_password_repeat_field" required>
          <Input
            id="new_password_repeat_field"
            type="password"
            autoComplete="new-password"
            className="min-h-[48px]"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            disabled={loading}
            data-testid="new_password_repeat_field"
          />
        </Field>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-danger-500 bg-white px-3 py-2 text-sm text-danger-600"
          >
            {error}
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          className="min-h-[48px] w-full"
          loading={loading}
          data-testid="save_password_button"
        >
          {t('Сохранить')}
        </Button>
        <p className="text-xs text-neutral-500">
          {t('После смены пароля все устройства выйдут из аккаунта — войдите заново.')}
        </p>
      </form>
    </FullscreenLayout>
  );
}
