import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { login, logout } from '../../api/auth';
import { isOperatorRole } from '../../components/auth/RoleGuard';
import { Button } from '../../components/ui/Button';
import { SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Input';
import { apiStatus } from '../../lib/http';

/**
 * Вход оператора (auth.md §3.1): email/пароль → `POST /auth/login` →
 * `GET /auth/me` → проверка роли. PIN и биометрия — сценарии нативного
 * приложения; в браузере сессию держит refresh-токен в localStorage.
 */
interface LocationState {
  from?: { pathname: string; search?: string };
  roleDenied?: Role;
  /** Сообщение после смены пароля («Пароль изменён. Войдите заново.»). */
  notice?: string;
}

export const ROLE_DENIED_TEXT =
  'Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.';

export function readAutoLogin(search: string): { email: string; password: string } | null {
  const params = new URLSearchParams(search);
  const email = params.get('email');
  const password = params.get('password');
  if (!email || !password) return null;
  return { email, password };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const autoTried = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  useEffect(() => {
    if (state?.roleDenied) setNotice(ROLE_DENIED_TEXT);
    else if (state?.notice) setNotice(state.notice);
  }, [state?.roleDenied, state?.notice]);

  async function performLogin(nextEmail: string, nextPassword: string): Promise<boolean> {
    setError(null);
    if (!nextEmail.trim() || !nextPassword) {
      setError('Введите email и пароль');
      return false;
    }
    setLoading(true);
    try {
      const user = await login({ email: nextEmail.trim(), password: nextPassword });
      if (!isOperatorRole(user.role)) {
        // Токены уже выданы — гасим сессию, иначе заказчик остался бы с валидной сессией здесь.
        await logout();
        setNotice(ROLE_DENIED_TEXT);
        return false;
      }
      const from = state?.from;
      const target = from ? `${from.pathname}${from.search ?? ''}` : '/today';
      navigate(target, { replace: true });
      return true;
    } catch (caught) {
      const status = apiStatus(caught);
      if (status === 401) {
        setError('Неверный email или пароль');
        passwordRef.current?.focus();
      } else if (status === 400) {
        setError(errorMessage(caught));
      } else if (status === 429) {
        setError('Слишком много попыток. Попробуйте позже');
      } else {
        setError('Не удалось войти. Проверьте соединение с сервером');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await performLogin(email, password);
  }

  // Автоловушка лончеров (`?email=…&password=…`): один раз за загрузку, URL очищается.
  useEffect(() => {
    if (autoTried.current) return;
    const auto = readAutoLogin(window.location.search);
    if (!auto) return;
    autoTried.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    setEmail(auto.email);
    setPassword(auto.password);
    void performLogin(auto.email, auto.password);
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
      data-testid="op-login-form"
    >
      <h1 className="text-lg font-semibold text-neutral-900">Вход</h1>

      {notice && <SoftWarning>{notice}</SoftWarning>}

      <Field label="Email" htmlFor="op-email" required>
        <Input
          id="op-email"
          name="email"
          type="text"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          className="min-h-[48px] text-base"
          data-testid="email_field"
          value={email}
          disabled={loading}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="operator"
        />
      </Field>

      <Field label="Пароль" htmlFor="op-password" required>
        <div className="flex items-stretch gap-2">
          <Input
            id="op-password"
            ref={passwordRef}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="min-h-[48px] text-base"
            data-testid="password_field"
            value={password}
            invalid={error === 'Неверный email или пароль'}
            disabled={loading}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[48px] shrink-0"
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? 'скрыть' : 'показать'}
          </Button>
        </div>
      </Field>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger-500 bg-white px-3 py-2 text-sm text-danger-600"
          data-testid="op-login-error"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        className="mt-1 min-h-[48px] w-full"
        data-testid="submit_button"
      >
        Войти
      </Button>

      <p className="text-center text-xs text-neutral-500">Забыли пароль? Обратитесь к бригадиру.</p>
    </form>
  );
}
