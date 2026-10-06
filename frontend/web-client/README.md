# 📱 Web Client — портал заказчика (М5.4)

Тонкий мобильный клиент CLEANFINE: клиент видит статус **своего** объекта,
создаёт заявки, смотрит отчёты по расходу и переписывается с менеджером.
Второе React-приложение монорепо (первое — `frontend/web-admin`).

Источник требований: `ПЛАН.md` → М5.4; экраны — `design/screens/web-client/**`
(DS-004, М5.5); критерии приёмки — `docs/agents/FRONTEND_WEB.md` → «Web Client».

## Запуск

```powershell
# из frontend/web-client; pnpm в этом окружении сломан — ставим через npm-CLI
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --no-package-lock --no-audit --no-fund --registry=https://registry.npmmirror.com

node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev        # http://localhost:5174 (strictPort)
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck  # tsc --noEmit, 0 ошибок
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build      # tsc + vite build
```

Перед запуском должны быть подняты сервисы стенда: auth `:3001`, core `:3003`,
tickets `:3005`, notifications `:3006`, materials `:3007`, schedule `:3008`,
chat `:3009`. REST ходит через dev-прокси Vite (`/api/auth`, `/api/users`,
`/api/objects`, `/api/tickets`, `/api/notifications`, `/api/materials`,
`/api/schedule`, `/api/chat`).

Вход: `client` / `client123` (роль `CLIENT`, см. `test/fixtures/users.json`).

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `VITE_API_URL` | нет | База REST. Пусто → относительный `/api` (dev-прокси Vite; в прод — reverse-proxy). |
| `VITE_WS_URL` | **да в dev** | Адрес chat-service для socket.io: `http://localhost:3009`. Почему не через прокси — см. «Ограничения». Пусто → тот же origin (прод). |
| `VITE_MANAGER_USER_ID` | да (для чата) | UUID сотрудника, с которым портал открывает DIRECT-чат. Справочник `/api/users` закрыт для роли `CLIENT` (`403`), поэтому id приходит конфигурацией. |

Значения стенда лежат в `.env.local` (в git не коммитится — секретов там нет, но
локальные адреса у каждого свои).

## Что реализовано

| Маршрут | Экран | Данные |
|---|---|---|
| `/login` | Вход, роль `CLIENT`, отказ остальным ролям | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| `/dashboard` | Паспорт объекта, KPI (открытые заявки, выполнено за 30 дней, ближайшая смена, непрочитанные), ближайшие смены, последние заявки | `GET /objects/:id`, `/objects/:id/detail`, `/tickets`, `/schedule/events`, `/chat/chats` |
| `/tickets` | Список заявок с фильтр-чипами и догрузкой «Показать ещё» + шторка «Новая заявка» | `GET /tickets?objectId=&status=&take=`, `POST /tickets` |
| `/tickets/:id` | Карточка заявки: описание, ход работы, переписка, комментарий | `GET /tickets/:id`, `POST /tickets/:id/comments` |
| `/reports` | Табы «Сводка / Уборки / Материалы», период с проверкой границ, CSV | `GET /materials/report`, `/materials/stocks`, `/tickets`, `/schedule/events` |
| `/chat` | DIRECT-переписка с менеджером в реальном времени | `GET /chat/chats`, `/chat/chats/:id/messages`, WS `message:send` / `message:read` |

Каркас `ClientLayout`: header с `{clientName} · {objectName}`, нижний таб-бар из
четырёх пунктов (на `≥1024 px` он скрыт, пункты переезжают в header), safe-area
через `env(safe-area-inset-bottom)`. Таб-бар скрывается при открытой клавиатуре
(`visualViewport`), чтобы не перекрывать поле ввода.

Портал **не** содержит мутаций, кроме `POST /api/tickets` и комментария: смена
статуса, назначение исполнителя, аварийная заявка (SOS), а также любые операции
с объектом, материалами и сотрудниками отсутствуют — кнопок нет вовсе, а не
`disabled`.

Переиспользовано копированием из `web-admin` (в монорепо нет пакета `@cleaning-ops/ui`):
`components/ui/**`, `api/client.ts` (refresh с single-flight), `api/config.ts`,
`stores/authStore.ts`, `types/**`, `hooks/useDebouncedValue.ts`. Новые компоненты
портала: `ClientLayout`, `BottomSheet`-форма заявки, лента сообщений, KPI-плитка,
`ScopeGate` и экраны состояний доступа.

## Ограничения (важные)

1. **У пользователя нет привязки к объекту.** В `model User` (auth-service) нет
   полей `objectId`/`clientId`, а `GET /api/objects` не фильтрует объекты по роли.
   Портал определяет «свой объект» эвристикой по `Object.clientName`: сравнивает
   его с ФИО и email пользователя из `/auth/me` (точное совпадение, затем
   вхождение подстроки; при нескольких кандидатах берётся минимальный `id`,
   чтобы результат не «плавал» от порядка ответа API). Реализация —
   `src/hooks/useObjectScope.ts`.
   *Последствие:* если в `clientName` записано не название организации клиента
   или у двух заказчиков совпадают имена, привязка будет неверной. Это **не**
   замена серверному scope — правильное решение — поле в auth-service или таблица
   `client_objects` (открытый вопрос `overview.md` п. 10.1).
2. **Backend не ограничивает выборку по роли.** `GET /api/tickets` не имеет
   `@Roles` и не фильтрует заявки по клиенту: сервер отдаёт заявки любого
   объекта, если запросить их с чужим `objectId`. Портал всегда передаёт
   `objectId` из сессии и не берёт его из формы, но данные защищены только
   интерфейсом (дефект бэкенда, а не портала).
3. **`objectId` в URL не расширяет доступ.** Значение из query-строки не может
   стать «своим» объектом: несовпадение с определённым объектом даёт отдельный
   экран «Нет доступа к объекту» (`data-testid="portal-forbidden"`), без кнопки
   «Повторить» — повтор не изменит ответ.
4. **Роль `ADMIN` допущена только для отладки.** Админ не проходит сопоставление
   по `clientName`, поэтому видит портал лишь при явном выборе объекта:
   `?debugObjectId=<uuid>` (в header появляется метка «отладка»). Без параметра
   админ получает экран «Объект не подключён». Вариант «ADMIN видит всё» отклонён:
   портал показывает данные одного заказчика, и режим «все объекты» противоречил
   бы смыслу роли `CLIENT`, а `OPERATOR`/`SUPERVISOR` не пускаются вовсе.
5. **WebSocket в dev идёт напрямую в chat-service.** Dev-сервер Vite занимает
   путь `/socket.io` под собственный HMR-канал, поэтому WS-шлюз не проксируется
   (`/socket.io/?EIO=4` через `:5174` отдаёт `index.html` SPA-фолбэка, а не
   engine.io-хендшейк). Отсюда `VITE_WS_URL=http://localhost:3009` в dev; в
   прод-сборке переменную не задают — там WebSocket-upgrade делает reverse-proxy.
6. **Кто такой «менеджер»** — правила в контракте нет (`chat.md` п. 10.1).
   Портал открывает самый свежий существующий DIRECT-чат, а если его нет —
   создаёт чат с сотрудником из `VITE_MANAGER_USER_ID`. Несколько переписок
   показываются переключателем (истории разных менеджеров не сливаются).
7. **Отчёты частично агрегируются на клиенте.** `GET /api/tickets` не принимает
   `from`/`to` (предел — 500 заявок, о неполноте сообщает `SoftWarning`), а
   `GET /api/schedule/events` принимает один `date`, поэтому смены периода
   собираются запросом на каждый день. Серверный агрегат есть только у
   материалов (`GET /api/materials/report`).
8. **Справочник `/api/users` закрыт для `CLIENT`** (403): ФИО исполнителя и
   менеджера портал не показывает, только факт «исполнитель назначен». Контакт
   менеджера для `tel:`-ссылки взять негде.
9. **Заявки: номер, приоритет и SOS.** Человекочитаемого номера в схеме нет —
   показываются первые 8 символов UUID. Приоритет клиент не задаёт (внутренняя
   договорённость диспетчера). Аварийная заявка недоступна: `EmergencyTicketPayload`
   требует координат оператора на месте, ложный SOS поднимает всех ближайших.
10. **Токены портала не расширялись.** Используются только переменные
    `design/tokens/generated/tokens.css` и маппинг `tailwind.config.js`,
    скопированный из админки; `design/tokens/**` портал не меняет.

## Проверка

- `typecheck` — 0 ошибок, `vite build` — успешно.
- Живой прогон Playwright (временная спека `test/e2e/web/m54-portal.ui.spec.ts`,
  мобильный контекст iPhone 13): вход клиентом → `/dashboard` со своим объектом;
  попытка открыть чужой объект (`?objectId=`) → экран отказа; создание заявки →
  появление в списке; `/reports` → таб «Материалы»; `/chat` → статус «онлайн» и
  отправленное сообщение в ленте; `ADMIN` без отладочного параметра не получает
  чужой объект. Данные прогона удаляются.
