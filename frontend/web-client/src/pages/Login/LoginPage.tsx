import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS, type Role } from '@cleaning-ops/shared/types/roles';
import { login, logout } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { PORTAL_ROLES } from '../../components/auth/RoleGuard';
import { apiStatus } from '../../lib/http';

/**
 * Вход в портал заказчика (DS-004, `login.md`).
 *
 * Экран решает три задачи: аутентификация (`POST /api/auth/login` → `GET /api/auth/me`),
 * отсечение ролей, которым портал не предназначен, и запоминание сессии
 * (refresh-токен в `authStore`, поэтому телефон не спрашивает пароль при каждом
 * открытии).
 *
 * Регистрации, восстановления пароля и входа по коду в портале нет: учётные
 * записи заводит администратор, а PIN/биометрия — сценарий мобильного
 * приложения оператора (DS-002), а не портала.
 */

interface LocationState {
  from?: { pathname: string; search?: string };
  /** Роль, которой портал запрещён, — приходит от `RoleGuard` при отказе. */
  roleDenied?: Role;
}

/**
 * Автоловушка лончеров с рабочего стола: `?email=…&password=…`.
 * Пароль только в адресной строке локального запуска, в бандл не вшит;
 * после входа URL очищается через `history.replaceState`.
 */
export function readAutoLogin(search: string): { email: string; password: string } | null {
  const params = new URLSearchParams(search);
  const email = params.get('email');
  const password = params.get('password');
  if (!email || !password) return null;
  return { email, password };
}

/** Логин: email или короткое имя (client) — формат не ограничиваем, 401 вернёт бэкенд. */
function isEmailLike(value: string): boolean {
  return value.trim().length > 0;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleWarning, setRoleWarning] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const autoTried = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // Отказ по роли приходит редиректом из `RoleGuard`: объясняем, почему портал
  // закрыт, и что сотруднику делать вместо него.
  useEffect(() => {
    if (state?.roleDenied) {
      setRoleWarning(
        `Портал предназначен для заказчиков. Роль «${
          ROLE_LABELS[state.roleDenied] ?? state.roleDenied
        }» работает в админ-панели.`,
      );
    }
  }, [state?.roleDenied]);

  async function performLogin(nextEmail: string, nextPassword: string): Promise<boolean> {
    setError(null);
    setEmailError(null);
    setRoleWarning(null);

    if (!nextEmail || !nextPassword) {
      setError('Введите email и пароль');
      return false;
    }
    if (!isEmailLike(nextEmail)) {
      setEmailError('Введите корректный email');
      return false;
    }

    setLoading(true);
    try {
      const user = await login({ email: nextEmail, password: nextPassword });

      // Роль проверяется ПОСЛЕ получения профиля: `POST /api/auth/login` ролей не
      // различает, токены к этому моменту уже выданы, и их нужно погасить —
      // иначе сотрудник остался бы с валидной сессией в портале.
      if (!PORTAL_ROLES.includes(user.role as (typeof PORTAL_ROLES)[number])) {
        await logout();
        setRoleWarning(
          `Портал предназначен для заказчиков. Роль «${
            ROLE_LABELS[user.role] ?? user.role
          }» работает в админ-панели.`,
        );
        return false;
      }

      const from = state?.from;
      const target = from ? `${from.pathname}${from.search ?? ''}` : '/dashboard';
      navigate(target, { replace: true });
      return true;
    } catch (caught) {
      const status = apiStatus(caught);
      if (status === 401) {
        setError('Неверный email или пароль');
        // Фокус в поле пароля: пользователь сразу может исправить, а на телефоне
        // клавиатура открывается без лишнего тапа (login.md п. 6).
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

  // Автоловушка лончера: один раз за загрузку; при ошибке поля остаются
  // заполненными — пользователь правит и жмёт «Войти» сам.
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-lg font-semibold text-neutral-900">Вход в портал</h1>

      {roleWarning && <SoftWarning>{roleWarning}</SoftWarning>}

      <Field label="Email" htmlFor="portal-email" required error={emailError}>
        <Input
          id="portal-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          className="text-base"
          // Требование М5.4: вход клиентом в e2e ищет поле по этому id.
          data-testid="portal-login-email"
          value={email}
          invalid={Boolean(emailError)}
          disabled={loading}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="client"
        />
      </Field>

      <Field label="Пароль" htmlFor="portal-password" required>
        <div className="flex items-stretch gap-2">
          <Input
            id="portal-password"
            ref={passwordRef}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="text-base"
            data-testid="portal-login-password"
            value={password}
            invalid={Boolean(error && error === 'Неверный email или пароль')}
            disabled={loading}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[44px] shrink-0"
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
          data-testid="portal-login-error"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        className="mt-1 min-h-[44px] w-full"
        data-testid="portal-login-submit"
      >
        Войти
      </Button>

      <p className="text-center text-xs text-neutral-500">Забыли пароль? Обратитесь к менеджеру.</p>
    </form>
  );
}
