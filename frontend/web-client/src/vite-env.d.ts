/// <reference types="vite/client" />

/**
 * Переменные окружения портала. Объявлены явно: `import.meta.env.VITE_WS_URL`
 * без типа — это `any`, и опечатка в имени переменной не ловится компилятором.
 */
interface ImportMetaEnv {
  /** База REST API. Пусто/не задано → относительный `/api` (dev-прокси Vite). */
  readonly VITE_API_URL?: string;
  /** Адрес chat-service для socket.io. Пусто → тот же origin (через WS-прокси Vite). */
  readonly VITE_WS_URL?: string;
  /**
   * UUID менеджера (роль ADMIN), с которым портал открывает DIRECT-чат.
   * Справочник `/api/users` закрыт для роли CLIENT, поэтому id приходит
   * конфигурацией, а не запросом (см. README, раздел «Ограничения»).
   */
  readonly VITE_MANAGER_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
