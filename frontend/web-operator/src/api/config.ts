/**
 * База API. В dev — относительный `/api` (прокси Vite раскидывает по сервисам),
 * в проде — тот же origin, маршрутизацией занимается nginx пода.
 * `||`, а не `??`: пустая строка в .env должна давать `/api`, а не ''.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Базовый путь SPA. В dev — `/`; на k3s рабочее место живёт под `/app`
 * (`VITE_BASE=/app/`), иначе редиректы уводили бы в корень — в админку.
 */
export const BASE_PATH = import.meta.env.BASE_URL;
export const LOGIN_PATH = `${BASE_PATH}login`;

/** База WebSocket чата: в dev задаётся явно (`VITE_WS_URL`), в проде — тот же origin. */
export const WS_URL = import.meta.env.VITE_WS_URL ?? '';
export const WS_PATH = '/socket.io';
