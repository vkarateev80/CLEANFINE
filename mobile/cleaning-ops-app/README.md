# cleaning_ops_app — мобильное приложение оператора

Flutter-приложение CLEANFINE (М6). Документация, стек, адреса сервисов и команды —
в [`../README.md`](../README.md); спецификации экранов — `design/screens/mobile/**` (DS-002).

```powershell
flutter pub get
flutter analyze
flutter test
```

Состояние: каркас М6.0 — тема из дизайн-токенов (`lib/core/theme`), роутер с guard'ом
авторизации (`lib/router/app_router.dart`), таб-бар и кнопка SOS (`lib/shared/widgets/app_shell.dart`),
контракты ядра — `ApiClient`, `SecureStorageService`, `Validators`, `SessionController`.
Экраны фич реализуются задачами М6.1–М6.8; заготовки помечены комментарием с номером задачи.
