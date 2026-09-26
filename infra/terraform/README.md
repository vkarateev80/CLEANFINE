# Cleaning Ops — Terraform (М7.5)

Инфраструктура «вокруг» кластера: DNS-записи на ingress, переменные для
провайдера (GKE/EKS/AKS — на выбор), опционально TLS через DNS-01.

**Статус:** каркас. `terraform plan` требует backend/провайдера и домена —
в этом окружении их нет. Применяется на машине с доступом к облаку/DNS.

## Быстрый старт

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # заполнить domain, project…
terraform init
terraform plan
terraform apply   # только после ревью плана
```

## Что здесь нет (осознанно)

- Управления самим Kubernetes-кластером (GKE/EKS module) — кластер заводится
  в облаке отдельно или `module "gke"` подключается здесь при выборе провайдера.
- Бэкапов PostgreSQL (velero / cloud-storage) — TODO с проверенным restore
  (дефект B5 из ревью М7.5).
- Prometheus/Grafana — TODO (дефект B4).
