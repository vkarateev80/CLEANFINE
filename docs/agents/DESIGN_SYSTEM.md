<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: DESIGN SYSTEM
# 🤖 АГЕНТ: DESIGN SYSTEM

## 📋 Профиль агента

**Роль:** Design Lead  
**Ответственность:** Создание дизайн-системы, UI/UX для всех платформ  
**Рабочая директория:** `design/`  
**Отчетность:** Главный агент (Orchestrator)

---

## 🎯 Цели

1. Создать единую дизайн-систему для всех платформ
2. Разработать UI для мобильного приложения (толстый клиент)
3. Разработать UI для веб-панели администратора
4. Разработать UI для портала клиента (тонкий клиент)
5. Обеспечить консистентность дизайна

---

## 📁 Структура рабочей директории
design/
├── tokens/
│ ├── colors.json # Цветовая палитра
│ ├── typography.json # Типографика
│ ├── spacing.json # Отступы
│ ├── shadows.json # Тени
│ └── borderRadius.json # Скругления
├── components/
│ ├── figma/ # Figma компоненты
│ ├── storybook/ # Storybook компоненты
│ └── docs/ # Документация
├── screens/
│ ├── mobile/ # Мобильные экраны
│ ├── web-admin/ # Админ-панель
│ └── web-client/ # Портал клиента
├── prototypes/
│ ├── mobile.fig # Прототип мобильного
│ ├── admin.fig # Прототип админки
│ └── client.fig # Прототип портала
└── assets/
├── icons/ # Иконки
├── illustrations/ # Иллюстрации
└── logos/ # Логотипы

text

---

## 📝 Дизайн-токены

### Цветовая палитра

```json
{
  "colors": {
    "primary": {
      "50": "#EBF5FF",
      "100": "#D6EBFF",
      "200": "#ADD6FF",
      "300": "#85C2FF",
      "400": "#5CADFF",
      "500": "#3399FF",
      "600": "#1A80E6",
      "700": "#1466B8",
      "800": "#0F4D8A",
      "900": "#0A335C"
    },
    "success": {
      "500": "#22C55E",
      "600": "#16A34A"
    },
    "warning": {
      "500": "#F59E0B",
      "600": "#D97706"
    },
    "danger": {
      "500": "#EF4444",
      "600": "#DC2626"
    },
    "info": {
      "500": "#3B82F6",
      "600": "#2563EB"
    },
    "neutral": {
      "50": "#F9FAFB",
      "100": "#F3F4F6",
      "200": "#E5E7EB",
      "300": "#D1D5DB",
      "400": "#9CA3AF",
      "500": "#6B7280",
      "600": "#4B5563",
      "700": "#374151",
      "800": "#1F2937",
      "900": "#111827"
    }
  }
}
Типографика
json
{
  "typography": {
    "fontFamily": {
      "sans": "Inter",
      "mono": "JetBrains Mono"
    },
    "sizes": {
      "xs": "12px",
      "sm": "14px",
      "base": "16px",
      "lg": "18px",
      "xl": "20px",
      "2xl": "24px",
      "3xl": "30px",
      "4xl": "36px"
    },
    "weights": {
      "regular": 400,
      "medium": 500,
      "semibold": 600,
      "bold": 700
    }
  }
}
📋 Задачи
Задача DS-001: Создание дизайн-токенов
Файл: design/tokens/

Инструкции:

Создать colors.json с полной палитрой

Создать typography.json со всеми размерами

Создать spacing.json (4px base grid)

Создать shadows.json (4 уровня)

Создать borderRadius.json (4 уровня)

Экспортировать в CSS-переменные и Flutter ThemeData

Acceptance Criteria:

□ Все токены в JSON формате
□ CSS-переменные сгенерированы
□ Flutter ThemeData сгенерирована
□ Документация по использованию
Задача DS-002: Мобильные экраны (Толстый клиент)
Файл: design/screens/mobile/

Экраны:

auth_login.fig — Экран логина

auth_pin.fig — PIN-код

home_today.fig — Главный экран

route_map.fig — Маршрутная карта

checklist.fig — Чек-лист операций

sos_emergency.fig — Аварийная заявка

chat.fig — Чат

profile.fig — Профиль

Требования:

Адаптация под iOS и Android

Оффлайн-режим (индикаторы)

Темная тема

Accessibility (контраст, размеры)

Задача DS-003: Веб-панель администратора
Файл: design/screens/web-admin/

Экраны:

dashboard.fig — Дашборд

objects_list.fig — Список объектов

object_detail.fig — Детали объекта

floor_plan.fig — План этажа

route_builder.fig — Конструктор маршрутов

tech_cards.fig — Техкарты

tickets.fig — Заявки

employees.fig — Сотрудники

materials.fig — Материалы

reports.fig — Отчеты

Требования:

Desktop-first с адаптивом до телефона: целевые диапазоны ≥1024 px (desktop), 768–1023 px
(tablet), <768 px (phone). Списки на <768 px рендерятся карточками; редактор плана этажа
на <768 px — просмотр + ручной ввод координат; конструктор маршрутов на <768 px — reorder
кнопками ↑/↓

Таблицы с большими данными

Drag-and-drop интерфейсы

Модальные окна и drawers

Задача DS-004: Портал клиента (Тонкий клиент)
Файл: design/screens/web-client/

Экраны:

dashboard.fig — Статус объекта

tickets.fig — Создание заявки

reports.fig — Отчеты

chat.fig — Чат с менеджером

Требования:

Упрощенный интерфейс

Только свой объект

Мобильная адаптация

Branding клиента
