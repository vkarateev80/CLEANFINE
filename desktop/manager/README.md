# CLEANFINE Менеджер — десктоп (macOS / Windows)

Нативное окно над веб-админкой https://cleanfine.ru на Electron. Решение
владельца 08.10.2026: вся функциональность админки нужна менеджеру на
компьютере сразу, и переписывать её на Flutter (30 тыс. строк) не имеет смысла.
Flutter-сборки macOS/Windows остаются продуктом «Команда» (доска действий +
портал, см. `docs/APP_PRODUCTS.md`).

Что даёт обёртка: своё приложение с иконкой в Dock/панели задач, сохранение
входа между запусками, внешние ссылки в системном браузере, русское меню
(админ-панель `⌘1`, портал заказчика `⌘2`, выход из учётной записи,
перезагрузка, масштаб).

## Сборка

```bash
cd desktop/manager
npm install                 # electron + electron-builder (не pnpm-workspace: папка автономна)
npm start                   # запуск с прода
npm run start:local         # локальный стенд (http://localhost:5175)
npm run dist:mac            # dist/CLEANFINE-Manager-1.0.0-mac-{arm64,x64}.{dmg,zip}
npm run dist:win            # dist/CLEANFINE-Manager-1.0.0-win-x64.exe (NSIS) + zip
```

Windows-установщик собирается на Mac без Windows-машины и без Wine
(проверено 08.10.2026: `npm run dist:win` → NSIS-установщик 82 МБ + zip).
Подписи кода нет (SmartScreen предупредит при первом запуске) — для подписи
нужен сертификат code signing.

macOS-сборка без подписи (`identity: null`): при первом запуске — правый клик
→ «Открыть», либо `xattr -dr com.apple.quarantine "/Applications/CLEANFINE Менеджер.app"`.
Для нотаризации нужен Apple Developer ID.

## Параметры

| Переменная | Значение |
|---|---|
| `CLEANFINE_URL` | адрес сервера, по умолчанию `https://cleanfine.ru` |
| `CLEANFINE_AUTOLOGIN` | `email:пароль` — автовход через `/login?email=…&password=…` (только личные сборки) |

Иконки — `build/icon.{icns,ico,png}` из `design/brand/app-icon-1024.png`.
