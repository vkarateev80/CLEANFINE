import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Куда dev-прокси отправляет группы эндпоинтов. Сервисы слушают РАЗНЫЕ порты
 * (auth :3001, files :3002, core :3003), поэтому одной записи `/api → :3001`
 * больше недостаточно: запросы к core-service уходили бы в auth-service и
 * возвращали 404.
 *
 * Список префиксов, а не «лови всё на auth», выбран сознательно: неизвестный
 * путь лучше отдать честным 404 от Vite, чем молча получить 404 от чужого
 * сервиса и искать причину в контроллерах.
 *
 * В прод-сборке прокси нет — той же маршрутизацией занимается reverse-proxy
 * перед сервисами; фронт при этом ходит на относительный `/api`.
 */
const SERVICE_ROUTES: Array<[prefix: string, target: string]> = [
  ['/api/auth', 'http://localhost:3001'],
  ['/api/users', 'http://localhost:3001'],
  ['/api/files', 'http://localhost:3002'],
  ['/api/objects', 'http://localhost:3003'],
  ['/api/floors', 'http://localhost:3003'],
  ['/api/rooms', 'http://localhost:3003'],
  ['/api/routes', 'http://localhost:3003'],
  ['/api/route-points', 'http://localhost:3003'],
  ['/api/tech-cards', 'http://localhost:3003'],
  ['/api/tech-operations', 'http://localhost:3003'],
];

const proxy = Object.fromEntries(
  SERVICE_ROUTES.map(([prefix, target]) => [prefix, { target, changeOrigin: true }]),
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // tsconfig.paths Vite не читает. Пока из shared импортировались только типы,
      // этого не замечали (типы стираются компилятором), но константы статусов и
      // переходы (OBJECT_STATUS_LABELS, canTransitionObject, …) — рантайм-значения,
      // и без алиаса сборка падала бы на «не удалось разрешить модуль».
      '@cleaning-ops/shared': fileURLToPath(new URL('../../shared/dist', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy,
    watch: {
      /**
       * Windows + chokidar: инструменты правки файлов сохраняют через временный
       * `<имя>~XXXXXX.TMP` и переименование. Вотчер успевает подписаться на TMP,
       * получает EBUSY («resource busy or locked») и роняет ВЕСЬ dev-сервер —
       * наблюдалось на `pages/Floors/PlanDropZone.tsx~RF44e61e6.TMP`.
       * Эти файлы не нужны никому: игнорируем их и каталог сборки.
       */
      ignored: ['**/*.TMP', '**/*.tmp', '**/~*', '**/dist/**'],
    },
  },
});
