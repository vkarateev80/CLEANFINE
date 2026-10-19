# Grafana CLEANFINE

https://cleanfine.ru/grafana/ — стек `kps` (kube-prometheus-stack, `infra/k8s/monitoring-values.yaml`).
Логин `admin`, пароль — в секрете:

```bash
ssh vps2 "kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo"
```

## Панели

- **CLEANFINE — работа** (`cf-work`): смены сегодня (по поясу организации из «Настроек»),
  на смене, неявки, опоздания, маршруты сегодня (операции/помещения/фото), заявки по дням,
  открытые заявки и SOS. Данные — Postgres, роль `grafana_ro` только на чтение
  (users — лишь id/имя/роль/активность; чаты, файлы, GPS недоступны).
- **CLEANFINE — сервисы** (`cf-services`): запросы, 5xx и p95 по входам Traefik
  (весь API — через «Админка + API»), реплики, CPU/память/перезапуски подов, диск и память сервера.

Правка: `build_dashboards.py` → `python3 infra/grafana/build_dashboards.py` →
`bash infra/grafana/apply.sh` (ConfigMap-ы подхватывает sidecar Grafana; правки в UI
затрутся при следующем apply).

## Тревоги на телефон

Правила с меткой `notify: phone` (`infra/k8s/monitoring.yaml`, группа `cleanfine.rules` и
`TraefikHigh5xxRate`) уходят push-ом через свой ntfy и дублируются письмом на hello@cleanfine.ru.
Подписка: приложение ntfy → сервер `https://cleanfine.ru/ntfy`, топик из секрета:

```bash
ssh vps2 "kubectl -n monitoring get secret alertmanager-ntfy -o jsonpath='{.data.topic}' | base64 -d; echo"
```

Маршрут Alertmanager меняется только через helm: `bash infra/grafana/apply.sh --alertmanager`.
