import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Dev-прокси рабочего места оператора. Сервисы слушают разные порты (тот же
 * приём, что в web-admin/web-client), поэтому карта префиксов задаётся явно.
 *
 * Оператору нужны ВСЕ девять сервисов: auth (вход), files (фото операций и
 * SOS), core (объект, этаж, помещение, маршрут, техкарта), gps (трек),
 * tickets (заявки, завершение операций, SOS), notifications (счётчик и
 * настройки), schedule (смены, check-in/out), chat (переписка). materials не
 * нужен: списание делает сервер по событию, остатков оператор не видит.
 *
 * WebSocket чата в dev идёт напрямую на :3009 (`VITE_WS_URL`), потому что
 * dev-сервер Vite занимает `/socket.io` под HMR (см. web-client/vite.config.ts).
 */
const SERVICE_ROUTES: Array<[prefix: string, target: string]> = [
  ['/api/auth', 'http://localhost:3001'],
  ['/api/users', 'http://localhost:3001'],
  ['/api/files', 'http://localhost:3002'],
  ['/api/objects', 'http://localhost:3003'],
  ['/api/floors', 'http://localhost:3003'],
  ['/api/rooms', 'http://localhost:3003'],
  ['/api/routes', 'http://localhost:3003'],
  ['/api/tech-cards', 'http://localhost:3003'],
  ['/api/gps', 'http://localhost:3004'],
  ['/api/tickets', 'http://localhost:3005'],
  ['/api/notifications', 'http://localhost:3006'],
  ['/api/schedule', 'http://localhost:3008'],
  ['/api/chat', 'http://localhost:3009'],
];

const proxy = Object.fromEntries(
  SERVICE_ROUTES.map(([prefix, target]) => [prefix, { target, changeOrigin: true }]),
);

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
   * База публичных URL. В dev — `/`; на k3s приложение живёт под
   * cleanfine.ru/app (сборка с `VITE_BASE=/app/`, см. deploy/vps/Dockerfile.web),
   * иначе ассеты запрашивались бы из корня домена — у админки.
   */
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      '@cleaning-ops/shared': fileURLToPath(new URL('../../shared/dist', import.meta.url)),
    },
  },
  server: {
    // 5177: админка 5173/5175/5176, портал 5174 — не пересекаемся с соседними стендами.
    port: 5177,
    strictPort: true,
    proxy,
    watch: {
      ignored: ['**/*.TMP', '**/*.tmp', '**/~*', '**/dist/**'],
    },
  },
});
