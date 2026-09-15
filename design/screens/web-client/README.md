# 🖼 Экраны Web Client (портал заказчика) — спецификации (DS-004, М5.5)

Текстовые спецификации экранов портала заказчика (`frontend/web-client`, задача **М5.4**).
Это **не бинарные макеты**: файлы Figma (`design/screens/web-client/*.fig`, перечень — `docs/agents/DESIGN_SYSTEM.md`
→ «Задача DS-004») в репозиторий не кладутся — см. `КОНТЕКСТ.md`, раздел 6 («Деферы и технический
долг»): *«design/screens/\*.fig (макеты DS-002..004) не создавались — только токены и текстовые
спецификации»*. Пункт М5.5 закрывается этим каталогом: спецификации пригодны для реализации
фронтендером без графического редактора, проверка М5.5 («визуальная сверка UI портала с макетами»)
выполняется сверкой кода с этими файлами — тот же приём, что и у DS-003
([`../web-admin/README.md`](../web-admin/README.md)).

Источники, на которые опираются спецификации (никаких выдуманных сущностей и токенов):

| Что | Источник |
|---|---|
| Имена CSS-переменных и значения | `design/tokens/generated/tokens.css` (генератор `design/scripts/generate.mjs`; правка — только в `design/tokens/*.json`) |
| Маппинг токенов в Tailwind | `frontend/web-admin/tailwind.config.js` (портал копирует его как есть) |
| Состав экранов и требования (упрощённый интерфейс, мобильная адаптация, branding) | `docs/agents/DESIGN_SYSTEM.md` → «Задача DS-004» |
| Функциональность портала, роль CLIENT, scope по объекту | `ПЛАН.md` → М5.4 (и М5.5) |
| Критерии приёмки портала | `docs/agents/FRONTEND_WEB.md` → «✅ Acceptance Criteria (Web Client)» |
| Подписи статусов заявки/приоритетов/типов | `frontend/web-admin/src/types/tickets.ts` (`TICKET_STATUS_LABELS`, `TICKET_PRIORITY_LABELS`, `TICKET_TYPE_LABELS`), словари переходов — `@cleaning-ops/shared/types/tickets` |
| Подписи статуса объекта | `shared/types/core.ts` (`OBJECT_STATUS_LABELS`) через `frontend/web-admin/src/types/status.ts` |
| Поля `Object`/`Floor`/`Room` | `backend/core-service/prisma/schema.prisma` |
| Поля `Ticket`/`TicketComment` | `backend/ticket-service/prisma/schema.prisma`, `frontend/web-admin/src/types/tickets.ts` |
| Endpoint'ы и пагинация | `docs/architecture/API_SPECIFICATION.md`, `frontend/web-admin/src/api/*.ts` (`skip`/`take`, `take` ≤ 100, ответ `{ items, total }`) |
| Работа в реальном времени (чат) | `docs/agents/FRONTEND_WEB.md` (раздел про `useWebSocket`), `docs/agents/BACKEND_CHAT.md` (namespace `chat`, `message:send`/`message:read`) |
| Переиспользуемые компоненты и api-слой | `frontend/web-admin/src/components/ui/**`, `frontend/web-admin/src/api/**` (см. п. «Что переиспользуется» в [`overview.md`](./overview.md)) |

> **Статус реализации.** Каталога `frontend/web-client/` ещё нет (М5.4 не начата), backend
> chat-service (`backend/chat-service/`) тоже не создан — в `backend/` сейчас 8 сервисов без chat.
> Поэтому контракты чата в [`chat.md`](./chat.md) описаны по `BACKEND_CHAT.md`/`FRONTEND_WEB.md`
> **как ожидаемые**, а не как уже существующие endpoint'ы. Источник истины при реализации —
> Swagger chat-service после М5.1/М5.2; расхождение с этими спецификациями правится здесь же.

## Индекс экранов

| № | Экран | Файл | Маршрут (URL) | Статус маршрута (М5.4) |
|---|---|---|---|---|
| 0 | Обзор портала (токены, каркас, доступ) | [`overview.md`](./overview.md) | — | — |
| 1 | Статус объекта (главная) | [`dashboard.md`](./dashboard.md) | `/dashboard` | ⚠️ предложено, роутера ещё нет (М5.4) |
| 2 | Заявки: список и создание | [`tickets.md`](./tickets.md) | `/tickets`, `/tickets/:id` | ⚠️ предложено; `/tickets/:id` в М5.4 не заявлен, нужен для статуса своей заявки (открытый вопрос) |
| 3 | Отчёты по объекту | [`reports.md`](./reports.md) | `/reports` | ⚠️ предложено |
| 4 | Чат с менеджером | [`chat.md`](./chat.md) | `/chat` | ⚠️ предложено; зависит от М5.1 (chat-service) |
| 5 | Вход | [`login.md`](./login.md) | `/login` | ⚠️ предложено; в DS-004 экрана входа нет, но М5.4 его требует («вход») |

Экраны `dashboard`, `tickets`, `reports`, `chat` — ровно те четыре, что перечислены в DS-004;
`login.md` добавлен потому, что `ПЛАН.md` М5.4 называет вход частью задачи портала, а «вход» без
спецификации оставлял бы неописанным первый же экран. `overview.md` — не экран, а общий раздел
(токены, каркас, правила адаптации, доступ), аналог разделов «Легенда» и «Общие правила» в
[`../web-admin/README.md`](../web-admin/README.md).

## Чем портал отличается от админки (кратко, подробно — в [`overview.md`](./overview.md))

| Аспект | Web Admin (DS-003) | Web Client (DS-004) |
|---|---|---|
| Целевое устройство | Desktop-first, адаптив до tablet (`≥1280 px` база) | **Mobile-first**: телефон `360–430 px` — основной сценарий |
| Каркас | `AdminLayout`: тёмный sidebar `w-60` + header `h-16` | `ClientLayout`: header с названием объекта + **нижний таб-бар** (4 пункта) |
| Роль | ADMIN/SUPERVISOR/OPERATOR (CLIENT только чтение) | **только CLIENT**; все остальные роли — редирект на `/login` |
| Область данных | все объекты и заявки | **один объект клиента**; чужие данные → 403 |
| Объём действий | полный CRUD | создать заявку, читать статус, читать отчёты, писать в чат |
| Плотность | таблицы, DnD, drawers, модалки | карточки, один столбец, «шторки» (bottom sheets) |
| Тема | светлая | светлая (тёмной темы в токенах нет — см. п. 4 пробелов) |

## Токены: портал ничего не добавляет в `design/tokens/**`

Новые токены в задаче М5.5 **не вводятся** (правка `design/tokens/*.json` — отдельная задача DS
с перегенерацией `tokens.css` и `app_tokens.dart`). Все экраны портала собраны из существующих
переменных. Полная легенда «токен → CSS-переменная → Tailwind» — в
[`../web-admin/README.md`](../web-admin/README.md) (раздел «Легенда»); здесь только то, что
существенно для мобильного портала:

| Назначение | CSS-переменная | Tailwind | Примечание |
|---|---|---|---|
| Фон страницы | `--color-neutral-50` | `bg-neutral-50` | совпадает с админкой |
| Поверхность (карточка, таб-бар, лист) | — | `bg-white` | токена «white» нет; в админке так же |
| Границы | `--color-neutral-200` | `border-neutral-200` | |
| Основной текст | `--color-neutral-900` | `text-neutral-900` | |
| Вторичный текст | `--color-neutral-500` | `text-neutral-500` | |
| Акцент / primary-действие | `--color-primary-500`, `--color-primary-600` | `bg-primary-500 hover:bg-primary-600` | |
| Мягкая заливка акцента | `--color-primary-50`, `--color-primary-100` | `bg-primary-50`, `bg-primary-100` | используется для активного таба и KPI-подложек |
| Статусы | `--color-success-500/600`, `--color-warning-500/600`, `--color-danger-500/600`, `--color-info-500/600` | `Badge tone="…"` | **только 500/600**: мягких `*-50` нет (см. ниже) |
| Заголовок страницы / объекта | `--text-xl`/`--text-2xl`, `--font-weight-semibold` | `text-xl font-semibold sm:text-2xl` | на телефоне `text-xl`, на планшете `text-2xl` |
| Текст, подписи, бейджи | `--text-sm`, `--text-xs` | `text-sm`, `text-xs` | |
| Числа, даты, суммы | `--font-mono` | `font-mono` | JetBrains Mono |
| Отступы (4px-сетка) | `--spacing-sm…--spacing-xl` (8/12/16/24) | `gap-2/3/4/6`, `p-4/p-6` | на телефоне базовый `p-4`, а не `p-6` (как в админке) |
| Скругления | `--radius-lg`, `--radius-xl`, `--radius-full` | `rounded-lg`, `rounded-xl`, `rounded-full` | |
| Тени | `--shadow-sm`, `--shadow-lg` | `shadow-sm`, `shadow-lg` | нижний таб-бар и «шторки» — `shadow-lg` |
| Фокус-кольцо | `--color-primary-500` | `focus:ring-2 focus:ring-primary-500` | как в `Button` |

**Пробелы токенов, важные именно для портала** (в спецификациях обойдены существующими токенами;
правка токенов — отдельная задача DS):

1. **Нет мобильных размеров типографики.** Шкала `--text-*` совпадает с Tailwind, но отдельных
   mobile/desktop-значений нет: на телефоне заголовок даётся `text-xl`, на широком экране —
   `sm:text-2xl` (адаптив средствами Tailwind, без новых токенов).
2. **Нет `safe-area`-токенов.** Отступы под «чёлку» и домашний индикатор задаются CSS-функцией
   `env(safe-area-inset-bottom)` в inline-стиле или через `padding-bottom: calc(4rem + env(...))` —
   токена для этого в `tokens.css` нет (описано в [`overview.md`](./overview.md) п. 7).
3. **Нет семантики «клиентского» акцента.** Branding клиента (логотип/цвета) отложен именно
   потому, что палитра одна и переопределение `--color-primary-*` на объект потребовало бы
   генерации темы из настроек объекта — см. [`overview.md`](./overview.md) п. 8.
4. **Нет тёмной темы** (семантических dark-переменных в токенах нет) — все экраны портала описаны
   в светлой теме.
5. **Нет токена под «непрочитанное»** — счётчик непрочитанных в чате описан как `bg-primary-500`
   + `text-white` (единственная гарантированно контрастная пара в палитре).
