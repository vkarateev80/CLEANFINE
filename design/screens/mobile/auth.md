# 🔐 Экраны входа: логин, PIN, биометрия (`auth`) — DS-002 (М6.2)

> DS-002 → `auth_login.fig` + `auth_pin.fig`; реализация — М6.2
> (`lib/features/auth/presentation/pages/{login_page,pin_page}.dart`, каркас —
> `lib/features/auth/presentation/widgets/`).
> Тип артефакта — текстовая спецификация (см. [`README.md`](./README.md)), не бинарный макет.
> Данные: auth-service (`API_AUTH_URL`, dev-порт 3001) — `POST /api/auth/login`, `POST /api/auth/pin`,
> `POST /api/auth/biometric`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`.
> Источник требований — `ПЛАН.md` М6.2 («Экраны `auth_login` … и `auth_pin` (ввод/установка PIN,
> хранение хэша на сервере через `/api/auth/pin` и `/change-pin`), биометрия `local_auth`… Роутер
> go_router с guard'ом авторизации») и `docs/agents/FRONTEND_MOBILE.md` → Acceptance Criteria
> («Авторизация работает», «PIN-код работает», «Биометрия работает»).

## 1. Назначение

Впустить оператора в приложение и сохранить сессию так, чтобы в поле (в перчатках, на морозе, без
сети) вход занимал 3 секунды. Пакет решает четыре задачи:

1. **первый вход** — email и пароль (та же учётная запись, что заводит админка);
2. **повседневный вход** — PIN из 4–6 цифр (`POST /api/auth/pin`), без клавиатуры и без ввода email;
3. **установка/смена PIN** — после первого входа и по требованию (`POST /api/auth/change-pin`,
   подтверждается текущим паролем);
4. **отпечаток** (`local_auth`) — как быстрый доступ к сохранённой сессии устройства.

Регистрации в приложении нет (учётные записи заводит администратор), восстановления пароля нет
(в API отсутствует — см. п. 10.3), биометрия как **серверный** способ входа не работает до
доработки auth-service (см. п. 10.1) — это единственное место пакета, где требование М6.2
невыполнимо на текущем API.

## 2. Маршруты и доступ

| Экран | Маршрут | Файл виджета | Guard |
|---|---|---|---|
| Заставка | `/splash` | `SplashPage` | вне guard: проверяет `accessToken`/`refreshToken` |
| Логин | `/login` | `LoginPage` | обратный guard: есть валидный токен → `/today` |
| Ввод PIN | `/pin` | `PinPage(mode: PinMode.entry)` | обратный guard; доступен, если в secure storage есть `pin_email`/`pin_phone` |
| Установка/смена PIN | `/pin/setup` | `PinPage(mode: PinMode.setup)` | требует авторизации **или** шага «подтвердите пароль» внутри экрана |

| Параметр | Значение |
|---|---|
| Запросы | `POST /api/auth/login {email, password}` → `{accessToken, refreshToken}`; `POST /api/auth/pin {email \| phone, pinCode}`; `POST /api/auth/biometric {biometricKey}`; `GET /api/auth/me` |
| Токены | `flutter_secure_storage`: `access_token`, `refresh_token`; email/телефон для PIN — `pin_email`, длина PIN — `pin_length` (для авто-отправки, см. §5.3) |
| Биометрический ключ | `biometric_key` в secure storage; на сервере `POST /api/auth/biometric` ищет пользователя по `User.biometricKey` — **записать** ключ нечем (п. 10.1) |
| Успех | `GET /api/auth/me` → роль `OPERATOR`/`SUPERVISOR`/`ADMIN` → `/today`; `CLIENT` → отказ (§4.6) |
| Лимиты | логин и PIN: 5 попыток/мин (`API_SPECIFICATION.md` §1, `@Throttle` в `auth.controller.ts`); на 429 показываем текст, счётчик попыток не рисуем (сервер не отдаёт остаток) |
| Выход | `POST /api/auth/logout {refreshToken}` → очистка secure storage и drift → `/login` (см. [`profile.md`](./profile.md) §6) |

## 3. Схемы экранов (телефон 360–430 dp, портрет)

### 3.1. `/login` — email и пароль

```
┌───────────────────────────────────────────────────────────────┐
│                        🧹  CLEANFINE                       │  ← size2XL, primary600
│                     Приложение оператора                      │  ← sizeSM, neutral500
│                                                               │
│   Email *                                                     │
│   ┌───────────────────────────────────────────────────────┐   │
│   │ operator                             │   │  Key('email_field')
│   └───────────────────────────────────────────────────────┘   │
│   Пароль *                                       [👁]         │  Key('password_toggle')
│   ┌───────────────────────────────────────────────────────┐   │
│   │ ••••••••                                              │   │  Key('password_field')
│   └───────────────────────────────────────────────────────┘   │
│   ⚠ Неверный email или пароль                                 │  Key('login_error_text')
│                                                               │
│   ┌───────────────────────────────────────────────────────┐   │
│   │                        Войти                          │   │  Key('submit_button')
│   └───────────────────────────────────────────────────────┘   │
│   ┌───────────────────────────────────────────────────────┐   │
│   │  Войти по PIN (3456)                                  │   │  Key('login_pin_button')
│   └───────────────────────────────────────────────────────┘   │
│   ┌───────────────────────────────────────────────────────┐   │
│   │  👆 Войти по отпечатку                                │   │  Key('login_biometric_button')
│   └───────────────────────────────────────────────────────┘   │
│   Забыли пароль? Обратитесь к бригадиру.                      │  ← sizeXS, neutral500
└───────────────────────────────────────────────────────────────┘
```

### 3.2. `/pin` — ввод PIN

```
┌───────────────────────────────────────────────────────────────┐
│  ←                          Вход по PIN                       │  ← AppBar, ведущая стрелка
│                     operator                 │  ← sizeSM, neutral500 (маскируется)
│                                                               │
│                      ● ● ● ● ○ ○                              │  Key('pin_dots'), size3XL
│                     Введите PIN из 4–6 цифр                   │  Key('pin_hint_text')
│                                                               │
│         ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│         │    1    │  │    2    │  │    3    │                 │  Key('pin_digit_1'…)
│         ├─────────┤  ├─────────┤  ├─────────┤                 │
│         │    4    │  │    5    │  │    6    │                 │
│         ├─────────┤  ├─────────┤  ├─────────┤                 │
│         │    7    │  │    8    │  │    9    │                 │
│         ├─────────┤  ├─────────┤  ├─────────┤                 │
│         │    👆   │  │    0    │  │    ⌫    │                 │  Key('pin_biometric_button'),
│         └─────────┘  └─────────┘  └─────────┘                 │      Key('pin_digit_0'), Key('pin_delete_button')
│                                                               │
│   ⚠ Неверный PIN                                              │  Key('pin_error_text')
│   ┌───────────────────────────────────────────────────────┐   │
│   │                        Войти                          │   │  Key('pin_submit_button')
│   └───────────────────────────────────────────────────────┘   │
│   Забыли PIN? Введите пароль                                  │  Key('pin_forgot_button')
└───────────────────────────────────────────────────────────────┘
```

### 3.3. `/pin/setup` — установка/смена PIN

```
┌───────────────────────────────────────────────────────────────┐
│  ←                        Новый PIN                           │
│   Текущий пароль *                                            │
│   ┌───────────────────────────────────────────────────────┐   │  Key('pin_current_password_field')
│   └───────────────────────────────────────────────────────┘   │
│   Новый PIN (4–6 цифр) *                                      │
│   ┌───────────────────────────────────────────────────────┐   │  Key('pin_new_field')
│   └───────────────────────────────────────────────────────┘   │
│   Повторите PIN *                                             │
│   ┌───────────────────────────────────────────────────────┐   │  Key('pin_repeat_field')
│   └───────────────────────────────────────────────────────┘   │
│   ⚠ PIN должен содержать 4–6 цифр                             │  Key('pin_setup_error_text')
│   ┌───────────────────────────────────────────────────────┐   │
│   │                     Сохранить PIN                     │   │  Key('pin_save_button')
│   └───────────────────────────────────────────────────────┘   │
│   PIN хранится на сервере в виде хэша и не передаётся в чат.  │  ← sizeXS, neutral500
└───────────────────────────────────────────────────────────────┘
```

## 4. Состав блоков

### 4.1. Каркас экранов входа

| Элемент | Реализация | Обоснование |
|---|---|---|
| Контейнер | `Scaffold(body: SafeArea(child: SingleChildScrollView(padding: EdgeInsets.all(AppSpacing.lg))))` | на 320 dp и при открытой клавиатуре форма прокручивается, а не обрезается |
| Шапка | `Text('🧹 CLEANFINE')` — `size2XL`/`weightSemibold`, цвет `primary600`, по центру; подпись «Приложение оператора» — `sizeSM`, `neutral500` | текстовый логотип, как в админке и портале (отдельного ассета логотипа нет) |
| Карточка формы | `Card` (или `Container`): `Colors.white`, `AppRadius.xl`, `AppShadows.md`, `padding: AppSpacing.xl` | токены `radius.xl` + `shadows.md` |
| Поля | `TextFormField` с `OutlineInputBorder(borderRadius: AppRadius.lg)`, `contentPadding` `AppSpacing.md`, текст `sizeBASE` | 16 px — иначе iOS зумит при фокусе |
| Кнопка действия | `FilledButton` высотой `48` (`minimumSize: Size.fromHeight(48)`), `AppRadius.lg` | touch-target ≥48 dp |
| Вторичные кнопки | `OutlinedButton` / `TextButton` той же высоты | «Войти по PIN», «Войти по отпечатку», «Забыли PIN?» |
| Ошибка | `Container` с иконкой `Icons.error_outline`, границей `danger500`, фон `Colors.white`, текст `danger600` `sizeSM`; `Semantics(liveRegion: true)` | один блок ошибки на экран (как `ErrorBanner` в web) |

### 4.2. Поля формы логина

| Поле | Виджет | Обяз. | Атрибуты | Клиентская валидация |
|---|---|---|---|---|
| Email | `TextFormField`, `keyboardType: TextInputType.emailAddress`, `textInputAction: TextInputAction.next`, `autofillHints: [AutofillHints.email]` | ✔ | `autocorrect: false`, `enableSuggestions: false`, `textCapitalization: TextCapitalization.none` | непустое; регулярное выражение «непустая часть + `@` + домен с точкой» → иначе «Введите корректный email» |
| Пароль | `TextFormField(obscureText: !_visible)` | ✔ | `autofillHints: [AutofillHints.password]`, `textInputAction: TextInputAction.done` | непустой; политику длины не навязываем (её держит auth-service: `MinLength(6)`) |
| Показать пароль | `IconButton(Icons.visibility/visibility_off)` c `tooltip` | — | `Semantics(label: 'Показать пароль'/'Скрыть пароль')` | — |
| Оба пусты | — | — | — | «Введите email и пароль» (запрос не уходит) |

### 4.3. Ввод PIN (`/pin`)

| Блок | Реализация | Правило |
|---|---|---|
| Индикатор | `Row` из `maxLength` точек: заполненная — `primary500`, пустая — `neutral300`, `AppRadius.full` | максимум точек — 6 (сервер допускает 4–6, `pin-login.dto.ts`: `^\d{4,6}$`) |
| Клавиатура | собственная сетка 3×4 (`GridView`/`Column`+`Row`), кнопка `64×64` dp, текст `size2XL` | системная клавиатура не используется: исключает автозамену и ускоряет ввод в перчатках |
| Ввод цифры | `press → state.pin += digit`; при `pin.length == pin_length` (если длина известна) — **автоотправка** | длина PIN записывается в `pin_length` при установке; на чужом/новом устройстве `pin_length` неизвестна → автоотправки нет |
| Отправка | кнопка «Войти» активна при `pin.length >= 4`; `POST /api/auth/pin` | повторная отправка во время запроса запрещена |
| Ошибка | 401 → «Неверный PIN», поле очищается, фокус остаётся на клавиатуре PIN | не уточняем, сколько цифр ожидается |
| Биометрия | иконка 👆 на месте «0» (левый нижний угол), показывается только при `biometric_key != null` и `local_auth.canCheckBiometrics` | нет ключа/датчика — кнопки нет вовсе |
| «Забыли PIN?» | `TextButton` → `/pin/setup` (шаг «текущий пароль» → новый PIN) | PIN сбрасывается не по email, а по паролю |

### 4.4. Установка/смена PIN (`/pin/setup`)

1. Заполняется **текущий пароль** — сервер требует его в `ChangePinDto.currentPassword`;
2. `newPin` и повтор должны совпасть (проверка на клиенте: «PIN не совпадает»);
3. `POST /api/auth/change-pin {currentPassword, newPin}` → 201; локально сохраняются
   `pin_length = newPin.length` и `pin_email`/`pin_phone` из профиля;
4. 401 «Текущий пароль указан неверно» → ошибка у поля пароля; 400 «PIN должен содержать 4–6 цифр» →
   ошибка у поля нового PIN (текст сервера).

### 4.5. Биометрия: что реально работает (важно для М6.2)

| Шаг | API | Статус |
|---|---|---|
| Вход по отпечатку | `POST /api/auth/biometric {biometricKey}` | ⚠️ работает только если `User.biometricKey` уже кем-то записан; **эндпоинта записи нет** (п. 10.1) |
| Регистрация ключа после первого логина | — | ⚠️ **нечего вызывать**: `PATCH /api/users/:id` — только ADMIN и без поля `biometricKey` |
| Локальная биометрия как «замок» | `local_auth.authenticate()` перед показом PIN | ✅ работает: успешный отпечаток разблокирует `/pin` и подставляет сохранённый email (не заменяет серверную проверку) |

Пока п. 10.1 не закрыт, экран показывает отпечаток **как локальную разблокировку сохранённой
сессии**, а кнопка «Войти по отпечатку» отправляет `POST /api/auth/biometric` только если ключ был
записан сервером (в dev-стенде его может не быть). Обходной путь не маскирует отсутствие API:
в приложении нет ни одной ветки, которая выдаёт токены без ответа сервера.

### 4.6. Блокировки и отказы

| Ситуация | Как определяется | Экран | Текст | Дальнейшее |
|---|---|---|---|---|
| Неактивный пользователь | 401 на `login`/`pin` с `message = 'Пользователь деактивирован'` | login/PIN | «Учётная запись деактивирована. Обратитесь к бригадиру.» | кнопки повтора нет; форма/клавиатура очищены |
| Нет сети | `DioException.connectionError` | login/PIN | «Нет соединения. Проверьте интернет» | «Повторить»; PIN-вход без сети невозможен (`refresh` тоже требует сети — п. 10.5) |
| Роль `CLIENT` | `GET /api/auth/me` → `role == 'CLIENT'` | после входа | «Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.» | `POST /api/auth/logout` + очистка storage; форма остаётся пустой |
| PIN не задан | 401 на `pin` | PIN | «PIN не установлен. Войдите по паролю и установите PIN.» | кнопка «Войти по паролю» |
| 429 | `statusCode == 429` | login/PIN | «Слишком много попыток. Попробуйте позже» | кнопка `disabled` на 30 с (обратный отсчёт не показываем — сервер не отдаёт `Retry-After`) |
| 5xx | `statusCode >= 500` | login/PIN | «Сервис временно недоступен. Повторите позже» | «Повторить» |

## 5. Таблицы элементов (элемент → виджет → `Key` → действие)

### 5.1. `LoginPage`

| Элемент | Тип виджета Flutter | `Key` | Действие |
|---|---|---|---|
| Поле email | `TextFormField` | `Key('email_field')` | ввод, валидация «Введите корректный email» |
| Поле пароля | `TextFormField(obscureText: …)` | `Key('password_field')` | ввод |
| Показать/скрыть пароль | `IconButton` | `Key('password_toggle')` | переключает `obscureText` |
| Кнопка «Войти» | `FilledButton` | `Key('submit_button')` | `login(email, password)` → `/today` |
| Кнопка «Войти по PIN» | `OutlinedButton` | `Key('login_pin_button')` | `/pin` (видна всегда, но при пустом `pin_email` ведёт на `/pin` без email — экран предложит пароль) |
| Кнопка «Войти по отпечатку» | `OutlinedButton.icon(Icons.fingerprint)` | `Key('login_biometric_button')` | `local_auth` → `POST /api/auth/biometric`; скрыта, если ключа нет |
| Блок ошибки | `Container` + `Text` | `Key('login_error_text')` | показывает текст по §4.6 |
| Подпись «Забыли пароль?» | `Text` | — | статический текст |

`Key('email_field')` и `Key('submit_button')` — **дословно из «Правил написания кода в Dash»**
(`УСТАВ.md`: `tester.enterText(find.byKey(const Key('email_field')), 'invalid')`,
`tester.tap(find.byKey(const Key('submit_button')))`): тест из Устава должен пройти без правок.

### 5.2. `PinPage` (`mode: entry`)

| Элемент | Тип виджета Flutter | `Key` | Действие |
|---|---|---|---|
| Индикатор точек | `Row` из `Container` | `Key('pin_dots')` | отображает `pin.length` из 4–6 |
| Подсказка | `Text` | `Key('pin_hint_text')` | «Введите PIN из 4–6 цифр» |
| Цифра 0…9 | `TextButton`/`InkWell` | `Key('pin_digit_0')` … `Key('pin_digit_9')` | добавляет цифру |
| Удалить | `IconButton(Icons.backspace_outlined)` | `Key('pin_delete_button')` | убирает последнюю цифру |
| Биометрия | `IconButton(Icons.fingerprint)` | `Key('pin_biometric_button')` | `local_auth` → `POST /api/auth/biometric` |
| Кнопка «Войти» | `FilledButton` | `Key('pin_submit_button')` | `POST /api/auth/pin`; `onPressed: null` при `< 4` цифр |
| Блок ошибки | `Text` | `Key('pin_error_text')` | «Неверный PIN» и др. |
| «Забыли PIN?» | `TextButton` | `Key('pin_forgot_button')` | `/pin/setup` |

### 5.3. `PinPage` (`mode: setup`)

| Элемент | Тип виджета Flutter | `Key` | Действие |
|---|---|---|---|
| Текущий пароль | `TextFormField(obscureText: true)` | `Key('pin_current_password_field')` | подтверждение операции |
| Новый PIN | `TextFormField(keyboardType: number, maxLength: 6)` | `Key('pin_new_field')` | 4–6 цифр |
| Повтор PIN | `TextFormField(keyboardType: number, maxLength: 6)` | `Key('pin_repeat_field')` | сверка с новым |
| Ошибка | `Text` | `Key('pin_setup_error_text')` | «PIN не совпадает», «PIN должен содержать 4–6 цифр», «Текущий пароль указан неверно» |
| «Сохранить PIN» | `FilledButton` | `Key('pin_save_button')` | `POST /api/auth/change-pin` |

## 6. Используемые дизайн-токены

| Место | Константа | Значение |
|---|---|---|
| Фон экрана | `AppColors.neutral50` | `#F9FAFB` |
| Карточка формы | `Colors.white` + `AppRadius.xl` (16) + `AppShadows.md` | токена `white`/теней в `app_tokens.dart` нет — см. README, пробелы 1 и 3 |
| Логотип | `AppTypography.size2XL` (24) + `weightSemibold` (600) + `AppColors.primary600` | `#1A80E6` |
| Подпись «Приложение оператора» | `sizeSM` (14) + `AppColors.neutral500` | `#6B7280` |
| Подписи полей | `sizeSM` + `neutral500`; `*` — `danger600` | `#DC2626` |
| Текст в поле | `sizeBASE` (16) + `neutral900` | `#111827` |
| Границы полей | `neutral200`; фокус — `primary500` (2 dp) | `#E5E7EB` / `#3399FF` |
| Кнопка «Войти» | `primary500` (фон), `Colors.white` (текст), `sizeBASE` | pressed — `primary600` |
| Кнопка «Войти по PIN» / «по отпечатку» | граница `neutral300`, текст `neutral900` | |
| Кнопки клавиатуры PIN | `neutral100` (фон), `neutral900` (текст), `AppRadius.lg` | нажатие — `primary100` |
| Точки PIN | заполнено — `primary500`, пусто — `neutral300`, `AppRadius.full` | |
| Ошибка | `danger500` (граница/иконка), `danger600` (текст), `sizeSM` | `#EF4444` / `#DC2626` |
| Отступы | `AppSpacing.lg` (16) — внешний, `md` (12) — между полями, `xl` (24) — внутри карточки | 4px-сетка |
| Скругления | поля/кнопки — `AppRadius.lg` (12), карточка — `xl` (16) | |

## 7. Состояния экранов

| Состояние | Экран | Триггер | Отображение |
|---|---|---|---|
| Загрузка (проверка сессии) | `/splash` | старт приложения | `CircularProgressIndicator` + `Text('Проверка сессии…')`; не дольше 5 с, затем `/login` |
| Пусто | `/login` | пустая форма | кнопка «Войти» активна (не блокируем заранее — серая кнопка без объяснения хуже ошибки по нажатию) |
| Пусто | `/pin` | 0 цифр | «Войти» `disabled`, подсказка «Введите PIN из 4–6 цифр» |
| Ошибка валидации | все | клиентская проверка | блок ошибки `Key('login_error_text')` / сообщение под полем |
| Ошибка сервера | все | 400/401/429/5xx | §4.6 |
| Оффлайн | `/login`, `/pin` | нет сети | «Нет соединения. Проверьте интернет» + «Повторить»; форма не очищается (пользователь не теряет ввод) |
| Отправка | все | запрос в полёте | кнопка `disabled` + `SizedBox(16×16, CircularProgressIndicator(strokeWidth: 2))`; повторный `tap` и `keyboard done` не создают второй запрос |
| Успех | `/login`, `/pin` | 201 | `GET /api/auth/me` → роль допущена → `context.go('/today')`; кнопка остаётся в состоянии загрузки до перехода (не мигает «Войти» → «Вошли») |
| Успех, роль CLIENT | `/login`, `/pin` | `me.role == 'CLIENT'` | §4.6, сессия погашена |
| Сессия есть | `/splash` | валидный access/refresh | `/today` без показа формы |

## 8. Действия пользователя

| Действие | Триггер | Результат |
|---|---|---|
| Войти по паролю | `Key('submit_button')` / «done» на клавиатуре | `POST /api/auth/login` → `GET /api/auth/me` → `/today`; email сохраняется в `pin_email` |
| Войти по PIN | `Key('login_pin_button')` | `/pin` |
| Ввести PIN | цифры | `POST /api/auth/pin {email, pinCode}` (email — из `pin_email`; телефон — если `pin_email` пуст, а `pin_phone` есть) |
| Войти по отпечатку | `Key('login_biometric_button')` / `Key('pin_biometric_button')` | `local_auth.authenticate()` → `POST /api/auth/biometric {biometricKey}` |
| Забыли PIN | `Key('pin_forgot_button')` | `/pin/setup` |
| Сменить/установить PIN | `Key('pin_save_button')` | `POST /api/auth/change-pin` → `pin_length` обновлён, возврат назад |
| Выйти | только с [`profile.md`](./profile.md) | `POST /api/auth/logout` (экраны входа выхода не имеют) |

## 9. Данные из API

| Запрос | Тело | Ответ / поля | Использование |
|---|---|---|---|
| `POST /api/auth/login` | `{email, password}` | 201 `{accessToken, refreshToken}` (`TokenPairDto`) | токены в secure storage |
| `POST /api/auth/pin` | `{email? \| phone?, pinCode}` (`PinLoginDto`; нужен email **или** телефон, `^\d{4,6}$`) | 201 `{accessToken, refreshToken}` | ежедневный вход |
| `POST /api/auth/biometric` | `{biometricKey}` (`BiometricDto`) | 201 `{accessToken, refreshToken}` | вход по отпечатку (п. 10.1) |
| `POST /api/auth/refresh` | `{refreshToken}` | 201 новая пара | интерцептор `dio`, single-flight |
| `POST /api/auth/logout` | `{refreshToken}` | 204 | выход, отказ по роли |
| `GET /api/auth/me` | — | 200 `SafeUser`: `id`, `email`, `phone`, `fullName`, `role`, `avatarUrl`, `isActive`, `createdAt`, `updatedAt` | роль (guard), email/телефон для PIN, профиль |
| `POST /api/auth/change-pin` | `{currentPassword, newPin}` | 201 | установка/смена PIN |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` | 201, **отзывает все сессии** | [`profile.md`](./profile.md) §6 |

Тексты ошибок сервера, которые экран показывает как есть: `'Неверный email или пароль'`,
`'Пользователь деактивирован'`, `'Неверный PIN'`, `'Укажите email или телефон'`,
`'Биометрический ключ не распознан'`, `'Текущий пароль указан неверно'`,
`'PIN должен содержать 4–6 цифр'`, `'Некорректный email'`,
`'Пароль должен быть не короче 6 символов'`, `'Новый пароль должен быть не короче 6 символов'`.

## 10. Тексты интерфейса (дословно)

| Где | Текст |
|---|---|
| Заголовок логина | «🧹 CLEANFINE» |
| Подпись | «Приложение оператора» |
| Метки полей | «Email», «Пароль» |
| Валидация | «Введите корректный email», «Введите пароль», «Введите email и пароль» |
| Кнопки | «Войти», «Войти по PIN», «Войти по отпечатку», «Сохранить PIN» |
| Ввод PIN | «Вход по PIN», «Введите PIN из 4–6 цифр», «Забыли PIN? Введите пароль» |
| Установка PIN | «Новый PIN», «Текущий пароль», «Новый PIN (4–6 цифр)», «Повторите PIN», «PIN не совпадает», «PIN хранится на сервере в виде хэша и не передаётся в чат.» |
| Ошибки | «Неверный PIN», «PIN не установлен. Войдите по паролю и установите PIN.», «Учётная запись деактивирована. Обратитесь к бригадиру.», «Слишком много попыток. Попробуйте позже», «Нет соединения. Проверьте интернет», «Сервис временно недоступен. Повторите позже», «Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.» |
| Подвал логина | «Забыли пароль? Обратитесь к бригадиру.» |
| Заставка | «Проверка сессии…» |

## 11. Что проверяет widget-тест

1. **«Неверный email → текст ошибки»** (требование М6.2 дословно): вводим `invalid` в
   `Key('email_field')`, нажимаем `Key('submit_button')`, `pump()` → `find.text('Введите корректный
   email')` находит один виджет; сетевой вызов **не** произошёл (мок репозитория не вызывался).
2. **401 на логине** → `find.text('Неверный email или пароль')` в `Key('login_error_text')`.
3. **PIN короче 4 цифр** → `Key('pin_submit_button')` имеет `onPressed == null`; после 4 цифр —
   активна; 401 → `find.text('Неверный PIN')` и индикатор `Key('pin_dots')` пуст.
4. **Биометрия без ключа** → `Key('login_biometric_button')` и `Key('pin_biometric_button')` не
   найдены (`findsNothing`), когда `biometric_key` в моке secure storage пуст.
5. **Роль CLIENT** → после успешного `login` появляется текст «Приложение предназначено для
   операторов…» и мок `authApi.logout` вызван ровно один раз.

## 12. Ограничения и открытые вопросы

1. **⚠️ Регистрации биометрического ключа нет.** `AuthService.biometricLogin` ищет пользователя по
   `User.biometricKey` (`auth.service.ts:51–59`), но записать это поле нечем: единственный
   self-service-эндпоинт профиля — `change-password`/`change-pin`, а `PATCH /api/users/:id` требует
   роли ADMIN и в `UpdateUserDto` поля `biometricKey` нет. Требуется
   `POST /api/auth/biometric/register {biometricKey}` (под JWT) или запись ключа в профиль.
   До этого «Биометрия работает» из чек-листа приёмки М6 выполняется только как локальная
   разблокировка (§4.5).
2. **⚠️ «Установка PIN» без пароля невозможна.** `ChangePinDto` требует `currentPassword`
   (`change-pin.dto.ts:5–8`). Если PIN забыт и пароль тоже — только администратор. Если бизнесу
   нужен «PIN по SMS», это новый сценарий в auth-service, а не правка экрана.
3. **Восстановления пароля нет** ни в API, ни в чек-листе М6 — в интерфейсе обещать нечего
   («Обратитесь к бригадиру»).
4. **PIN-вход требует email или телефона** (`pin-login.dto.ts`: `UnauthorizedException('Укажите email
   или телефон')`), поэтому устройство хранит `pin_email`/`pin_phone` в secure storage. Если
   устройством пользуются два оператора, PIN-вход покажет чужой email — правило «один оператор на
   устройство» не зафиксировано нигде; нужен явный локальный «профиль устройства» или запрет смены
   оператора без выхода.
5. **Оффлайн-вход не определён.** `POST /api/auth/refresh` и `GET /api/auth/me` требуют сети: без
   соединения вход невозможен вовсе, даже при валидном локальном токене. Нужно решение владельца
   (доверять локальной сессии N часов? разрешить оффлайн-старт по PIN с последующей верификацией?).
   См. [`overview.md`](./overview.md) п. 11.4.
6. **429 без `Retry-After`**: точное время блокировки клиенту неизвестно, поэтому показываем
   «Попробуйте позже» и разблокируем кнопку через 30 с — это догадка, а не контракт.
