/**
 * База API. В dev — ОТНОСИТЕЛЬНЫЙ `/api`: vite-прокси раскидывает запросы по
 * сервисам (см. `vite.config.ts`). Абсолютный `VITE_API_URL` нужен только для
 * прод-сборки, где маршрутизацией занимается reverse-proxy.
 *
 * `||`, а не `??`: пустая строка (`VITE_API_URL=` в .env — самый частый способ
 * «выключить» переменную) дала бы baseURL `''`, axios потерял бы префикс `/api`
 * и все запросы ушли бы в корень домена.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Базовый путь самого SPA. В dev и в корневом деплое — `/`; на k3s портал
 * опубликован под `/client` (build-arg `VITE_BASE=/client/`, см. Dockerfile.web),
 * иначе ссылки и редиректы уводили бы в корень домена — на админку.
 * `BASE_URL` у Vite всегда заканчивается на `/`.
 */
export const BASE_PATH = import.meta.env.BASE_URL;
export const LOGIN_PATH = `${BASE_PATH}login`;

/**
 * База WebSocket чата (chat-service, :3009). В dev её задают явно —
 * `VITE_WS_URL=http://localhost:3009`: dev-сервер Vite занимает путь `/socket.io`
 * под собственный HMR-канал, поэтому WS-шлюз не проксируется (подробный разбор —
 * в `vite.config.ts`). В прод-сборке переменную не задают: пустое значение
 * означает «тот же origin», где WebSocket-upgrade делает reverse-proxy.
 *
 * `VITE_WS_URL` из `FRONTEND_WEB.md` указывает на сервис целиком, а namespace
 * `/chat` добавляет socket.io (см. `useChatSocket`).
 */
export const WS_URL = import.meta.env.VITE_WS_URL ?? '';

/** Путь socket.io: штатный. Вынесен отдельно, чтобы его не задавали в двух местах. */
export const WS_PATH = '/socket.io';
