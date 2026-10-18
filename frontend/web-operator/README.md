# 📱 Web Operator — рабочее место оператора в браузере

Третий React-клиент монорепо (после `web-admin` и `web-client`). Решение
владельца 09.10.2026: нативные сборки (APK/IPA/Electron) заморожены, все роли
работают в вебе. Оператор открывает **https://cleanfine.ru/app** на телефоне и
добавляет на экран «Домой» — это PWA: иконка, полноэкранный режим, оболочка
открывается без сети.

Экраны — по спецификациям мобильного приложения `design/screens/mobile/*.md`
(DS-002): тексты, ключи (`data-testid` = `Key(...)`) и состояния те же.

| Маршрут | Экран | Данные |
|---|---|---|
| `/login` | Вход (email/пароль), роли OPERATOR/SUPERVISOR/ADMIN; CLIENT — отказ | `POST /auth/login`, `GET /auth/me` |
| `/today` | Смены дня, «Начать смену» (геолокация браузера → геозона на сервере), «Закрыть смену», маршрут и прогресс, «Мои заявки» | `GET /schedule/my`, `POST /schedule/check-in|check-out`, `GET /objects/:id`, `GET /routes/:id`, `GET /tickets?assigneeId=` |
| `/route/:eventId` | План этажа (pan/pinch/zoom), точки маршрута со статусами, текущая точка, пропуск с причиной, легенда | `GET /schedule/events/:id`, `GET /routes/:id`, `GET /floors/:id`, `GET /tickets/:id`, `POST /tickets/:id/comments` |
| `/route/:eventId/room/:roomId` | Чек-лист: операции по порядку, таймер, фото (камера, ≥1280×720), завершение операции и помещения | `GET /rooms/:id`, `GET /tech-cards/:id`, `POST /files/upload`, `POST /tickets/:id/operations/:op/complete`, `POST /tickets/:id/rooms/:room/complete` |
| `/sos` | Аварийная заявка: тип, фото, описание, координаты | `POST /files/upload` → `POST /tickets/emergency` → `POST /files/:id/attach` |
| `/chats`, `/chats/:id` | Список чатов и переписка (WebSocket + REST-фолбэк) | `GET /chat/chats`, `GET /chat/chats/:id/messages`, WS `message:send/read` |
| `/profile`, `/profile/password` | Профиль, геолокация, уведомления, очередь, установка PWA, выход, смена пароля | `GET/PATCH /notifications/settings`, `POST /auth/change-password` |
| `/offline` | Очередь отложенных действий: статус, повтор, удаление | — |

## Оффлайн

Оболочка приложения кэшируется service worker'ом (`public/sw.js`, только в
прод-сборке). Данные экранов живут в кэше TanStack Query (сутки). Действия без
сети — завершение операции/помещения, SOS, пропуск точки, сообщение в чат —
складываются в очередь (`stores/queueStore.ts`, localStorage; фото — IndexedDB)
и уходят при появлении сети по приоритету SOS → операции → помещения → пропуски
→ чат с экспоненциальной задержкой (`lib/syncQueue.ts`, offline.md §5).
Check-in/check-out в очередь не ставятся: геозону проверяет сервер.

Чего в браузере нет (цена отказа от нативных сборок): фонового GPS-трекинга,
push при закрытой странице, входа по PIN/биометрии.

## Запуск

```bash
cd frontend/web-operator
npm install --no-package-lock --no-audit --no-fund   # или pnpm 10 из корня (см. КОНТЕКСТ_КОМПАКТ, ловушки)
npm run dev        # http://localhost:5177 (strictPort), прокси на сервисы :3001–:3009
npm run typecheck  # tsc --noEmit
npm run test       # vitest (домен прогресса, разбор оборудования, помощники «Сегодня»)
npm run build      # tsc + vite build; для прода: VITE_BASE=/app/
```

`.env.local`: `VITE_API_URL=` (пусто → `/api` через прокси), `VITE_WS_URL=http://localhost:3009`
(dev-сервер Vite занимает `/socket.io` под HMR). Вход на стенде: `operator` / `oper123`.

## Прод (k3s, cleanfine.ru/app)

Образ собирается тем же `deploy/vps/Dockerfile.web`:

```bash
docker build -f deploy/vps/Dockerfile.web --build-arg APP=web-operator --build-arg VITE_BASE=/app/ -t cleaning-ops/web-operator:latest .
```

`infra/k8s/web.yaml` — Service/Deployment `web-operator`; `infra/k8s/ingress.yaml`
— IngressRoute `cleanfine-operator` (`PathPrefix(/app)` + `operator-strip`);
nginx пода — `deploy/vps/nginx-web-operator.conf` (index.html, sw.js и манифест без кэша).

## Языки интерфейса

Русский, кыргызский и узбекский (18.10.2026). Строки в коде — русские, перевод берётся по ним:
`t('Сегодня')`, с плейсхолдерами `t('Осталось {n}', { n })`. Словари общие с нативным приложением —
`shared/i18n/ky.json`, `shared/i18n/uz.json`; подписи из словарей уровня модуля (статусы, типы
уведомлений) перечислены в `src/i18n/staticKeys.ts`. Проверка полноты: `node scripts/i18n/sync.mjs --check`.
Язык выбирается на экране входа и в профиле, хранится в `localStorage` (`cleanfine-operator-lang`),
по умолчанию — язык браузера. Данные с сервера (названия операций, помещений, тексты уведомлений)
не переводятся.
