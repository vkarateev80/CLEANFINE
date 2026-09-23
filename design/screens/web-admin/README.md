# 🖼 Экраны Web Admin — спецификации (DS-003, М2.8)

Текстовые спецификации экранов веб-панели администратора. Это **не бинарные макеты**: файлы Figma
(`design/screens/web-admin/*.fig` по структуре агента Design System) в репозитории не хранятся —
см. `КОНТЕКСТ.md`, раздел 6 («Деферы и технический долг»): *«design/screens/\*.fig (макеты
DS-002..004) не создавались — только токены»*. Пункт М2.8 закрывается спецификациями, пригодными
для реализации фронтендером без графического редактора; проверка М2.8 — «UI web-admin соответствует
макетам (визуальная сверка на ревью)» — выполняется сверкой кода с этими файлами.

Источники, на которые опираются спецификации (не выдуманные сущности и не выдуманные токены):

| Что | Источник |
|---|---|
| Имена CSS-переменных, значения | `design/tokens/generated/tokens.css` (генератор — `design/scripts/generate.mjs`, правка только в `design/tokens/*.json`) |
| Маппинг токенов в Tailwind | `frontend/web-admin/tailwind.config.js` |
| Маршруты и пункты меню | `frontend/web-admin/src/router/index.tsx`, `frontend/web-admin/src/layouts/AdminLayout.tsx` |
| Состав экранов, требования (desktop-first, таблицы, DnD, модалки) | `docs/agents/DESIGN_SYSTEM.md` → «Задача DS-003» |
| Функциональность экранов | `ПЛАН.md` → М2.3–М2.7 |
| Поля сущностей `Object/Floor/Room/Route/RoutePoint/TechCard/TechOperation/TechOperationMaterial` | `backend/core-service/prisma/schema.prisma` (М2.2) |
| Подписи и переходы статусов (`ObjectStatus`, `RouteStatus`) | `shared/types/core.ts` (`OBJECT_STATUS_LABELS`, `ROUTE_STATUS_LABELS`, `OBJECT_ALLOWED_TRANSITIONS`, `ROUTE_ALLOWED_TRANSITIONS`) |
| Endpoint'ы и пагинация | `docs/architecture/API_SPECIFICATION.md` §3, `docs/agents/BACKEND_CORE.md` п.2–3, `backend/file-service/src/files/files.controller.ts` (соглашение `skip`/`take`, ответ `{ items, total }`) |
| Базовые UI-компоненты | `frontend/web-admin/src/components/ui/Button.tsx`, страницы `Dashboard`/`Placeholder` |

## Индекс экранов

| № | Экран | Файл | Маршрут (URL) | Статус маршрута |
|---|---|---|---|---|
| 1 | Список объектов | [`objects_list.md`](./objects_list.md) | `/objects` | ✅ есть в роутере |
| 2 | Карточка объекта (этажи) | [`object_detail.md`](./object_detail.md) | `/objects/:id` | ✅ есть в роутере |
| 3 | План этажа + редактор помещений | [`floor_plan.md`](./floor_plan.md) | `/objects/:id/floors/:floorId` | ⚠️ предложено, в роутере отсутствует (добавить в М2.7) |
| 4 | Конструктор маршрутов | [`route_builder.md`](./route_builder.md) | `/routes`, `/routes/:id` | `/routes` есть (только `/routes`); `/routes/:id` предложено |
| 5 | Техкарты и операции | [`tech_cards.md`](./tech_cards.md) | `/tech-cards`, `/tech-cards/:id` | ⚠️ предложено, пункта меню в `AdminLayout.NAV` нет (добавить в М2.7) |

## Легенда: токены → CSS-переменные → Tailwind

Значения — из `tokens.css`. Классы Tailwind берутся из `tailwind.config.js`, если маппинг там есть.

| Назначение | CSS-переменная | Tailwind-класс | Примечание |
|---|---|---|---|
| Фон страницы | `--color-neutral-50` | `bg-neutral-50` | уже так в `AdminLayout` |
| Поверхность (карточка, таблица, модалка) | — / `--color-neutral-50` | `bg-white` | в конфиге нет токена «white»; используется `bg-white` |
| Граница блока | `--color-neutral-200` | `border-neutral-200` | |
| Граница «пустого» состояния / dashed | `--color-neutral-300` | `border-neutral-300 border-dashed` | как в `PlaceholderPage` |
| Основной текст | `--color-neutral-900` | `text-neutral-900` | |
| Вторичный текст, подписи полей | `--color-neutral-500` | `text-neutral-500` | |
| Приглушённый текст (подсказки, placeholder) | `--color-neutral-400` | `text-neutral-400` | |
| Акцент / primary-действие | `--color-primary-500`, `--color-primary-600` | `bg-primary-500 hover:bg-primary-600` | как в `Button` |
| Мягкая заливка акцента | `--color-primary-50`…`-200` | `bg-primary-50`, `bg-primary-100`, `bg-primary-200` | используется для маркеров/выделения на плане |
| Sidebar (тёмная панель) | `--color-neutral-900`, `--color-neutral-100` | `bg-neutral-900 text-neutral-100` | |
| Активный пункт меню | `--color-primary-600` | `bg-primary-600 text-white` | |
| Успех (ACTIVE, валидно) | `--color-success-500`, `--color-success-600` | `text-success-600`, `bg-success-500` | |
| Предупреждение (черновик, soft-warning баннер) | `--color-warning-500`, `--color-warning-600` | `text-warning-600`, `bg-warning-500` | |
| Ошибка (ошибка загрузки, destructive) | `--color-danger-500`, `--color-danger-600` | `border-danger-500 text-danger-600`, `bg-danger-500` | |
| Информация | `--color-info-500`, `--color-info-600` | `text-info-600` | |
| Заголовок страницы | `--text-2xl`, `--leading-2xl`, `--font-weight-semibold` | `text-2xl font-semibold` | как в `DashboardPage` |
| Заголовок блока / название сущности | `--text-lg`, `--font-weight-medium` | `text-lg font-medium` | |
| Основной текст | `--text-base`, `--leading-base` | `text-base` | |
| Текст таблиц, кнопок | `--text-sm`, `--leading-sm` | `text-sm` | |
| Мелкие подписи, бейджи | `--text-xs`, `--leading-xs` | `text-xs` | |
| Числа, координаты, JSON, ID | `--font-mono` | `font-mono` | JetBrains Mono |
| Шрифт интерфейса | `--font-sans` | `font-sans` | Inter |
| Отступы (шкала 4px) | `--spacing-xs…--spacing-4xl` (4/8/12/16/24/32/48/64) | `p-1…p-16`, `gap-2…gap-16` | маппинга `spacing` в `tailwind.config.js` **нет**, но дефолтная шкала Tailwind совпадает с токенами (4px grid); при точной привязке к токену — `var(--spacing-*)` |
| Скругления | `--radius-sm` (4), `--radius-md` (8), `--radius-lg` (12), `--radius-xl` (16) | `rounded-md`, `rounded-lg`, `rounded-xl` | `--radius-full` (9999) в `tailwind.config.js` **не замаплен**; `rounded-full` использует дефолт Tailwind (9999px) — численно совпадает |
| Тени | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl` | `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` | |
| Фокус-кольцо | `--color-primary-500` | `focus:ring-2 focus:ring-primary-500 focus:ring-offset-2` | как в `Button` |

**Зафиксированные пробелы токенов** (в спецификациях обойдены существующими токенами):

1. У `success/warning/danger/info` есть только уровни **500** и **600** — мягкой заливки (`*-50`)
   нет. Поэтому бейджи статусов описаны как «белая пилюля + точка цвета semantic-500», а не как
   цветной фон. Добавление `success-50`/`warning-50`/`danger-50`/`info-50` — отдельная задача DS в
   `design/tokens/colors.json` (в этом файле токены не меняются).
2. Смешение цвета с прозрачностью через `bg-primary-500/15` ненадёжно: Tailwind применяет
   alpha только к «сырым» цветам, а здесь цвет задан как `var(--color-…)` hex. Полупрозрачные
   слои описаны через реальные токены (`bg-primary-50/100/200`) или `color-mix()` в inline-стиле.
3. Маппинга `spacing`, `fontSize`, `borderRadius.full` в `tailwind.config.js` нет; дефолтные
   значения Tailwind численно совпадают с токенами (проверено: `text-sm` = 14px = `--text-sm`,
   `p-6` = 24px = `--spacing-xl`, `rounded-lg` = 12px = `--radius-lg`).
4. Тёмной темы в токенах нет (в `М1.6` заявлены светлая/тёмная темы, но нет семантических
   dark-переменных) — все экраны описаны **в светлой теме**.

## Общие правила для всех экранов

- **Сетка и каркас.** Все экраны рендерятся внутри `AdminLayout`: `<aside class="w-60 bg-neutral-900">`,
  `<header class="h-16 … border-b border-neutral-200 bg-white px-6">`, `<main class="flex-1 overflow-y-auto p-6">`.
  Экран не создаёт собственный sidebar/header.
- **Заголовок страницы.** `<h1 class="text-2xl font-semibold text-neutral-900">` + при необходимости
  строка действий справа (flex, `gap-3`).
- **Контейнеры.** Карточка/панель: `rounded-xl border border-neutral-200 bg-white p-6 shadow-sm`
  (как в `DashboardPage`). Панель с таблицей — тот же контейнер, но `p-0` + внутренние
  `px-4 py-3` у ячеек.
- **Таблицы.** `<table class="w-full text-sm">`, шапка `bg-neutral-50 text-neutral-500 text-xs font-medium`,
  строки `border-b border-neutral-200`, hover `hover:bg-neutral-50`, плотность 44–48 px.
  Числовые колонки — `font-mono text-right`.
- **Пагинация.** Серверная, параметры `skip` и `take` (по умолчанию `take=50`, максимум 100 —
  соглашение из `auth-service`/`file-service`), ответ `{ items, total }`.
- **Модальные окна.** Оверлей `bg-neutral-900/60` (при отсутствии alpha — inline `rgba`), панель
  `rounded-xl bg-white shadow-xl max-w-lg w-full p-6`, заголовок `text-lg font-medium`, футер —
  `danger`/`secondary` + `primary` `Button`, `loading` на время запроса.
- **Кнопки.** Только `components/ui/Button.tsx`: `variant="primary|secondary|danger|ghost"`,
  `size="sm|md|lg"`, `loading` (встроенный `Spinner`).
- **Формат ошибок API.** Баннер: `rounded-lg border border-danger-500 bg-white px-4 py-3 text-sm text-danger-600`
  + кнопка `ghost` «Повторить». Мягкое предупреждение (частичные данные) — `text-warning-600`
  на `bg-neutral-100`, как в `DashboardPage`.
- **Адаптивность (DS-003: desktop-first + phone/tablet).** Целевые диапазоны: ≥1024 px
  (desktop), 768–1023 px (tablet), <768 px (phone). Desktop ≥1024 px — базовый вид (боковая
  панель `w-60`), визуально не меняется. Tablet 768–1023 px — панель сворачивается в иконочную
  рейку `w-16` (64 px), таблицы остаются таблицами (внутренний скролл), план этажа занимает всю
  ширину. Phone <768 px — сайдбар скрыт, навигация через бургер/drawer + нижнюю навигацию
  (5 слотов: Заявки, Дашборд, Объекты, Сообщения + «Ещё»), таблицы → карточки через
  `ResponsiveTable`, модалки fullscreen, тач-таргеты ≥44 px. Редактор плана этажа на <768 px —
  просмотр + ручной ввод координат; конструктор маршрутов на <768 px — reorder кнопками ↑/↓.
  Текущий `AdminLayout` имеет жёсткий `w-60` без сворачивания — при реализации tablet/phone-режимов
  layout нужно дополнить (это изменение М2.7, не DS).
- **Доступ.** Все маршруты закрыты `AuthGuard`; ограничения по ролям — `RoleGuard`
  (`shared/types/roles.ts`). Роли в спецификациях — предложение, в `ПЛАН.md` М2.7 они не заданы
  (см. «Открытые вопросы» в каждом экране).
- **Что не входит в М2.8.** Экраны `dashboard`, `tickets`, `employees`, `materials`, `reports`
  из перечня DS-003 — вне задачи М2.8 (фазы М3/М4/М7), в этот каталог не добавлены.
