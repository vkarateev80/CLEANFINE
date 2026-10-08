# Продукты CLEANFINE: три приложения из одного кода

> Введено 08.10.2026. Решения владельца: отдельное мобильное для операторов;
> отдельное мобильное для бригадира, менеджера и заказчика; десктоп менеджера
> (macOS/Windows) — обёртка над веб-админкой. Порядок: рефактор → «Оператор»
> → «Команда» → десктоп.

## Почему не три репозитория и не три пакета

Граф модулей `mobile/cleaning-ops-app` цикличен (`shared ↔ router ↔ features`,
`services → chat/profile`): выносить общие пакеты — многодневная перекладка
с риском сломать 260 тестов. Вместо этого один Dart-код собирается в разные
приложения через **продукт** (`lib/core/app_product.dart`) + **flavors**:
у каждого продукта свои имя, `applicationId`/bundle id, иконка, точка входа,
вкладки и допустимые роли. Для пользователя это отдельные приложения в
сторе и на телефоне; для разработки — один код и одни тесты.

| Продукт | Точка входа | Роли | Вкладки | Что внутри |
|---|---|---|---|---|
| **Оператор** `operator` | `lib/main.dart` = `lib/main_operator.dart` | OPERATOR, SUPERVISOR, ADMIN | Сегодня · Чаты · Профиль (+ SOS) | смены, маршрут, чек-листы, SOS, оффлайн, GPS-трекинг |
| **Команда** `team` | `lib/main_team.dart` | SUPERVISOR, ADMIN, CLIENT | Доска (staff) / Объект (client) · Чаты · Профиль | доска действий; портал заказчика (пока заглушка, разделы переносятся из `web-client`) |

Продукт выбирается точкой входа (переопределение `appProductProvider`) или
`--dart-define=APP_PRODUCT=operator|team` (десктоп, лончеры, тесты).

## Что решает продукт (`ProductConfig`)

- `allowedRoles` — проверка при входе в `AuthRepository`: чужая роль гасит
  сессию и показывает, каким приложением пользоваться.
- `startRouteFor(role)` — куда вести после входа (`/today`, `/admin`, `/client`).
- `tabsFor(role)` — вкладки каркаса; `hasOperatorFeatures` включает SOS, GPS
  и операторские маршруты (в «Команде» они даже не регистрируются в роутере,
  а переход на чужой путь уводит на стартовый).

## Сборка

```bash
cd mobile/cleaning-ops-app
# Android — flavor обязателен (иначе Gradle не найдёт задачу)
flutter build apk --release --flavor operator -t lib/main_operator.dart $DEFINES
flutter build apk --release --flavor team     -t lib/main_team.dart     $DEFINES
# iOS — схем-flavor'ов пока нет: оператор собирается как раньше (bundle
# com.cleaningops.cleaningOpsApp); для «Команды» нужны Xcode-конфигурации
# Debug-team/Release-team с bundle com.cleaningops.team (следующий шаг).
flutter build ipa --release $DEFINES
# macOS / Windows — продукт через define (flavor'ы на десктопе не нужны)
flutter build macos --release --dart-define=APP_PRODUCT=team $DEFINES
```

`$DEFINES` — девять `--dart-define=API_<SVC>_URL=https://cleanfine.ru`
(см. `КОНТЕКСТ_КОМПАКТ.md` §5). Лончеры `scripts/launchers/Cleaning-Ops-Android-*`
уже передают `--flavor operator`.

Android: `applicationId` оператора остался историческим
(`com.cleaningops.cleaning_ops_app`) — установленные приложения обновляются;
«Команда» — `com.cleaningops.team`. Имя берётся из `resValue app_name`.

## Десктоп менеджера

По решению владельца — не Flutter, а обёртка над веб-админкой cleanfine.ru
(Tauri/Electron, обе ОС). Делается после «Команды». Flutter-сборки macOS
(`CLEANFINE.app`) и Windows (workflow `windows-build.yml`) остаются как
сборки продукта `team` для бригадира/менеджера.

## Дальше

1. «Команда»: перенос портала заказчика (статус объекта, заявки, отчёты) из
   `frontend/web-client` на Flutter; иконка-вариант; iOS-конфигурации `team`.
2. Пуши: `pushRoute` в «Команде» не должен вести на операторские экраны.
3. Десктоп-обёртка.
