# Cleaning Ops — Kubernetes (М7.5)

Манифесты для продакшн-кластера: 9 NestJS-сервисов, 2 веб-фронтенда,
инфраструктура (PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO), Ingress + TLS.

> **Статус М7.5 по факту:** манифесты написаны, `kubectl apply --dry-run` — целевой
> способ проверки. Применение и прогоны восстановления выполняются на живом
> кластере (кластера/домена в этом окружении нет — см. `КОНТЕКСТ.md`).

## Структура

| Файл | Назначение |
|---|---|
| `namespace.yaml` | Namespace `cleaning-ops` |
| `configmap.yaml` | Несекретные URL сервисов, TTL, лимиты |
| `secrets.example.yaml` | Шаблон секретов (**не коммитить** заполненный) |
| `postgres.yaml` | StatefulSet + Service (PostGIS 16) |
| `redis.yaml` / `rabbitmq.yaml` / `minio.yaml` | Инфраструктура |
| `backend.yaml` | 9 Deployment + Service (auth…chat, :3001–:3009) |
| `web.yaml` | web-admin / web-client (nginx) |
| `ingress.yaml` | Ingress + cert-manager ClusterIssuer (TLS) |
| `networkpolicy.yaml` | Ограничение доступа к БД/брокеру только из своего ns |

## Применение

```bash
# 1. Секреты (один раз, значения — из менеджера секретов, не из git)
kubectl create namespace cleaning-ops
kubectl -n cleaning-ops create secret generic cleaning-ops-secrets \
  --from-literal=DB_PASSWORD='…' \
  --from-literal=JWT_ACCESS_SECRET='…' \
  --from-literal=JWT_REFRESH_SECRET='…' \
  --from-literal=RABBITMQ_PASSWORD='…' \
  --from-literal=MINIO_ROOT_USER='…' \
  --from-literal=MINIO_ROOT_PASSWORD='…' \
  --from-literal=SERVICE_AUTH_PASSWORD='…'

# 2. Проверка без применения
kubectl apply --dry-run=server -f infra/k8s/

# 3. Применение (после сборки и push образов)
kubectl apply -f infra/k8s/

# 4. Миграции (Job или exec)
kubectl -n cleaning-ops exec deploy/auth -- npx prisma migrate deploy
# … для каждого сервиса (см. scripts/ci/prisma-clients.mjs — migrate deploy в каталоге сервиса)
```

## Образы

Ожидаемые теги (меняются при деплое; registry задаётся в `configmap.yaml` /
переменных terraform):

```
<registry>/cleaning-ops/auth:<git-sha>
<registry>/cleaning-ops/files:…
… core, gps, tickets, notifications, materials, schedule, chat
<registry>/cleaning-ops/web-admin:<git-sha>
<registry>/cleaning-ops/web-client:<git-sha>
```

Сборка — по образцу `deploy/vps/Dockerfile.*` и `backend/*/Dockerfile`
(перед build: `pnpm build:shared`).

## Домен и TLS

- `ingress.yaml`: `host` из `configmap` / секрета cert-manager (`letsencrypt-prod`).
- DNS A/AAAA на ingress controller, `ClusterIssuer` cert-manager — на кластере.
- Без домена/кластера Ingress не применяется — это блокер М7.5 «вживую».

## Отличия от VPS compose

| VPS compose | k8s |
|---|---|
| 15 контейнеров + nginx | Deployments + Ingress |
| ports на tailnet | ClusterIP + Ingress |
| mem_limit/cpus | resources.requests/limits |
| json-file logging | cluster logging (по умолчанию k8s) |
