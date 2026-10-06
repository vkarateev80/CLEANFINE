# 📐 Код-стиль CLEANFINE

> Свод из УСТАВ.md (README → «Код-стиль», Агент Frontend Web, Агент Mobile, «Правила написания кода в Dash»). Обязателен для всех агентов.

## Общее

- Backend (NestJS/TS) и Web (React/TS): ESLint + Prettier. Конфигурация — в каждом сервисе/приложении (создаётся при его инициализации, начиная с М1).
- Mobile (Dart): `dart format` + `flutter_lints`.
- Формат Prettier (корень, `.prettierrc`): semi, singleQuote, trailingComma all, printWidth 100, tabWidth 2.
- Перед merge: формат и линтер пройдены, тесты зелёные, документация обновлена, code review пройден (чек-лист Dash-правил).

## Backend (NestJS)

- Модульная структура NestJS: controller/service/module на домен; guards/decorators/strategies — по уставу (Агент Backend Auth).
- DTO + class-validator + class-transformer на каждом входе.
- Prisma-миграции на каждое изменение схемы.

## Web (React)

- `components/ui/*` — базовые; именование страниц `XxxPage`, layout'ов `XxxLayout`.
- Состояние: Zustand (client state) + TanStack Query (server state).
- API-доступ только через `api/client.ts` (axios + refresh-интерцептор).

## Mobile (Dart, feature-first — правила Dash)

- Структура: `lib/core/`, `lib/features/<feature>/{data,domain,presentation}/`, `lib/shared/`, `lib/router/`, `lib/services/`, `lib/database/`.
- Именование: классы/виджеты PascalCase (виджеты с суффиксом: `LoginPage`, `SubmitButton`, `UserCardWidget`), методы/переменные camelCase, константы SCREAMING_SNAKE_CASE, файлы snake_case.
- State: Riverpod (`StateProvider`, `FutureProvider`, `AsyncNotifierProvider` — код в уставе).
- Ошибки: кастомные исключения (`NetworkException`, `ValidationException`) в core/errors, маппинг в репозиториях.
- БД: Drift (DAO через `DatabaseAccessor`).
- Производительность: `const`-конструкторы, `ListView.builder`, ленивые изображения, `Consumer(child:)` против перестроек дерева.
- Безопасность: токены — `FlutterSecureStorage`; чувствительные данные не логировать; валидация входов.
- Документация: doc-комментарии с `///`, описывающие методы, параметры, исключения.
