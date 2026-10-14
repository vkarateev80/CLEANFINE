import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Куда dev-прокси отправляет группы эндпоинтов. Сервисы слушают РАЗНЫЕ порты,
 * поэтому одной записи `/api → :3001` недостаточно (приём скопирован из
 * `frontend/web-admin/vite.config.ts`).
 *
 * Портал ходит только в те сервисы, которые ему нужны по DS-004: auth/users
 * (вход и сессия), core (объект клиента), tickets (заявки), notifications
 * (счётчик непрочитанных), materials (отчёт по расходу), schedule (смены),
 * chat (переписка с менеджером). `/api/files`, `/api/gps`, `/api/routes`,
 * `/api/tech-*` порталу не нужны — неизвестный путь честно отдаёт 404 от Vite,
 * а не 404 чужого сервиса.
 *
 * REST-чата идёт через `/api/chat` (тот же прокси), а **WebSocket-шлюз — нет**.
 * Причина: dev-сервер Vite сам занимает путь `/socket.io` под собственный
 * HMR-канал, и клиентский handshake до прокси не доходит (проверено: запрос
 * `/socket.io/?EIO=4` через 5174 отдаёт `index.html` SPA-фallback, а не
 * engine.io-хендшейк). Прокси с другим префиксом и `rewrite` тоже не спасает:
 * socket.io-клиент в браузере уходит на `ws://localhost:3009` напрямую, минуя
 * dev-сервер. Поэтому в dev адрес шлюза задаётся переменной `VITE_WS_URL`
 * (см. `.env.local` и README), а в прод-сборке переменную не задают — там
 * WebSocket-upgrade делает reverse-proxy перед сервисами.
 *
 * В прод-сборке прокси нет — той же маршрутизацией занимается reverse-proxy;
 * фронт ходит на относительный `/api` (см. `src/api/config.ts`).
 */
const SERVICE_ROUTES: Array<[prefix: string, target: string]> = [
  ['/api/auth', 'http://localhost:3001'],
  ['/api/users', 'http://localhost:3001'],
  ['/api/objects', 'http://localhost:3003'],
  ['/api/tickets', 'http://localhost:3005'],
  ['/api/notifications', 'http://localhost:3006'],
  ['/api/materials', 'http://localhost:3007'],
  ['/api/schedule', 'http://localhost:3008'],
  ['/api/chat', 'http://localhost:3009'],
];

const proxy = Object.fromEntries(
  SERVICE_ROUTES.map(([prefix, target]) => [prefix, { target, changeOrigin: true }]),
);

// https://vitejs.dev/config/
export default defineConfig({
  /**
   * Совместимость с браузерами (14.10.2026, «в Chrome белая страница»):
   * Vite по умолчанию собирает под Chrome 87+/Safari 14+, и более старый
   * браузер падал на SyntaxError ещё до запуска React — пустой экран без
   * единого слова. Теперь:
   *  • современный бандл транспилируется под Chrome 67+, Safari 14+,
   *    Firefox 68+, Edge 79+ (modernTargets задаёт и esbuild-таргет — плагин
   *    переопределяет build.target сам) и получает полифилы по факту использования;
   *  • для браузеров без ESM собирается legacy-бандл (SystemJS + core-js),
   *    подключаемый через <script nomodule>.
   * Остальное — страховка в index.html (текст вместо белого экрана) и
   * AppErrorBoundary (ошибка рендера вместо пустой страницы).
   */
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 55', 'safari >= 11', 'ios >= 11', 'android >= 55'],
      // Нижняя граница современного бандла — BigInt-литералы в mapbox-gl 3
      // (Chrome 67, Firefox 68, Safari 14): ниже esbuild их не понижает.
      modernTargets: 'edge>=79, firefox>=68, chrome>=67, safari>=14, chromeAndroid>=67, iOS>=14',
      modernPolyfills: true,
    }),
  ],
  /**
   * База публичных URL (аресы, main-маршрут в index.html). Дефолт `/` — dev на
   * :5174, e2e и корневые деплои работают как раньше. Для k3s-портала сборка
   * идёт с `VITE_BASE=/client/` (build-arg в deploy/vps/Dockerfile.web), иначе
   * браузер запросил бы `/assets/…` в корне — попал бы в web-admin.
   */
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      // tsconfig.paths Vite не читает; из shared приходят рантайм-значения
      // (OBJECT_STATUS_LABELS, SCHEDULE_EVENT_STATUS_LABELS, ROLE_LABELS), поэтому
      // без алиаса сборка падала бы на «не удалось разрешить модуль».
      '@cleaning-ops/shared': fileURLToPath(new URL('../../shared/dist', import.meta.url)),
    },
  },
  server: {
    // Строго 5174: web-admin занимает 5173, а `strictPort` не даёт Vite «уехать»
    // на 5175 — иначе e2e и прокси-конфиг молча разошлись бы с адресом стенда.
    port: 5174,
    strictPort: true,
    proxy,
    watch: {
      /**
       * Windows + chokidar: инструменты правки файлов сохраняют через временный
       * `<имя>~XXXXXX.TMP` и переименование. Вотчер успевает подписаться на TMP,
       * получает EBUSY и роняет весь dev-сервер. Тот же приём, что в web-admin.
       */
      ignored: ['**/*.TMP', '**/*.tmp', '**/~*', '**/dist/**'],
    },
  },
});
