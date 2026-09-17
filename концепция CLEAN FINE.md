ЕДИНЫЙ ДОКУМЕНТ ПРОЕКТА «CLEANING OPS»
Design System · Устав · План · Ассистенты · Спеки · Контракты · Инфраструктура · Микросервисы
📑 СОДЕРЖАНИЕ
Дизайн-система (Design System)

Устав проекта (Project Charter)

План разработки (Roadmap)

Ассистенты для написания кода

Ассистенты для написания Markdown

Технические спецификации (Specs)

API-контракты (Contracts)

Инфраструктура и горизонтальное масштабирование

Микросервисная архитектура

1. ДИЗАЙН-СИСТЕМА
1.1. Философия дизайна
Принцип	Описание
Скорость	Уборщик в перчатках → крупные кнопки, минимум тапов
Ясность	Статус задачи виден с первого взгляда
Надежность	Работа offline-first, sync при связи
Контекст	Интерфейс адаптируется под роль и локацию
1.2. Цветовая палитра
Основные цвета
scss
// Brand
$color-primary-500: #2563EB;   // Основной синий
$color-primary-600: #1D4ED8;   // Hover
$color-primary-400: #60A5FA;   // Light
$color-primary-100: #DBEAFE;   // Background

// Семантические
$color-success: #10B981;        // Выполнено
$color-warning: #F59E0B;        // В работе / внимание
$color-danger:  #EF4444;        // Авария / просрочено
$color-info:    #3B82F6;        // Информация
$color-neutral-900: #111827;    // Текст
$color-neutral-500: #6B7280;    // Вторичный текст
$color-neutral-100: #F3F4F6;    // Фон карточек
$color-white: #FFFFFF;

// Статусы заявок
$status-new:        #94A3B8;    // Новая — серый
$status-assigned:   #3B82F6;    // Назначена — синий
$status-in-progress:#F59E0B;    // В работе — янтарный
$status-completed:  #10B981;    // Выполнена — зелёный
$status-overdue:    #EF4444;    // Просрочена — красный
$status-emergency:  #DC2626;    // Аварийная — тёмно-красный
Тёмная тема
scss
$dark-bg-primary:   #0F172A;
$dark-bg-secondary: #1E293B;
$dark-text:         #F1F5F9;
$dark-border:       #334155;
1.3. Типографика
scss
// Шрифты
$font-primary: 'Inter', -apple-system, sans-serif;
$font-mono:    'JetBrains Mono', monospace;

// Размеры (mobile-first)
$text-xs:   12px / 16px;   // Подписи
$text-sm:   14px / 20px;   // Вторичный
$text-base: 16px / 24px;   // Основной
$text-lg:   18px / 28px;   // Заголовки карточек
$text-xl:   22px / 30px;   // Заголовки экранов
$text-2xl:  28px / 36px;   // Hero
$text-3xl:  36px / 44px;   // Дашборд цифры

// Веса
$weight-regular: 400;
$weight-medium:  500;
$weight-semibold:600;
$weight-bold:    700;
1.4. Сетка и отступы
scss
// Spacing (кратно 4px)
$space-1:  4px;
$space-2:  8px;
$space-3:  12px;
$space-4:  16px;
$space-5:  20px;
$space-6:  24px;
$space-8:  32px;
$space-10: 40px;
$space-12: 48px;
$space-16: 64px;

// Радиусы
$radius-sm: 6px;
$radius-md: 10px;
$radius-lg: 16px;
$radius-xl: 24px;
$radius-full: 9999px;

// Тени
$shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
$shadow-md: 0 4px 6px rgba(0,0,0,0.07);
$shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
1.5. Компоненты
Кнопки
Тип	Размер	Применение
Primary	56px высота	Главное действие
Secondary	48px	Альтернатива
Ghost	40px	Второстепенное
SOS	72px круг	Аварийная заявка
Icon	40x40	Иконочные
Правило: Минимальная зона тапа — 48x48px (для перчаток 56x56).

Карточка задачи
text
┌─────────────────────────────────┐
│ ● В работе          ⏱ 12:34     │ ← статус, таймер
│                                 │
│ Кухня, 3 этаж                   │ ← локация (16px semibold)
│ Операций: 3/7                   │ ← прогресс
│ ▓▓▓▓▓▓▓▓░░░░░░░░                │ ← прогресс-бар
│                                 │
│ [Продолжить]                    │
└─────────────────────────────────┘
Статус-бейдж
text
[● Новая]        серый
[● Назначена]    синий
[● В работе]     янтарный (пульсирует)
[● Выполнена]    зелёный
[● Просрочена]   красный
[🚨 АВАРИЯ]      красный мигающий
Прогресс-бар
Высота: 8px

Фон: $color-neutral-100

Заполнение: градиент primary → primary-400

Анимация при изменении

1.6. Иконография
Библиотека: Lucide Icons

Размер: 20/24/32px

Стиль: outline, толщина 2px

1.7. Доступность (a11y)
Требование	Значение
Контраст текста	≥ 4.5:1
Контраст крупного текста	≥ 3:1
Минимальный тап	48x48px
Поддержка скринридеров	VoiceOver / TalkBack
Масштабирование	200% без потерь
1.8. Анимации
scss
$duration-fast:   150ms;
$duration-normal: 250ms;
$duration-slow:   400ms;
$easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
$easing-decelerate: cubic-bezier(0, 0, 0.2, 1);
1.9. Голосовые и жестовые паттерны
Свайп вправо — принять задачу

Свайп влево — отложить

Долгое нажатие — контекстное меню

Голосовой ввод — для комментариев

2. УСТАВ ПРОЕКТА
2.1. Паспорт проекта
Параметр	Значение
Название	Cleaning Ops
Тип	B2B SaaS + Mobile
Заказчик	Клининговые компании
Продукт-оунер	[TBD]
Техлид	[TBD]
Старт	Q4 2026
Релиз MVP	Q1 2027
Бюджет	[TBD]
Команда	8-12 человек
2.2. Миссия
Дать клининговым компаниям полный контроль над операциями на объектах через прозрачную цифровую систему — от заявки до фотоотчёта.

2.3. Цели (SMART)
Цель	Метрика	Срок
Сократить время реакции на аварию	с 30 до 5 мин	6 мес
Повысить прозрачность	100% заявок с фото	3 мес
Снизить перерасход материалов	на 25%	6 мес
Ускорить онбординг оператора	до 1 дня	3 мес
Удовлетворенность клиентов (NPS)	> 50	12 мес
2.4. Границы проекта
Входит:

Мобильное приложение (iOS/Android)

Веб-панель администратора

Backend API

Инфраструктура

Не входит (v1.0):

Биллинг и оплата

Интеграция с 1С

AI-распознавание качества уборки

Мультиязычность (только RU)

2.5. Стейкхолдеры
Роль	Интерес	Влияние
Владелец клининговой компании	ROI, контроль	Высокое
Бригадиры	Удобство	Среднее
Операторы	Простота	Низкое
Клиенты объектов	Прозрачность	Среднее
2.6. Роли в команде
Роль	Кол-во	Ответственность
Product Owner	1	Приоритеты, требования
Tech Lead	1	Архитектура, код-ревью
Backend Dev	2	Микросервисы
Mobile Dev	2	Flutter
Frontend Dev	1	React-панель
DevOps	1	K8s, CI/CD
QA	1	Тестирование
Designer	1	UI/UX
Аналитик	1	Метрики
2.7. Процессы
Методология: Scrum (2-недельные спринты)

Ритуалы:

Daily standup — 15 мин

Sprint planning — 2 ч

Sprint review — 1 ч

Retrospective — 1 ч

Definition of Done:

Код написан и покрыт тестами (>70%)

Прошёл код-ревью (2 аппрува)

Работает на staging

Обновлена документация

Проверено QA

2.8. Риски
Риск	Вероятность	Влияние	Митигация
Сопротивление операторов	Высокая	Среднее	UX-исследование, обучение
Плохой GPS в зданиях	Высокая	Высокое	Indoor-позиционирование, Wi-Fi
Отток кадров	Средняя	Среднее	Простой UI
Перерасход бюджета	Средняя	Высокое	MVP-подход, резерв 20%
2.9. Коммуникации
Канал	Назначение	Частота
Slack	Ежедневно	Постоянно
Jira	Задачи	Постоянно
Confluence	Документация	По мере
Zoom	Встречи	По расписанию
3. ПЛАН РАЗРАБОТКИ
3.1. Общая диаграмма
text
Q4 2026              Q1 2027              Q2 2027              Q3 2027
├─ Discovery         ├─ MVP Core          ├─ Extended          ├─ Analytics
├─ Architecture      ├─ Mobile v1         ├─ Chat              ├─ KPI
├─ Design System     ├─ Web Panel v1      ├─ Materials         ├─ Reports
└─ Infra Setup       └─ Beta Launch       ├─ Schedules         └─ Integrations
                                          └─ Public Launch
3.2. Спринты (детально)
Спринт 0 — Discovery (2 недели)
□ Интервью с 10 клининговыми компаниями
□ Анализ конкурентов (Rubedo, Qlean, TaskBird)
□ JTBD-карты
□ Утверждение scope MVP
□ Дизайн-система в Figma
Спринт 1-2 — Инфраструктура (4 недели)
□ K8s-кластер (dev/staging/prod)
□ CI/CD (GitLab CI)
□ Монорепозиторий (Nx)
□ API Gateway
□ Базовый auth-сервис
□ Observability (Prometheus + Grafana + Loki)
Спринт 3-4 — Объекты и планы
□ Object Service
□ Floor Service
□ Загрузка планов (S3)
□ Конструктор экспликации
Спринт 5-6 — Заявки
□ Ticket Service
□ Status Machine
□ Assignment
□ SOS-логика
Спринт 7-8 — Чек-листы и техкарты
□ Tech Card Service
□ Operation runner
□ Фотофиксация
□ Водяные знаки
Спринт 9-10 — GPS и карты
□ Geo Service
□ GPS-трекинг
□ Геозоны
□ Indoor-карты (Mapbox)
Спринт 11-12 — Mobile MVP
□ Flutter-приложение
□ Offline-first (SQLite)
□ Push-уведомления
□ Биометрия
Спринт 13-14 — Web Panel MVP
□ Дашборд
□ Управление объектами
□ Управление персоналом
Спринт 15-16 — Beta
□ Нагрузочное тестирование
□ Security-аудит
□ Закрытая бета (3 клиента)
Спринт 17-18 — Extended
□ Chat Service (WebSocket)
□ Material Service
□ Schedule Service
Спринт 19-20 — Public Launch
□ Маркетинг
□ Onboarding-материалы
□ Поддержка
3.3. Приоритизация (MoSCoW)
Фича	Must	Should	Could	Won't
Авторизация	✅			
Объекты и планы	✅			
Заявки и статусы	✅			
Техкарты	✅			
Фотофиксация	✅			
GPS-трекинг	✅			
SOS	✅			
Push	✅			
Чат		✅		
Материалы		✅		
График		✅		
Аналитика		✅		
Интеграция 1С			✅	
AI-аудит качества				❌ v1
Биллинг				❌ v1
4. АССИСТЕНТЫ ДЛЯ НАПИСАНИЯ КОДА
4.1. Сводная таблица
Ассистент	Языки	Сильные стороны	Цена
Claude (Sonnet 4.5)	Все	Архитектура, длинный контекст (200k)	$$$
GitHub Copilot	Все	Inline-автодополнение в IDE	$$
Cursor	Все	Форк VS Code с AI-агентами	$$
Codeium	Все	Бесплатный	Free
Tabnine	Все	On-premise, приватность	$$
Amazon Q Developer	Java, Python, JS	AWS-интеграция	$$
Sourcegraph Cody	Все	Кодовая база целиком	$$
Replit Ghostwriter	Python, JS	In-browser	$
Windsurf (Codeium)	Все	Агентный режим	$$
Aider	Python	CLI, git-native	Free
Continue.dev	Все	Open source, локальный	Free
Qodo (Codium)	Все	Тесты	$$
Sweep AI	Python	PR-автоматизация	$$
Mutable AI	Все	Рефакторинг	$$
Blackbox AI	Все	Поиск сниппетов	Free/$
4.2. Детально по ассистентам
🥇 Claude (Anthropic) — основной
Модель: Sonnet 4.5 / Opus

Контекст: 200k токенов

Применение: Архитектура, микросервисы, сложная логика, ревью

Плюсы: Глубокое понимание, длинные файлы, объяснения

Минусы: Цена

Для проекта: Генерация сервисов NestJS, схем БД, K8s-манифестов

🥈 GitHub Copilot
Языки: Все

Применение: Inline-подсказки в VS Code

Плюсы: Быстро, привычно

Для проекта: Ускорение рутины

🥉 Cursor
Режим: Composer (мультифайл), Agent

Применение: Рефакторинг, фичи

Для проекта: Разработка микросервисов в одном окне

Специализированные
Ассистент	Лучший для
Qodo	Генерация unit-тестов (Jest, PyTest)
Aider	CLI-правки с git-коммитами
Continue	Локальная работа, приватность
Tabnine	Enterprise, offline
Sweep	Автоматические PR по issues
4.3. Рекомендуемый стек ассистентов
text
┌────────────────────────────────────────────┐
│  IDE: Cursor + Claude Sonnet 4.5           │
│  ├── Inline: GitHub Copilot               │
│  ├── Тесты: Qodo                          │
│  ├── CLI: Aider                           │
│  └── Ревью: Claude.ai (web)               │
└────────────────────────────────────────────┘
4.4. Правила использования (AI Policy)
Никакого секретного кода в публичные ассистенты.

Все сгенерированное — код-ревью человеком.

Тесты обязательны для AI-кода.

Лицензии — проверка на плагиат.

On-premise для продакшн-данных (Tabnine/Continue).

5. АССИСТЕНТЫ ДЛЯ MARKDOWN
5.1. Сводная таблица
Ассистент	Сильная сторона	Формат
Claude	Длинные документы, структура	MD, PDF
Notion AI	Базы знаний, wiki	Notion
Obsidian + Copilot	Локальные vault	MD
Markdown AI (VSCode)	Inline в редакторе	MD
Typora + AI	WYSIWYG	MD
HackMD AI	Collaborative	MD
Docusaurus + GPT	Документация	MD/MDX
MkDocs Material	Docs-as-code	MD
Readme.so	README-генератор	MD
DiagramGPT	Mermaid-диаграммы	MD/Mermaid
Mermaid Chart AI	Схемы	Mermaid
Grammarly	Вычитка	Any
5.2. Рекомендации для проекта
Артефакт	Ассистент	Формат
PRD	Claude	MD
ADR (Architecture Decision Records)	Claude + Obsidian	MD
API-документация	Swagger + Claude	OpenAPI YAML
Runbooks	Notion AI	Notion
Диаграммы	Mermaid Chart AI	Mermaid
README	Readme.so	MD
Changelog	Claude	MD
Wiki	MkDocs Material	MD
5.3. Шаблон документации (Doc-as-Code)
text
docs/
├── architecture/
│   ├── adr/
│   │   ├── 0001-use-microservices.md
│   │   ├── 0002-kafka-for-events.md
│   │   └── 0003-postgres-per-service.md
│   ├── diagrams/
│   │   └── c4-context.mmd
│   └── overview.md
├── api/
│   ├── openapi.yaml
│   └── auth.md
├── runbooks/
│   ├── deploy.md
│   ├── rollback.md
│   └── incident-response.md
└── mkdocs.yml
6. ТЕХНИЧЕСКИЕ СПЕЦИФИКАЦИИ
6.1. Нефункциональные требования
Категория	Требование
Доступность	99.9% SLA
Латентность API	p95 < 200ms
Пропускная способность	10k RPS на кластер
Масштабируемость	Горизонтальная, auto-scale
Данные	90 дней GPS, 3 года заявок
RPO	15 минут
RTO	1 час
Безопасность	TLS 1.3, AES-256, OWASP Top 10
Соответствие	152-ФЗ
6.2. Функциональные спеки (ключевые)
SPEC-001: Аутентификация
JWT access (15 мин) + refresh (30 дней)

OAuth 2.0 password grant

PIN-код (4 цифры, hash bcrypt)

Rate limit: 5 попыток / 15 мин

Блокировка после 10 неудач

SPEC-002: Заявки
Генерация ID: {type}_{YYYYMMDD}_{seq}

Статусная машина (строгая валидация переходов)

Автоматическое назначение по правилам

SLA: плановая — 24ч, аварийная — 5 мин

Эскалация при просрочке

SPEC-003: Фотофиксация
Форматы: JPEG, PNG, MP4 (30 сек)

Максимум: 10 МБ

Водяной знак: EXIF + overlay

Геометка обязательна

Сжатие на клиенте: quality 85%

SPEC-004: GPS-трекинг
Интервал: 15 сек (foreground), 60 сек (background)

Batch-отправка каждые 5 точек

Хранение: 90 дней

Геозона: 200м радиус

Точность: GPS + Wi-Fi + CellID

SPEC-005: Оффлайн-режим
Локальная БД: SQLite (Drift)

Синхронизация: при появлении сети

Очередь операций: FIFO

Разрешение конфликтов: last-write-wins + merge

Лимит: 500 МБ кэша

6.3. Спецификация данных
См. предыдущий документ (раздел 8).

7. API-КОНТРАКТЫ
7.1. Общие принципы
Стиль: REST + JSON

Версионирование: URL (/api/v1/)

Аутентификация: Bearer JWT

Формат ошибок: RFC 7807 (Problem Details)

Пагинация: cursor-based

Идемпотентность: Idempotency-Key для POST

7.2. Формат ответа
json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-09-02T10:00:00Z"
  }
}
7.3. Ошибки (RFC 7807)
json
{
  "type": "https://api.cleaningops.io/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Field 'deadline' must be in future",
  "instance": "/api/v1/tickets",
  "errors": [
    {"field": "deadline", "code": "past_date"}
  ]
}
7.4. Примеры контрактов
Auth Service
yaml
POST /api/v1/auth/login
  Body:
    email: string (required)
    password: string (required)
  Response 200:
    access_token: string
    refresh_token: string
    expires_in: 900
    user: {id, role, full_name}

POST /api/v1/auth/refresh
  Body:
    refresh_token: string
  Response 200: same as login
Ticket Service
yaml
POST /api/v1/tickets
  Headers:
    Authorization: Bearer {token}
    Idempotency-Key: uuid
  Body:
    type: enum[planned, unscheduled, emergency]
    priority: enum[low, normal, high, critical]
    object_id: uuid
    room_id: uuid
    description: string
    deadline: ISO8601
  Response 201:
    id: uuid
    status: new
    created_at: ISO8601

PATCH /api/v1/tickets/{id}/status
  Body:
    status: enum[...]
    comment: string (optional)
  Response 200:
    id: uuid
    status: string
    updated_at: ISO8601
Geo Service
yaml
POST /api/v1/geo/tracks
  Body:
    points: [
      {lat, lng, accuracy, timestamp}
    ]
  Response 202:
    accepted: integer
    rejected: integer

GET /api/v1/geo/users/{id}/last
  Response 200:
    lat: number
    lng: number
    accuracy: number
    timestamp: ISO8601
    in_geofence: boolean
7.5. Событийные контракты (Kafka)
yaml
# Topic: tickets.events
event: TicketCreated
  key: ticket_id
  value:
    ticket_id: uuid
    type: string
    object_id: uuid
    created_at: ISO8601

event: TicketStatusChanged
  value:
    ticket_id: uuid
    from: string
    to: string
    changed_by: uuid
    timestamp: ISO8601

event: EmergencyTicketCreated
  value:
    ticket_id: uuid
    location: {lat, lng}
    type: string
    urgency: high

# Topic: gps.events
event: GeofenceViolation
  value:
    user_id: uuid
    object_id: uuid
    direction: enum[enter, exit]
    timestamp: ISO8601
7.6. Соглашения об именовании
Элемент	Стиль	Пример
Endpoints	kebab-case, plural	/api/v1/tech-cards
Поля JSON	snake_case	created_at
Enum-значения	snake_case	in_progress
Event-топики	<domain>.events	tickets.events
Ошибки	<domain>.<code>	ticket.not_found
8. ИНФРАСТРУКТУРА
8.1. Целевая топология
text
                          ┌────────────────┐
                          │  Cloudflare    │
                          │  (CDN + WAF)   │
                          └────────┬───────┘
                                   │
                          ┌────────▼────────┐
                          │  Load Balancer  │
                          │  (NLB / ALB)    │
                          └────────┬────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       API Gateway           │
                    │  (Kong / Traefik / Envoy)   │
                    │  - Rate limiting            │
                    │  - Auth validation          │
                    │  - Routing                  │
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼────────┐      ┌──────────▼──────────┐    ┌──────────▼───────┐
│  K8s Cluster   │      │  K8s Cluster        │    │  K8s Cluster     │
│  (Region: RU)  │      │  (Region: RU)       │    │  (DR)            │
│  zone-a, b, c  │      │  zone-a, b, c       │    │  (Passive)       │
└───────┬────────┘      └──────────┬──────────┘    └──────────────────┘
        │                          │
        └──────────┬───────────────┘
                   │
        ┌──────────▼────────────┐
        │  Data Layer           │
        │  ┌──────────────────┐ │
        │  │ PostgreSQL HA    │ │
        │  │ (Patroni)        │ │
        │  └──────────────────┘ │
        │  ┌──────────────────┐ │
        │  │ Redis Cluster    │ │
        │  └──────────────────┘ │
        │  ┌──────────────────┐ │
        │  │ Kafka Cluster    │ │
        │  └──────────────────┘ │
        │  ┌──────────────────┐ │
        │  │ S3 / MinIO       │ │
        │  └──────────────────┘ │
        │  ┌──────────────────┐ │
        │  │ OpenSearch       │ │
        │  └──────────────────┘ │
        └───────────────────────┘
8.2. Kubernetes-слои
Слой	Компонент	Назначение
Ingress	NGINX Ingress / Traefik	Маршрутизация
Service Mesh	Istio / Linkerd	mTLS, observability
Config	ConfigMaps, Secrets (Vault)	Конфигурация
Autoscaling	HPA, VPA, KEDA	Масштабирование
Storage	CSI, Longhorn	Persistent volumes
Policy	OPA Gatekeeper	Security policies
8.3. Горизонтальное масштабирование
Уровни масштабирования
1. Stateless-сервисы (автоматически)

yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ticket-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ticket-service
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
2. Stateful-сервисы (шардирование)

Сервис	Стратегия
PostgreSQL	Patroni + read-replicas, шардинг по object_id
Redis	Redis Cluster (16k slots)
Kafka	Партиции по user_id, репликация 3
OpenSearch	Шарды по времени, ILM-политики
3. Очереди (KEDA)

yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: photo-processor-scaler
spec:
  scaleTargetRef:
    name: photo-processor
  minReplicaCount: 2
  maxReplicaCount: 50
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: photo-processors
        topic: photos.raw
        lagThreshold: "100"
8.4. Кэширование
Уровень	Технология	TTL	Что кэшируем
CDN	Cloudflare	1 год	Статика, изображения
API Gateway	Redis	60 сек	Публичные GET
Service	Redis	5 мин	Сессии, справочники
App	In-memory	30 сек	Hot data
DB	Materialized views	1 мин	Аналитика
8.5. Базы данных
PostgreSQL HA
text
┌────────────┐
│  Patroni   │
│  Cluster   │
├────────────┤
│  Primary   │ ← writes
│  (zone-a)  │
├────────────┤
│  Replica-1 │ ← reads (zone-b)
│  Replica-2 │ ← reads (zone-c)
├────────────┤
│  etcd x3   │ ← coordination
└────────────┘
Шардинг
По object_id для таблиц заявок, GPS.

По created_at для логов, событий.

Citus для распределённых запросов.

Бэкапы
Тип	Частота	Хранение	Куда
WAL	Непрерывно	7 дней	S3
Full	Ежедневно	30 дней	S3 (cross-region)
Логические	Еженедельно	90 дней	S3 Glacier
8.6. Сеть
VPC с private/public subnets.

NAT Gateway для исходящих.

VPN/WireGuard для админов.

Service Mesh (Istio) для mTLS между сервисами.

Network Policy — deny-by-default.

8.7. Безопасность
Слой	Меры
Edge	WAF, DDoS protection, rate limit
Network	mTLS, NetworkPolicy, private subnets
App	OAuth2, RBAC, input validation
Data	AES-256 at rest, TLS 1.3 in transit
Secrets	HashiCorp Vault, sealed secrets
Audit	Falco, audit logs
Compliance	152-ФЗ, ISO 27001 (цель)
8.8. Observability
text
┌─────────────────────────────────────────────┐
│           Observability Stack               │
├─────────────────────────────────────────────┤
│  Metrics:   Prometheus + Thanos + Grafana   │
│  Logs:      Loki + Promtail                 │
│  Traces:    Tempo + OpenTelemetry           │
│  Errors:    Sentry                          │
│  Alerts:    Alertmanager + PagerDuty        │
│  SLO:       Sloth / Pyrra                   │
└─────────────────────────────────────────────┘
Golden Signals
Сигнал	Метрика	Target
Latency	p95	< 200 ms
Traffic	RPS	baseline
Errors	5xx rate	< 0.1%
Saturation	CPU/Mem	< 70%
8.9. CI/CD
yaml
# GitLab CI pipeline (упрощённо)
stages:
  - lint
  - test
  - build
  - scan
  - deploy-staging
  - e2e
  - deploy-prod

variables:
  DOCKER_BUILDKIT: "1"

lint:
  script:
    - npm run lint
    - npm run typecheck

test:
  script:
    - npm run test:unit -- --coverage
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'

build:
  script:
    - docker build -t $CI_REGISTRY/$SERVICE:$CI_SHA .
    - docker push $CI_REGISTRY/$SERVICE:$CI_SHA

scan:
  script:
    - trivy image $CI_REGISTRY/$SERVICE:$CI_SHA
    - snyk test

deploy-staging:
  script:
    - helm upgrade --install $SERVICE ./charts/$SERVICE
        --namespace staging
        --set image.tag=$CI_SHA

e2e:
  script:
    - newman run postman/e2e.json

deploy-prod:
  when: manual
  script:
    - argocd app sync $SERVICE-prod
GitOps: ArgoCD для прод-деплоя (declarative, self-healing).

8.10. Disaster Recovery
Метрика	Значение
RPO	15 минут
RTO	1 час
Регион DR	Passive standby
Репликация БД	Async streaming
Репликация S3	Cross-region
Тесты DR	Ежеквартально
План:

Обнаружение (мониторинг).

Активация runbook.

Переключение DNS на DR.

Промоут реплики БД.

Валидация.

Уведомление клиентов.

8.11. Стоимость (оценка)
Компонент	Dev/Staging	Prod	Итого/мес
K8s (managed)	$300	$1500	$1800
PostgreSQL HA	$200	$800	$1000
Redis	$50	$300	$350
Kafka	$100	$500	$600
S3 + CDN	$50	$400	$450
Observability	$100	$400	$500
Backup	$50	$200	$250
Итого	$850	$4100	~$5k/мес
9. МИКРОСЕРВИСНАЯ АРХИТЕКТУРА
9.1. Общая диаграмма (C4 Context)
text
┌────────────────────────────────────────────────────────────────┐
│                         USERS                                   │
│  [Оператор] [Бригадир] [Админ] [Клиент]                         │
└──────────────────┬─────────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Mobile / Web      │
        │   (Flutter / React) │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │    API Gateway      │
        │  (Kong / Traefik)   │
        └──────────┬──────────┘
                   │
    ┌──────────────┼──────────────────────────────────┐
    │              │                                  │
┌───▼───┐  ┌───────▼────────┐  ┌────────▼───────┐  ┌─▼──────┐
│ Auth  │  │  Object Svc    │  │ Ticket Svc     │  │ Geo Svc│
└───┬───┘  └───────┬────────┘  └────────┬───────┘  └─┬──────┘
    │              │                     │            │
    │     ┌────────┼─────────────────────┼────────────┤
    │     │        │                     │            │
┌───▼─────▼──┐ ┌───▼──────┐  ┌──────────▼──┐  ┌──────▼──────┐
│ TechCard   │ │ Material │  │  Schedule   │  │   Chat      │
└──────┬─────┘ └────┬─────┘  └──────┬──────┘  └──────┬──────┘
       │            │                │                 │
       └────────────┴────────┬───────┴─────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Kafka Bus     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐        ┌────▼────┐
   │Notifier │         │ Analytics │        │ Audit   │
   └─────────┘         └───────────┘        └─────────┘
9.2. Каталог сервисов
#	Сервис	Ответственность	Язык	БД	Масштабирование
1	API Gateway	Маршрутизация, auth, rate limit	Kong/Envoy	Redis	Гориз.
2	Auth Service	Аутентификация, JWT, RBAC	NestJS	Postgres	Гориз.
3	User Service	Профили, роли, команды	NestJS	Postgres	Гориз.
4	Object Service	Объекты, этажи, помещения	NestJS	Postgres+PostGIS	Гориз.
5	Route Service	Маршруты, точки	NestJS	Postgres	Гориз.
6	TechCard Service	Техкарты, операции	NestJS	Postgres	Гориз.
7	Ticket Service	Заявки, статусы	NestJS	Postgres	Шардинг
8	Photo Service	Загрузка, обработка, водяные знаки	Go	Postgres + S3	Гориз. + KEDA
9	Geo Service	GPS, геозоны	Go	PostGIS + Redis	Шардинг
10	Material Service	Склад, расход	NestJS	Postgres	Гориз.
11	Schedule Service	График, check-in/out	NestJS	Postgres	Гориз.
12	Chat Service	Чат, WebSocket	Node + Socket.io	Postgres + Redis	Гориз. (sticky)
13	Notification Service	Push, Email, SMS	Go	Postgres	Гориз. + KEDA
14	Analytics Service	Отчёты, KPI	Python (FastAPI)	ClickHouse	Гориз.
15	Audit Service	Логи действий	Go	Postgres + OpenSearch	Гориз.
16	File Service	S3-обёртка	Go	S3	Гориз.
17	Search Service	Полнотекстовый поиск	Go	OpenSearch	Гориз.
9.3. Детально по ключевым сервисам
Auth Service
text
┌─────────────────────────────────────┐
│         Auth Service                │
├─────────────────────────────────────┤
│  Endpoints:                         │
│   POST /auth/login                  │
│   POST /auth/refresh                │
│   POST /auth/logout                 │
│   POST /auth/pin                    │
│   GET  /auth/me                     │
│                                     │
│  Хранит:                            │
│   - users (credentials)             │
│   - refresh_tokens                  │
│   - pin_codes                       │
│                                     │
│  Публикует:                         │
│   - user.logged_in                  │
│   - user.logged_out                 │
│                                     │
│  Зависит от:                        │
│   - Redis (blacklist tokens)        │
└─────────────────────────────────────┘
Ticket Service
text
┌─────────────────────────────────────┐
│        Ticket Service               │
├─────────────────────────────────────┤
│  Endpoints:                         │
│   POST   /tickets                   │
│   GET    /tickets                   │
│   GET    /tickets/{id}              │
│   PATCH  /tickets/{id}/status       │
│   POST   /tickets/{id}/assign       │
│   POST   /tickets/emergency         │
│                                     │
│  Бизнес-логика:                     │
│   - Status Machine                  │
│   - Auto-assignment                 │
│   - SLA timer                       │
│   - Escalation                      │
│                                     │
│  Публикует:                         │
│   - ticket.created                  │
│   - ticket.status_changed           │
│   - ticket.emergency_created        │
│   - ticket.overdue                  │
│                                     │
│  Подписан:                          │
│   - gps.geofence_violation          │
│   - material.out_of_stock           │
│                                     │
│  Шардинг: по object_id              │
└─────────────────────────────────────┘
Geo Service
text
┌─────────────────────────────────────┐
│          Geo Service                │
├─────────────────────────────────────┤
│  Endpoints:                         │
│   POST /geo/tracks                  │
│   GET  /geo/users/{id}/last         │
│   GET  /geo/users/{id}/history      │
│   POST /geo/geofences               │
│                                     │
│  Технологии:                        │
│   - PostGIS (пространственные)      │
│   - Redis (hot positions)           │
│   - Kafka (batch ingest)            │
│                                     │
│  Публикует:                         │
│   - gps.position_updated            │
│   - gps.geofence_enter              │
│   - gps.geofence_exit               │
│                                     │
│  Шардинг: по user_id                │
└─────────────────────────────────────┘
Photo Service
text
┌─────────────────────────────────────┐
│         Photo Service               │
├─────────────────────────────────────┤
│  Endpoints:                         │
│   POST /photos/upload               │
│   GET  /photos/{id}                 │
│   POST /photos/{id}/verify          │
│                                     │
│  Pipeline:                          │
│   1. Upload → S3 (raw)              │
│   2. Kafka: photos.raw              │
│   3. Worker: watermark + resize     │
│   4. S3 (processed)                 │
│   5. Kafka: photos.processed        │
│                                     │
│  Масштабирование: KEDA по Kafka-lag │
└─────────────────────────────────────┘
Notification Service
text
┌─────────────────────────────────────┐
│      Notification Service           │
├─────────────────────────────────────┤
│  Подписан на:                       │
│   - ticket.*                        │
│   - gps.geofence_*                  │
│   - material.out_of_stock           │
│   - schedule.missed                 │
│                                     │
│  Каналы:                            │
│   - FCM (push)                      │
│   - SMTP (email)                    │
│   - SMS-шлюз                        │
│   - WebSocket (in-app)              │
│                                     │
│  Хранит шаблоны, историю            │
│  Ретраи: exponential backoff        │
└─────────────────────────────────────┘
9.4. Коммуникации
Синхронные (REST/gRPC)
Клиент → API Gateway → Сервис

Сервис → Сервис (gRPC для скорости)

Таймауты: 3 сек

Circuit Breaker (Resilience4j / Polly)

Асинхронные (Kafka)
Domain events

Интеграция между сервисами

Event Sourcing (для Ticket)

CQRS (для Analytics)

Схема топиков
Топик	Партиции	Retention	Продюсер	Консьюмеры
tickets.events	12	7 дней	Ticket	Notifier, Analytics, Audit
gps.events	24	3 дня	Geo	Notifier, Analytics
photos.events	6	7 дней	Photo	Notifier, Analytics
materials.events	6	30 дней	Material	Ticket, Notifier, Analytics
schedule.events	6	30 дней	Schedule	Notifier, Analytics
audit.events	12	90 дней	Все	Audit
dlq.*	3	30 дней	—	Ops
Saga Pattern (для распределённых транзакций)
Пример: создание аварийной заявки

text
1. Ticket: create emergency ticket
   ↓
2. Geo: find nearest operators
   ↓
3. Notification: send push to found operators
   ↓
4. (компенсация) если никто не принял → escalate
9.5. Данные
Принцип: Database per Service
Сервис	БД	Схема
Auth	Postgres	auth
Object	Postgres+PostGIS	object
Ticket	Postgres	ticket
Geo	Postgres+PostGIS	geo
Analytics	ClickHouse	analytics
Audit	OpenSearch	audit-*
Синхронизация данных
События для межсервисных данных.

API Composition для чтения.

Materialized Views для отчётов.

CDC (Debezium) для аналитики.

9.6. Общие библиотеки (монорепо Nx)
text
libs/
├── shared/
│   ├── contracts/        # DTO, интерфейсы
│   ├── events/           # Kafka-схемы
│   ├── errors/           # Общие ошибки
│   └── utils/            # Хелперы
├── auth/
│   └── guards/           # JWT-гарды
├── logging/
│   └── logger/           # Структурные логи
└── observability/
    ├── metrics/          # Prometheus
    └── tracing/          # OpenTelemetry
9.7. Resilience-паттерны
Паттерн	Применение
Circuit Breaker	Все синхронные вызовы
Retry	Транзиентные ошибки (3 попытки)
Timeout	3 сек default, 10 сек для фото
Bulkhead	Изоляция пулов
Rate Limiter	На API Gateway
Fallback	Возврат кэша при недоступности
Idempotency	POST с Idempotency-Key
9.8. Безопасность между сервисами
mTLS через Istio.

Service Account для каждого сервиса.

OPA для policy-as-code.

Vault для секретов (динамические).

NetworkPolicy — whitelist.

9.9. Deployment-стратегия
Сервис	Стратегия
Stateless	Rolling update
Ticket	Blue-Green
Geo	Canary (5% → 50% → 100%)
Photo	Rolling + KEDA
Feature Flags: LaunchDarkly / Unleash.

9.10. Anti-patterns — чего избегаем
Anti-pattern	Как избегаем
Distributed monolith	Автономные сервисы, async
Shared DB	Database per Service
Chatty services	Batch, gRPC streaming
Sync everywhere	Kafka для не-критичных
No versioning	Semver + contract tests
9.11. Contract Testing
Pact для consumer-driven контрактов.

OpenAPI валидация в CI.

Schema Registry (Avro) для Kafka.

9.12. Service Mesh (Istio) — возможности
Возможность	Применение
mTLS	Шифрование между сервисами
Traffic shifting	Canary deploy
Fault injection	Chaos engineering
Retries/Timeouts	Declarative
Observability	Auto-traces
📎 ПРИЛОЖЕНИЯ
A. Глоссарий
См. предыдущий документ.

B. Ссылки
12 Factor App

Microservices.io

C4 Model

Cloud Native Patterns

C. Версии документов
Версия	Дата	Изменения
1.0	02.09.2026	Первоначальный
1.1	TBD	Дизайн-система
1.2	TBD	Инфраструктура