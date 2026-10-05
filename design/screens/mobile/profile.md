# 👤 Экран: Профиль (`profile`) — DS-002 (М6.8)

> DS-002 → `profile.fig`; реализация — М6.8
> (`lib/features/profile/presentation/pages/{profile_page,change_password_page}.dart`).
> Данные: auth-service (3001) — `GET /api/auth/me`, `POST /api/auth/change-pin`,
> `POST /api/auth/change-password`, `POST /api/auth/logout`; file-service (3002) — аватар;
> notification-service (3006) — устройство и настройки подписок; geolocator/gps — статус трекинга.
> Источник требований — `ПЛАН.md` М6.8: *«Профиль: ФИО, аватар (загрузка через file-service), смена
> PIN/пароля»*; М6.6: *«индикатор статуса отправки»* GPS; DS-002: оффлайн-индикаторы.

## 1. Назначение

Одно место, где оператор проверяет себя (ФИО, роль, контакты) и настраивает то, от чего зависит
работа в поле: доступ (PIN, пароль), трекинг (разрешения и статус отправки), уведомления и очередь
неотправленных данных. Здесь же — выход из аккаунта с полной очисткой локальных данных
(в том числе кэша планов и фото).

Экран не редактирует справочные данные: смена ФИО, телефона и роли — задача администратора в
админке (DS-003).

### 1.1. Точка входа в навигации

| Что | Значение |
|---|---|
| Маршрут | `/profile` (таб «Профиль») |
| Подмаршруты | `/profile/password` (`ChangePasswordPage`), `/profile/pin` → `PinPage(mode: setup)` из [`auth.md`](./auth.md), `/profile/notifications` (bottom sheet настроек), `/offline` (очередь) |
| Кто открывает | таб-бар; push «Геозона»/`GEOFENCE_EXIT` (показать статус трекинга) |
| Что открывает | `/offline` (очередь отправки), `/login` (после выхода), системные настройки приложения (разрешения) |

## 2. Схема экрана (телефон 360–430 dp)

```
┌───────────────────────────────────────────────────────────────┐
│  Профиль                                        ⚡2           │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │   ╭───────╮   Иванов Иван Иванович                      │  │  Key('profile_name_text')
│  │   │  👤   │   Оператор · operator      │  │  Key('profile_avatar_image'),
│  │   ╰───────╯   +7 999 000-00-03                         │  │  Key('profile_role_text')
│  │   [ Изменить фото ]                                     │  │  Key('profile_avatar_button')
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Доступ                                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🔑 Сменить PIN                                     ›    │  │  Key('profile_change_pin_tile')
│  ├─────────────────────────────────────────────────────────┤  │
│  │ 🔒 Сменить пароль                                  ›    │  │  Key('profile_change_password_tile')
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  GPS-трекинг                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 📍 Местоположение                    Разрешено (всегда) │  │  Key('profile_gps_status_text')
│  │    Трекинг включён · отправлено 142 точки               │  │  Key('profile_gps_tracking_text')
│  │    Последняя отправка 14:32                             │  │
│  │    [ Открыть настройки ]                                │  │  Key('profile_gps_settings_button')
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Уведомления и данные                                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🔔 Уведомления                    Включены (5 из 7)  ›  │  │  Key('profile_notifications_tile')
│  ├─────────────────────────────────────────────────────────┤  │
│  │ ⚡ Очередь отправки                          2 действия ›│  │  Key('profile_queue_tile')
│  ├─────────────────────────────────────────────────────────┤  │
│  │ 🗑 Очистить кэш планов и фото                        ›  │  │  Key('profile_clear_cache_tile')
│  ├─────────────────────────────────────────────────────────┤  │
│  │ ⓘ О приложении · версия 1.0.0 (М6)                      │  │  Key('profile_about_tile')
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────────┐│
│  │                        Выйти                              ││  Key('profile_logout_button')
│  └───────────────────────────────────────────────────────────┘│
├───────────────────────────────────────────────────────────────┤
│   Сегодня    │     Чаты        │     Профиль                 │
└───────────────────────────────────────────────────────────────┘
```

Шторка «Уведомления» (bottom sheet):

```
┌───────────────────────────────────────────────┐
│  ▁▁▁▁▁        Уведомления                     │
│  Аварийные заявки                    [●  ]    │  Key('profile_notification_switch_EMERGENCY')
│  Новые заявки                        [●  ]    │  Key('profile_notification_switch_NEW_TICKET')
│  Просроченные заявки                 [●  ]    │  Key('profile_notification_switch_TICKET_OVERDUE')
│  Сообщения в чате                    [●  ]    │  Key('profile_notification_switch_CHAT_MESSAGE')
│  Выход из геозоны                    [●  ]    │  Key('profile_notification_switch_GEOFENCE_EXIT')
│  Материал ниже нормы                 [●  ]    │  Key('profile_notification_switch_MATERIAL_LOW')
│  Неявка на смену                     [ ● ]    │  Key('profile_notification_switch_SCHEDULE_MISSED')
│  ┌─────────────────────────────────────────┐  │
│  │              Сохранить                  │  │  Key('profile_notifications_save_button')
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

## 3. Состав блоков

### 3.1. Карточка пользователя

| Элемент | Источник | Правило |
|---|---|---|
| ФИО | `GET /api/auth/me` → `fullName` | `sizeLG`/`weightMedium`; не редактируется (меняет админ) |
| Роль | `role` | `ROLE_LABELS[role]` («Оператор») + email; `sizeSM`/`neutral500` |
| Телефон | `phone` | «+7 999 000-00-03»; если `null` — строки нет |
| Аватар | `avatarUrl` | `CircleAvatar(radius: 32)` с `Image.network` + `loadingBuilder`, при `null`/ошибке — инициалы на фоне `primary100` |
| «Изменить фото» | — | `TextButton` → bottom sheet «Камера / Галерея» → `image_picker` → `POST /api/files/upload {kind: 'avatar'}` → `POST /api/files/:id/attach {entityType: 'AVATAR', entityId: me.id}` → **локально** обновляем отображаемый аватар; ⚠️ сохранить `avatarUrl` в профиль нечем (п. 10.1) |
| Кэш аватара | — | `{avatars_dir}/{userId}.jpg`: показываем закэшированный файл, пока не загрузился сетевой (оффлайн — только он) |

### 3.2. Доступ

| Пункт | Действие | API |
|---|---|---|
| «Сменить PIN» | `PinPage(mode: setup)` из [`auth.md`](./auth.md) §3.3/4.4 | `POST /api/auth/change-pin {currentPassword, newPin}` |
| «Сменить пароль» | `/profile/password` (`ChangePasswordPage`) | `POST /api/auth/change-password {currentPassword, newPassword}` |

`ChangePasswordPage`: два поля (`current_password_field`, `new_password_field`, `new_password_repeat_field`)
и кнопка `save_password_button`. После успеха сервер отзывает **все** сессии
(`auth.service.ts:93`), поэтому приложение: очищает `access_token`/`refresh_token`, оставляет
`pin_email`, показывает snackbar «Пароль изменён. Войдите заново.» и ведёт на `/login`.

### 3.3. GPS-трекинг и разрешения

| Строка | Источник | Значения |
|---|---|---|
| «Местоположение» | `geolocator.checkPermission()` | «Разрешено (всегда)» / «Разрешено при использовании» / «Отклонено» / «Отклонено навсегда» |
| Статус трекинга | локальный `LocationService` + смена | «Трекинг включён» (смена `CHECKED_IN`) / «Трекинг приостановлен (смена не открыта)» / «Нет разрешения — трекинг не работает» |
| Счётчик точек | локальный буфер + `synced` | «отправлено {N} точек» (успешно ушедшие batch), «в буфере {K}» |
| Последняя отправка | время последнего успешного `POST /api/gps/track` | «Последняя отправка 14:32»; при ошибке — «Ошибка отправки: {текст}» `danger600` |
| Кнопка «Открыть настройки» | `Geolocator.openAppSettings()` | показывается при `denied`/`deniedForever` |
| Пояснение | статический текст | «Для отметки на смене нужен доступ к геолокации, для фонового трекинга — „Всегда“ (Android: „Разрешить всегда“).» |

Поведение трекинга — М6.6: интервалы 10–15 с в движении, 60 с статично, пауза вне смены, батарея в
поле `battery` каждой точки (`POST /api/gps/track`, batch ≤1000 — `MAX_TRACK_BATCH`). Экран только
показывает статус и разрешения, сам трекинг живёт в `LocationService`.

### 3.4. Уведомления

| Аспект | Решение |
|---|---|
| Регистрация устройства | при входе (после `GET /api/auth/me`): `firebase_messaging.getToken()` → `POST /api/notifications/device {token, platform: 'android' \| 'ios'}` (upsert, 200) |
| Настройки | `GET /api/notifications/settings` → `{userId, disabledTypes, availableTypes}`; шторка рисует свитчи по `availableTypes`, выключенный = тип в `disabledTypes` |
| Сохранение | `PATCH /api/notifications/settings {disabledTypes}` → обновлённые настройки; 400 «Недопустимый тип уведомления» — показываем текст сервера |
| Обработка push | `firebase_messaging.onMessage`/`onMessageOpenedApp` → по `data.type`: `CHAT_MESSAGE` → `/chats/{chatId}`; `EMERGENCY`/`NEW_TICKET`/`TICKET_OVERDUE` → `/today`; `GEOFENCE_EXIT` → `/profile`; `SCHEDULE_MISSED` → `/today`; `MATERIAL_LOW` → `/today` |
| Dev-стенд | FCM в dev — мок (`notification-service`: MockPushSender); в приложении кнопка «Показать тестовое уведомление» в debug-сборке (не в release) |
| Отписка при выходе | ⚠️ эндпоинта нет (п. 10.2) |

Русские подписи типов (словаря на сервере нет — п. 10.3):

| Тип (`availableTypes`) | Подпись |
|---|---|
| `EMERGENCY` | «Аварийные заявки» |
| `NEW_TICKET` | «Новые заявки» |
| `TICKET_OVERDUE` | «Просроченные заявки» |
| `CHAT_MESSAGE` | «Сообщения в чате» |
| `GEOFENCE_EXIT` | «Выход из геозоны» |
| `MATERIAL_LOW` | «Материал ниже нормы» |
| `SCHEDULE_MISSED` | «Неявка на смену» |

### 3.5. Данные и выход

| Пункт | Действие |
|---|---|
| «Очередь отправки» | `/offline`; справа — число записей `pending`/`failed` |
| «Очистить кэш планов и фото» | удаляет `plans_dir`, `photos_dir` (только уже отправленные фото) и кэш аватаров, кроме текущего; очередь **не** трогает. Диалог «Очистить кэш? Планы и отправленные фото будут скачаны заново.» |
| «О приложении» | версия из `package_info_plus` (⚠️ пакета нет в `mobile/README.md` — п. 10.4) + идентификатор смены/объекта для диагностики |
| «Выйти» | диалог §4 → `POST /api/auth/logout {refreshToken}` → очистка secure storage, drift (все таблицы), файловых кэшей → `/login` |

## 4. Действия пользователя

| Действие | Триггер | Результат | Ошибки |
|---|---|---|---|
| Изменить фото | `Key('profile_avatar_button')` | шторка → камера/галерея → upload → attach → локальное обновление аватара | «Фото отклонено: {текст сервера}»; оффлайн — «Нет соединения. Попробуйте позже» (аватар в очередь не ставим: он не критичен) |
| Сменить PIN | `Key('profile_change_pin_tile')` | `PinPage(mode: setup)` | см. [`auth.md`](./auth.md) §4.4 |
| Сменить пароль | `Key('profile_change_password_tile')` | `/profile/password` | «Текущий пароль указан неверно», «Новый пароль должен быть не короче 6 символов» |
| Открыть настройки GPS | `Key('profile_gps_settings_button')` | системный экран разрешений | — |
| Настроить уведомления | `Key('profile_notifications_tile')` | шторка → `PATCH settings` | 400 — текст сервера; при оффлайне — «Нет соединения. Настройки не сохранены.» |
| Открыть очередь | `Key('profile_queue_tile')` | `/offline` | — |
| Очистить кэш | `Key('profile_clear_cache_tile')` | диалог → удаление файлов | — |
| Выйти | `Key('profile_logout_button')` | диалог «Выйти из аккаунта?», «Неотправленные действия (2) будут потеряны.» → «Отмена» / «Выйти» | при ошибке `logout` (нет сети) — всё равно выходим локально, refresh-токен попадёт в очередь на отзыв при следующем входе |

## 5. Таблица состояний

| Состояние | Триггер | Отображение |
|---|---|---|
| Загрузка | `GET /api/auth/me` в первый раз | скелетон карточки (`CircleAvatar` 64 + две строки `neutral200`) |
| Загрузка (кэш есть) | refetch | профиль из кэша + `LinearProgressIndicator` под `AppBar` |
| Пусто | нет ни одного пункта статуса? — не применимо | вместо пустого состояния: если `phone == null`, строка телефона не рендерится |
| Ошибка профиля | 5xx/сеть и кэша нет | `ErrorStateWidget` «Не удалось загрузить профиль» + «Повторить»; выход доступен (кнопка не зависит от сети) |
| Ошибка настроек уведомлений | 5xx | баннер в шторке «Не удалось загрузить настройки» + «Повторить» |
| GPS: нет разрешения | `denied`/`deniedForever` | строка `danger600` «Нет разрешения — трекинг не работает» + «Открыть настройки» |
| GPS: приостановлен | смена не `CHECKED_IN` | `neutral500` «Трекинг приостановлен (смена не открыта)» — это норма, не ошибка |
| GPS: ошибка отправки | последний `POST /api/gps/track` провалился | «Ошибка отправки: {текст}» `danger600` + «Повторить» |
| Оффлайн | нет сети | `OfflineBannerWidget` «Нет соединения — настройки не сохранятся»; просмотр профиля и очереди работает |
| Успех | всё загружено | карточка + списки; счётчик очереди актуален |
| Выход в процессе | `logout` отправлен | кнопка `disabled` с индикатором; локальная очистка после ответа или таймаута 3 с |

## 6. Таблица элементов (элемент → виджет → `Key` → действие)

| Элемент | Тип виджета Flutter | `Key` | Действие |
|---|---|---|---|
| ФИО | `Text` | `Key('profile_name_text')` | — |
| Роль и email | `Text` | `Key('profile_role_text')` | — |
| Аватар | `CircleAvatar` + `Image.network` | `Key('profile_avatar_image')` | — |
| «Изменить фото» | `TextButton` | `Key('profile_avatar_button')` | upload + attach |
| «Сменить PIN» | `ListTile` | `Key('profile_change_pin_tile')` | `/profile/pin` |
| «Сменить пароль» | `ListTile` | `Key('profile_change_password_tile')` | `/profile/password` |
| Статус разрешения | `Text` | `Key('profile_gps_status_text')` | — |
| Статус трекинга | `Text` | `Key('profile_gps_tracking_text')` | — |
| «Открыть настройки» | `OutlinedButton` | `Key('profile_gps_settings_button')` | `openAppSettings()` |
| «Уведомления» | `ListTile` | `Key('profile_notifications_tile')` | шторка |
| Свитч типа | `SwitchListTile` | `Key('profile_notification_switch_<TYPE>')` | локальное изменение |
| «Сохранить» (шторка) | `FilledButton` | `Key('profile_notifications_save_button')` | `PATCH /api/notifications/settings` |
| «Очередь отправки» | `ListTile` + `Badge` | `Key('profile_queue_tile')` | `/offline` |
| «Очистить кэш» | `ListTile` | `Key('profile_clear_cache_tile')` | диалог → удаление |
| «О приложении» | `ListTile` | `Key('profile_about_tile')` | info-диалог |
| «Выйти» | `FilledButton`/`ListTile` | `Key('profile_logout_button')` | диалог |
| Подтверждение выхода | `AlertDialog` | `Key('profile_logout_confirm_button')` | `logout` + очистка |
| Текущий пароль | `TextFormField` | `Key('current_password_field')` | ввод |
| Новый пароль | `TextFormField` | `Key('new_password_field')` | ввод |
| Повтор пароля | `TextFormField` | `Key('new_password_repeat_field')` | сверка |
| «Сохранить» (пароль) | `FilledButton` | `Key('save_password_button')` | `POST /api/auth/change-password` |

## 7. Используемые дизайн-токены

| Место | Константа | Значение |
|---|---|---|
| Фон, карточки | `AppColors.neutral50`, `Colors.white` | |
| Аватар-заглушка | фон `AppColors.primary100`, инициалы `primary700`, `sizeXL` | |
| ФИО | `sizeLG` (18) + `weightMedium` (500), `neutral900` | |
| Роль, email, телефон | `sizeSM` (14) + `neutral500` | |
| Заголовки секций | `sizeXS` (12) + `weightSemibold` + `neutral500`, `letterSpacing 0.4` | «Доступ», «GPS-трекинг», «Уведомления и данные» |
| Пункты списка | `ListTile` (высота ≥56), иконка `neutral700`, заголовок `sizeBASE`, пояснение `sizeXS`/`neutral500` | touch-target ≥48 dp |
| Разделители | `AppColors.neutral200`, толщина 1 | |
| Статус «разрешено» | `success600` | |
| Статус «нет разрешения» | `danger600` | |
| Статус «приостановлен» | `neutral500` | |
| Счётчик очереди | `Badge` `primary500` + `Colors.white` | |
| Кнопка «Выйти» | текст/граница `danger600`, фон `Colors.white`, высота 48 | деструктивное действие — не заливка `danger500` (случайное нажатие) |
| Кнопка подтверждения в диалоге | `danger500` (фон), `Colors.white` | |
| Карточка | `AppRadius.xl`, `AppShadows.sm` | |
| Чипы/шторка | `AppRadius.xl` сверху, `AppShadows.lg` | |
| Отступы | `lg` (16) — между блоками, `md` (12) — внутри `ListTile` | |

## 8. Данные из API

| Запрос | Тело | Ответ / поля | Использование |
|---|---|---|---|
| `GET /api/auth/me` | — | `SafeUser`: `id`, `email`, `phone`, `fullName`, `role`, `avatarUrl`, `isActive`, `createdAt`, `updatedAt` | карточка пользователя, `entityId` для аватара |
| `POST /api/files/upload` | multipart `file`, `kind: 'avatar'` | `UploadedFileView`: `id`, `url`, `thumbnailUrl`, `mimeType`, `sizeBytes` | загрузка аватара (бакет `avatars`) |
| `POST /api/files/:id/attach` | `{entityType: 'AVATAR', entityId: me.id}` | `{id}` | связь файла с аватаром |
| `POST /api/files/:id/attach` | `{entityType: 'TICKET' \| 'CHAT_MESSAGE' \| …}` | — | используется другими экранами |
| `POST /api/auth/change-pin` | `{currentPassword, newPin}` | 201 | смена PIN |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` | 201, **отзыв всех сессий** | смена пароля |
| `POST /api/auth/logout` | `{refreshToken}` | 204 (с refresh — одна сессия, без — все) | выход |
| `POST /api/notifications/device` | `{token, platform: 'android' \| 'ios'}` | 200 `{...}` (upsert) | регистрация push-токена |
| `GET /api/notifications/settings` | — | `{userId, disabledTypes: string[], availableTypes: string[]}` | шторка уведомлений |
| `PATCH /api/notifications/settings` | `{disabledTypes: string[]}` | обновлённые настройки | сохранение подписок |
| `POST /api/gps/track` | `{tracks: [{lat, lng, accuracy?, speed?, battery?, timestamp?}]}` | `{userId, accepted, geofenceExits}` | трекинг (индикатор на экране — по локальному состоянию) |
| `GET /api/gps/geofences/:userId/check` | `?lat&lng` | `{inside, distanceMeters, geofence}` | диагностика «почему check-in не проходит» (P2) |

## 9. Тексты интерфейса (дословно)

| Где | Текст |
|---|---|
| Заголовок | «Профиль» |
| Секции | «Доступ», «GPS-трекинг», «Уведомления и данные» |
| Роль | «Оператор», «Бригадир», «Администратор» (по `ROLE_LABELS`) |
| Пункты | «Сменить PIN», «Сменить пароль», «Уведомления», «Очередь отправки», «Очистить кэш планов и фото», «О приложении», «Выйти», «Изменить фото» |
| GPS | «Местоположение», «Разрешено (всегда)», «Разрешено при использовании», «Отклонено», «Отклонено навсегда», «Трекинг включён», «Трекинг приостановлен (смена не открыта)», «Нет разрешения — трекинг не работает», «отправлено {N} точек», «в буфере {K}», «Последняя отправка {HH:mm}», «Ошибка отправки: {текст}», «Открыть настройки», «Для отметки на смене нужен доступ к геолокации, для фонового трекинга — „Всегда“ (Android: „Разрешить всегда“).» |
| Уведомления | «Уведомления», «Включены ({N} из {M})», «Сохранить», «Не удалось загрузить настройки», «Нет соединения. Настройки не сохранены.» + подписи типов (§3.4) |
| Данные | «Очередь отправки», «{N} действий», «Очистить кэш? Планы и отправленные фото будут скачаны заново.», «Очистить», «Отмена», «О приложении», «версия {v}» |
| Выход | «Выйти», «Выйти из аккаунта?», «Неотправленные действия ({N}) будут потеряны.», «Выйти», «Отмена» |
| Пароль | «Смена пароля», «Текущий пароль», «Новый пароль», «Повторите новый пароль», «Сохранить», «Пароли не совпадают», «Пароль изменён. Войдите заново.» |
| Ошибки | «Не удалось загрузить профиль», «Не удалось выйти. Попробуйте позже», «Фото отклонено: {текст сервера}», «Нет соединения. Попробуйте позже» |

## 10. Что проверяет widget-тест

1. **Выход очищает сессию**: тап `Key('profile_logout_button')` → в диалоге
   `Key('profile_logout_confirm_button')` → мок `authRepository.logout` вызван один раз, мок
   secure storage больше не содержит `access_token`, и роутер оказался на `/login`.
2. **Настройки уведомлений**: при `availableTypes = ['EMERGENCY','MATERIAL_LOW']` и
   `disabledTypes = ['MATERIAL_LOW']` свитч `Key('profile_notification_switch_MATERIAL_LOW')`
   выключен; после включения и нажатия `Key('profile_notifications_save_button')` мок
   `notificationsRepository.updateSettings` получил `disabledTypes` **без** `MATERIAL_LOW`.
3. **GPS без разрешения**: мок `locationService.checkPermission` возвращает `denied` → виден текст
   «Нет разрешения — трекинг не работает» и кнопка `Key('profile_gps_settings_button')`.
4. **Роль отображается словарём**: `role = 'OPERATOR'` → `find.text('Оператор')` (сырое `OPERATOR`
   в интерфейсе не встречается).

## 11. Ограничения и открытые вопросы

1. **⚠️ Аватар нельзя сохранить в профиль.** `POST /api/files/upload {kind: 'avatar'}` вернёт `url`,
   `POST /api/files/:id/attach {entityType: 'AVATAR', entityId}` создаст привязку, но записать
   `User.avatarUrl` нечем: `PATCH /api/users/:id` требует ADMIN и в `UpdateUserDto` есть поле
   `avatarUrl` (`update-user.dto.ts:36–38`), а self-service-эндпоинта профиля нет вовсе. Следствие:
   после переустановки приложения аватар снова пуст, а у бригадира старый. **Требуется:**
   `PATCH /api/auth/me { avatarUrl }` или `POST /api/auth/avatar { fileId }`.
2. **⚠️ Устройство не отписывается от push.** `POST /api/notifications/device` — только upsert по
   `token`; при выходе из аккаунта FCM-токен остаётся привязанным к прежнему пользователю, и
   следующий оператор на том же устройстве получит **чужие** push-уведомления (данные заявок,
   текст чата). Требуется `DELETE /api/notifications/device { token }` (или `unregister`), иначе
   выход обязан вызывать его; как временная мера спецификация предписывает перерегистрировать
   токен при следующем входе (что не мешает утечке до входа).
3. **Словаря подписей типов уведомлений нет.** `NOTIFICATION_TYPES` — машинные значения
   (`NEW_TICKET`…), русских подписей нет ни в `shared/`, ни в notification-service. Сейчас подписи
   дублируются в приложении (таблица §3.4) — при добавлении типа на сервере приложение покажет
   «сырое» значение. Требуется словарь в `shared` или в ответе `availableTypes`
   (`[{type, label}]`).
4. **`package_info_plus` не заявлен.** Для строки «версия {v}» нужен пакет, которого нет в таблице
   зависимостей [`mobile/README.md`](../../../mobile/README.md) (это же касается
   `socket_io_client` — [`chat.md`](./chat.md) п. 11.4, и `connectivity_plus` —
   [`offline.md`](./offline.md) п. 10.1). Нужно решение: либо добавить пакеты, либо получить
   версию без них (например, константа `APP_VERSION` в `lib/core/constants/app_constants.dart`).
5. **Отзыв refresh-токена при выходе без сети не выполняется.** `POST /api/auth/logout` требует
   сети; при оффлайне приложение выходит локально и ставит запись `kind: 'logout'` в очередь.
   Тогда «выход» в оффлайне не отзывает токен на сервере — при потере устройства сессия остаётся
   живой. Требуется решение по политике (время жизни refresh-токена, обязательный онлайн-выход
   при первой возможности).
6. **Биометрия в профиле не переключается.** Тумблера «Вход по отпечатку» в спецификации нет
   именно потому, что ключ нельзя записать на сервер ([`auth.md`](./auth.md) п. 10.1). Когда
   эндпоинт появится, тумблер добавляется в секцию «Доступ» с `Key('profile_biometric_switch')`.
7. **Пункт «Очистить кэш» и очередь.** Спецификация явно не удаляет `pending_actions` — иначе
   оператор мог бы потерять аварийную заявку. Кнопка `disabled`, пока в очереди есть `pending`.
8. **Роль `CLIENT` в приложении** уже отсечена на входе ([`auth.md`](./auth.md) §4.6), поэтому
   здесь профиль всегда операторский; ветки «клиент» на экране нет.
