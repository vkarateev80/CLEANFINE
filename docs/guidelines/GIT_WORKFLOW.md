# 🌿 Git workflow Cleaning Ops

> Свод из УСТАВ.md (README → «Конвенции», Dash-правила → «Git workflow») + правил командной работы.

## Ветки

| Ветка | Назначение |
|---|---|
| `main` | production-ready код |
| `develop` | интеграционная ветка (рабочая) |
| `feature/{task-id}-{description}` | фичи (например `feature/M1-auth-login`) |
| `bugfix/{task-id}-{description}` | багфиксы |
| `release/{version}` | релизы (например `release/1.0.0`) |

## Коммиты (Conventional Commits)

- Типы: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- Тело: список изменений построчно (пример — в Dash-правилах устава).

```bash
git commit -m "feat: добавить создание заявки
- Реализовать форму создания заявки
- Добавить валидацию
- Написать тесты"
```

## Правила командной работы

- Каждый агент работает только в своей директории.
- Изменения `shared/` и контрактов (события, типы) — только с review архитектора.
- Все PR проходят CI.
- Code review обязателен для merge в `main`.
- Тесты проходят перед merge.

## PR-флоу

1. Ветка от `develop`: `git checkout -b feature/{task-id}-{description}`.
2. Коммиты по конвенции, мелкие и частые.
3. `gh pr create --title "feat: ..." --body "Closes #123"` (base: `develop`).
4. CI зелёный → code review → squash-merge в `develop`.
5. Фаза завершена → merge `develop` → `main` (release/крупные вехи).
