import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Куда dev-прокси отправляет группы эндпоинтов. Сервисы слушают РАЗНЫЕ порты
 * (auth :3001, files :3002, core :3003, gps :3004, tickets :3005,
 * notifications :3006, materials :3007, schedule :3008), поэтому одной записи
 * `/api → :3001` больше недостаточно: запросы к core-service уходили бы в
 * auth-service и возвращали 404.
 *
 * Список префиксов, а не «лови всё на auth», выбран сознательно: неизвестный
 * путь лучше отдать честным 404 от Vite, чем молча получить 404 от чужого
 * сервиса и искать причину в контроллерах.
 *
 * В прод-сборке прокси нет — той же маршрутизацией занимается reverse-proxy
 * перед сервисами; фронт при этом ходит на относительный `/api`.
 *
 * КУДА ХОДИТ ПРОКСИ, НАСТРАИВАЕТСЯ ОКРУЖЕНИЕМ — иначе локальная проверка молча
 * уходит в чужой стенд. Дефолт (`localhost`, без смещения) — это локальный
 * стендовая раскладка портов 3001–3009; на машине, где рядом живёт
 * демонстрационный compose `cleaning-ops-vps`, по этим портам слушает именно он.
 * Изолированный стенд `prj-cleanfine` публикует сервисы на tailnet-адресе
 * со смещением: 3001 → 8111 … 3009 → 8119. Тогда:
 *
 *   VITE_SERVICE_HOST=100.109.185.14 VITE_SERVICE_PORT_OFFSET=5110 pnpm dev
 *
 * Значения по умолчанию намеренно совпадают с прежним поведением: CI и обычный
 * локальный стенд не меняются.
 */
const SERVICE_HOST = process.env.VITE_SERVICE_HOST || 'localhost';
const SERVICE_PORT_OFFSET = Number(process.env.VITE_SERVICE_PORT_OFFSET || 0);

/** Адрес сервиса по его штатному локальному порту. */
const svc = (port: number) => `http://${SERVICE_HOST}:${port + SERVICE_PORT_OFFSET}`;

const SERVICE_ROUTES: Array<[prefix: string, target: string]> = [
  ['/api/auth', svc(3001)],
  ['/api/users', svc(3001)],
  ['/api/files', svc(3002)],
  ['/api/objects', svc(3003)],
  ['/api/floors', svc(3003)],
  ['/api/rooms', svc(3003)],
  ['/api/routes', svc(3003)],
  ['/api/route-points', svc(3003)],
  ['/api/tech-cards', svc(3003)],
  ['/api/tech-operations', svc(3003)],
  // М3 — оперативка
  ['/api/gps', svc(3004)],
  ['/api/tickets', svc(3005)],
  ['/api/notifications', svc(3006)],
  // М4 — планирование и учёт
  ['/api/materials', svc(3007)],
  ['/api/schedule', svc(3008)],
  // М5 — коммуникации
  ['/api/chat', svc(3009)],
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
    //5173 занят dev-сервером другого проекта (PatentMaster10-master) —
    // админке отведён постоянный 5175, чтобы проекты не воевали за порт.
    port: 5175,
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
