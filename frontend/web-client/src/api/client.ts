import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { API_BASE_URL, LOGIN_PATH } from './config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

/** Публичные эндпоинты аутентификации: их 401 означает «неверные данные», а не истёкшую сессию. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/pin', '/auth/biometric', '/auth/refresh'];

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

type RefreshOutcome = { ok: true; accessToken: string } | { ok: false };

/**
 * Обновление access-токена в режиме single-flight.
 *
 * Почему это критично: страница при монтировании запускает несколько запросов
 * параллельно (объект + этажи + техкарты). Когда access-токен истекает, 401
 * приходит сразу на все, и без общей «обещания» каждый запрос уходил бы в свой
 * `/auth/refresh`. Refresh-токен одноразовый (ротация с ревокацией старого), поэтому
 * успевал сработать только первый вызов, остальные получали 401 и разлогинивали
 * пользователя — ровно в момент, когда он открыл раздел.
 */
let inFlightRefresh: Promise<RefreshOutcome> | null = null;

function refreshAccessToken(refreshToken: string): Promise<RefreshOutcome> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const { logout, setTokens } = useAuthStore.getState();

  inFlightRefresh = axios
    .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
    .then((response) => {
      setTokens(response.data);
      return { ok: true as const, accessToken: response.data.accessToken as string };
    })
    .catch(() => {
      // Сессия кончилась — чистим состояние один раз, а не по разу на каждый
      // ожидающий запрос.
      logout();
      return { ok: false as const };
    })
    .finally(() => {
      // Снимаем «обещание» только после завершения: иначе следующий 401
      // запустил бы второй refresh, пока первый ещё в полёте.
      inFlightRefresh = null;
    });

  return inFlightRefresh;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    // 401 от логина/PIN/refresh — это ответ «неверные учётные данные». Раньше такой
    // 401 попадал в refresh-ветку, приводил к logout() и полной перезагрузке
    // /login: сообщение об ошибке не показывалось, а введённые данные терялись.
    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }
    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    const { refreshToken } = useAuthStore.getState();
    // Нет сессии — нечего обновлять, просто пробрасываем 401 вызывающему коду.
    if (!refreshToken) {
      return Promise.reject(error);
    }

    // Помечаем ДО ожидания: повторный 401 на том же запросе не должен
    // запускать вторую попытку.
    originalRequest._retry = true;

    const outcome = await refreshAccessToken(refreshToken);
    if (!outcome.ok) {
      // Полная перезагрузка нужна только если пользователь уже вне /login —
      // иначе теряются введённые данные и сообщение об ошибке. Путь считается
      // от BASE_PATH: на k3s портал живёт под /client, и корневой '/login'
      // увёл бы пользователя в админку.
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.href = LOGIN_PATH;
      }
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${outcome.accessToken}`;
    return apiClient(originalRequest);
  },
);
