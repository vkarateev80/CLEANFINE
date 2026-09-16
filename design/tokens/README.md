# 🎨 Дизайн-токены Cleaning Ops (DS-001, М1.1)

Единый источник дизайна для всех платформ: Web Admin, Web Client, Mobile (Flutter).

## Структура

```
design/
├── tokens/
│   ├── colors.json        # Палитра: primary 50–900, success/warning/danger/info, neutral
│   ├── typography.json    # Inter / JetBrains Mono, размеры xs–4xl, веса, межстрочные
│   ├── spacing.json       # База 4px + шкала xs–4xl
│   ├── shadows.json       # 4 уровня: sm/md/lg/xl
│   ├── borderRadius.json  # sm/md/lg/xl + full
│   ├── generated/         # ← артефакты (генерируются, в git)
│   │   ├── tokens.css     # CSS-переменные
│   │   ├── pubspec.yaml   # пакет cleaning_ops_tokens (единственный неруками сгенерированный файл)
│   │   └── lib/
│   │       └── app_tokens.dart # Константы Flutter (Color-ints и размеры)
│   └── README.md
└── scripts/
    └── generate.mjs       # генератор
```

## Использование

1. **Правка токенов** — только в JSON-файлах (`design/tokens/*.json`).
2. **Перегенерация:**

   ```bash
   node design/scripts/generate.mjs
   ```

3. **Web (CSS):** подключить `design/tokens/generated/tokens.css`; использовать переменные:

   ```css
   color: var(--color-primary-600);
   padding: var(--spacing-lg);
   box-shadow: var(--shadow-md);
   border-radius: var(--radius-md);
   font-size: var(--text-base);
   ```

   Tailwind-маппинг (`web-admin`) выполняется в М1.5 поверх этих переменных.

4. **Mobile (Flutter):** каталог `generated/` подключается как path-зависимость `cleaning_ops_tokens`
   (так у токенов один источник на web и mobile), импорт — `package:cleaning_ops_tokens/app_tokens.dart`;
   цвета — `Color(AppColors.primary500)`. `ThemeData` собирается в приложении:
   `mobile/cleaning-ops-app/lib/core/theme/app_theme.dart` (М6.0).

## Примечания (решения архитектора, М1.1)

- Устав задаёт значения цветов и типографики дословно; отступы/тени/скругления заданы только уровнем («4px base grid», «4 уровня») — числовые значения приняты в JSON (см. `note` в файлах).
- `ThemeData` Flutter собирается в М6 (генератор в М1.1 выдаёт константы — SDK Flutter на машине появится к М6).
