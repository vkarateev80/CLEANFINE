import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { Button } from '../../components/ui/Button';

interface LocationState {
  from?: { pathname: string };
}

/**
 * Автоловушка лончеров с рабочего стола: `?email=…&password=…`.
 * Пароль живёт только в адресной строке конкретного локального запуска —
 * в бандл ничего не вшито, после входа URL очищается (history.replaceState,
 * в историю мусор не попадает).
 */
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const autoTried = useRef(false);

  async function performLogin(nextEmail: string, nextPassword: string): Promise<boolean> {
    setError(null);
    if (!nextEmail || !nextPassword) {
      setError('Введите email и пароль');
      return false;
    }
    setLoading(true);
    try {
      await login({ email: nextEmail, password: nextPassword });
      const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
      return true;
    } catch (err) {
      setError(extractError(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await performLogin(email, password);
  }

  // Автоловушка лончера: один раз за загрузку, без циклов при ошибке —
  // после неё пользователь правит уже заполненные поля руками.
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900">Вход в систему</h1>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 max-lg:min-h-[44px]"
          placeholder="admin"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 max-lg:min-h-[44px]"
        />
      </label>

      {error && (
        <div className="rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-danger-600">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
        Войти
      </Button>
    </form>
  );
}

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const axiosError = err as { response?: { data?: { message?: string | string[] } } };
    const message = axiosError.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'Не удалось войти. Проверьте соединение с сервером.';
}
