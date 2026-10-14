# CLEANFINE — Kubernetes (М7.5)

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
| `traefik-config.yaml` | HelmChartConfig встроенного traefik: `externalTrafficPolicy: Local` — реальный адрес клиента для rate limit; копируется на узел в `/var/lib/rancher/k3s/server/manifests/`, не `kubectl apply` |
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

## Сборка образов на боевом хосте (14.10.2026)

Обычный `docker build` занимал все 4 ядра и диск: пробы живости не успевали,
kubelet перезапускал postgres и сервисы (exit 137), HPA раздувал реплики.
Поэтому на vps2 создан builder с жёстким лимитом — два ядра из четырёх,
низкий приоритет CPU, 3 ГБ памяти:

```bash
docker buildx create --name cf-limited --driver docker-container \
  --driver-opt cpuset-cpus=2-3 --driver-opt cpu-shares=256 --driver-opt memory=3g --bootstrap
```

Собирать ТОЛЬКО через него (`--load` кладёт образ в локальный docker, дальше
`docker save | k3s ctr images import -` как раньше):

```bash
docker buildx build --builder cf-limited --load -f backend/core-service/Dockerfile \
  -t cleaning-ops/core:latest .
docker buildx build --builder cf-limited --load -f deploy/vps/Dockerfile.web \
  --build-arg APP=web-operator --build-arg VITE_BASE=/app/ -t cleaning-ops/web-operator:latest .
```

Сборка идёт дольше, зато сервисы не падают. Пробы у всех деплойментов —
timeoutSeconds 5 / failureThreshold 5 (`kubectl patch`, то же в манифестах).

## Сборка образов на Mac (15.10.2026) — основной способ

Сборка на хосте даже через `cf-limited` довела сервер до жёсткого сброса
(14.10 21:55, журнал обрывается без shutdown). Поэтому образы собираются на
Mac (colima с Rosetta: `colima start --vz-rosetta --cpu 6 --memory 8`,
`brew install docker-buildx`) и уезжают сжатым потоком:

```bash
deploy/vps/build-local.sh 1015-markers web-admin          # один образ
deploy/vps/build-local.sh 1015-all core tickets web-operator
NO_ROLLOUT=1 deploy/vps/build-local.sh <тег> <образы>     # только собрать и импортировать
```

Скрипт сам собирает `shared/dist`, делает `docker buildx build --platform linux/amd64`,
`docker save | zstd | ssh vps2 'zstd -d | k3s ctr images import -'` и
`kubectl rollout restart`. Админка собирается ~9 мин, отправка 30 МБ — ~30 с при 1,8 МБ/с.
На сервере `docker build` больше не запускать.

После сброса 14.10 бэкенд-сервисы не успевали подняться за время liveness
(20 с) при одновременном старте 17 подов и перезапускались по кругу — у 9 сервисов
и ntfy выставлено `livenessProbe.initialDelaySeconds: 120`, `failureThreshold: 6`
(`kubectl patch`; в манифестах backend.yaml liveness не описан — добавить при
следующем `kubectl apply`, иначе значения откатятся).
