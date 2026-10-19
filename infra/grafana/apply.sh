#!/usr/bin/env bash
# Grafana CLEANFINE (19.10.2026): роль Postgres только для чтения, источники данных
# и панели «CLEANFINE — работа» / «CLEANFINE — сервисы», правила алертов.
# Запуск с Mac из корня репозитория: bash infra/grafana/apply.sh [--alertmanager]
#   --alertmanager — ещё и helm upgrade стека kps (маршрут тревог на телефон из
#   infra/k8s/monitoring-values.yaml); без флага стек не трогаем.
# Идемпотентно. Пароль роли и топик тревог создаются один раз и живут в секретах
# monitoring/grafana-ro-postgres и monitoring/alertmanager-ntfy — не в репозитории.
set -euo pipefail

SSH_HOST="${SSH_HOST:-vps2}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

remote() { ssh -o ConnectTimeout=20 "$SSH_HOST" "$@"; }

echo "==> пароль роли grafana_ro"
PW="$(remote 'kubectl -n monitoring get secret grafana-ro-postgres -o jsonpath="{.data.password}" 2>/dev/null | base64 -d' || true)"
if [[ -z "$PW" ]]; then
  PW="$(openssl rand -hex 24)"
  remote "kubectl -n monitoring create secret generic grafana-ro-postgres --from-literal=password=$PW" >/dev/null
  echo "    создан"
else
  echo "    уже есть"
fi

psql_in() { remote "kubectl -n cleaning-ops exec -i postgres-0 -- psql -U admin -d $1 -v ON_ERROR_STOP=1 -q ${2:-}"; }

echo "==> роль и права в Postgres"
psql_in cleaning_ops "-v pw=$PW" < "$HERE/grafana-ro.sql" >/dev/null
for db in cleaning_ops_schedule cleaning_ops_tickets cleaning_ops_core; do
  psql_in "$db" < "$HERE/grafana-ro-db.sql" >/dev/null
  echo "    $db"
done

echo "==> источники данных Grafana (Secret с меткой grafana_datasource=1)"
ds() {
  cat <<YAML
      - name: "$1"
        uid: $2
        type: grafana-postgresql-datasource
        access: proxy
        url: postgres.cleaning-ops.svc.cluster.local:5432
        user: grafana_ro
        editable: false
        jsonData:
          database: $3
          sslmode: disable
          postgresVersion: 1600
          maxOpenConns: 5
          timeInterval: 1m
        secureJsonData:
          password: $PW
YAML
}
{
  cat <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: grafana-ds-cleanfine
  namespace: monitoring
  labels:
    grafana_datasource: "1"
    app.kubernetes.io/part-of: cleaning-ops
stringData:
  cleanfine-datasources.yaml: |
    apiVersion: 1
    datasources:
YAML
  ds "CLEANFINE · смены" cf-pg-schedule cleaning_ops_schedule
  ds "CLEANFINE · заявки" cf-pg-tickets cleaning_ops_tickets
  ds "CLEANFINE · объекты" cf-pg-core cleaning_ops_core
  ds "CLEANFINE · сотрудники" cf-pg-auth cleaning_ops
} | remote "kubectl apply -f -" >/dev/null
echo "    cf-pg-schedule, cf-pg-tickets, cf-pg-core, cf-pg-auth"

echo "==> панели (ConfigMap с меткой grafana_dashboard=1)"
for file in "$HERE"/dashboards/*.json; do
  name="grafana-dashboard-$(basename "$file" .json)"
  # ConfigMap собираем python-ом: kubectl на Mac не нужен. JSON — строкой в data.
  python3 - "$file" "$name" <<'PY' | remote "kubectl apply -f -" >/dev/null
import json, os, sys
path, name = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    body = fh.read()
json.loads(body)  # битый JSON не уезжает на сервер
print(json.dumps({
    "apiVersion": "v1",
    "kind": "ConfigMap",
    "metadata": {
        "name": name,
        "namespace": "monitoring",
        "labels": {"grafana_dashboard": "1", "app.kubernetes.io/part-of": "cleaning-ops"},
    },
    "data": {os.path.basename(path): body},
}, ensure_ascii=False))
PY
  echo "    $name"
done

echo "==> правила алертов"
remote "kubectl apply -f -" < "$ROOT/infra/k8s/monitoring.yaml" >/dev/null
echo "    infra/k8s/monitoring.yaml"

echo "==> канал тревог на телефон (ntfy)"
TOPIC="$(remote 'kubectl -n monitoring get secret alertmanager-ntfy -o jsonpath="{.data.topic}" 2>/dev/null | base64 -d' || true)"
[[ -n "$TOPIC" ]] || TOPIC="cf-alerts-$(openssl rand -hex 8)"
# Русский шаблон ntfy: заголовок — summary тревоги, текст — description по каждой;
# снятая тревога приходит с «✅ Решено».
QUERY="$(python3 - <<'PY'
from urllib.parse import urlencode
title = '{{if eq .status "resolved"}}✅ Решено: {{else}}🚨 {{end}}{{or .commonAnnotations.summary .groupLabels.alertname}}'
message = '{{range .alerts}}{{if eq .status "resolved"}}✅ {{else}}• {{end}}{{or .annotations.description .annotations.summary}}\n{{end}}'
print(urlencode({"template": "yes", "title": title, "message": message, "priority": "high", "tags": "cleanfine"}))
PY
)"
URL="http://ntfy.cleaning-ops.svc.cluster.local:8080/$TOPIC?$QUERY"
python3 - "$TOPIC" "$URL" <<'PY' | remote "kubectl apply -f -" >/dev/null
import json, sys
topic, url = sys.argv[1], sys.argv[2]
print(json.dumps({
    "apiVersion": "v1", "kind": "Secret",
    "metadata": {"name": "alertmanager-ntfy", "namespace": "monitoring",
                 "labels": {"app.kubernetes.io/part-of": "cleaning-ops"}},
    "stringData": {"topic": topic, "url": url},
}))
PY
echo "    топик в секрете monitoring/alertmanager-ntfy (ключ topic)"

if [[ "${1:-}" == "--alertmanager" ]]; then
  echo "==> helm upgrade kps (Alertmanager: маршрут notify=phone → ntfy)"
  scp -q "$ROOT/infra/k8s/monitoring-values.yaml" "$SSH_HOST:/tmp/cf-monitoring-values.yaml"
  VERSION="$(remote "helm list -n monitoring -o json" | python3 -c 'import json,sys; print([r for r in json.load(sys.stdin) if r["name"] == "kps"][0]["chart"].rsplit("-", 1)[1])')"
  remote "helm upgrade kps prometheus-community/kube-prometheus-stack --version $VERSION -n monitoring \
    -f /tmp/cf-monitoring-values.yaml -f /root/monitoring-values-secret.yaml --wait --timeout 5m >/dev/null \
    && rm -f /tmp/cf-monitoring-values.yaml && echo '    kube-prometheus-stack $VERSION обновлён'"
fi

echo "ГОТОВО: https://cleanfine.ru/grafana/ → Dashboards → «CLEANFINE — работа», «CLEANFINE — сервисы»"
