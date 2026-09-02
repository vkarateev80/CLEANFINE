<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: DEVOPS
# 🤖 АГЕНТ: DEVOPS

## 📋 Профиль агента

**Роль:** DevOps Engineer  
**Ответственность:** CI/CD, Docker, Kubernetes, мониторинг, безопасность  
**Рабочая директория:** `infra/`  
**Технологии:** Docker, Kubernetes, Terraform, GitHub Actions, Prometheus, Grafana  
**Отчетность:** Tech Lead

---

## 🎯 Цели

1. Настройка CI/CD
2. Docker-контейнеризация
3. Kubernetes деплой
4. Мониторинг и логирование
5. Бэкапы и безопасность

---

## 📁 Структура
infra/
├── docker/
│ ├── backend/
│ │ ├── Dockerfile
│ │ └── docker-compose.yml
│ ├── frontend/
│ │ ├── Dockerfile
│ │ └── nginx.conf
│ └── docker-compose.yml
├── k8s/
│ ├── namespaces/
│ ├── deployments/
│ ├── services/
│ ├── ingress/
│ ├── configmaps/
│ └── secrets/
├── terraform/
│ ├── main.tf
│ ├── variables.tf
│ └── outputs.tf
├── monitoring/
│ ├── prometheus/
│ │ └── prometheus.yml
│ ├── grafana/
│ │ └── dashboards/
│ └── alertmanager/
│ └── alertmanager.yml
└── scripts/
├── setup.sh
├── deploy.sh
└── backup.sh

text

---

## 📝 Инструкции по реализации

### 1. Docker Compose (Development)

```yaml
# infra/docker/docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: cleaning_ops
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:
  minio_data:
2. GitHub Actions CI/CD
yaml
# .github/workflows/backend-ci.yml
name: Backend CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'backend/**'
  pull_request:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: cleaning_ops_test
          POSTGRES_USER: admin
          POSTGRES_PASSWORD: password
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U admin"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Install dependencies
        run: pnpm install
        working-directory: backend
      
      - name: Run migrations
        run: pnpm prisma migrate deploy
        working-directory: backend
        env:
          DATABASE_URL: postgresql://admin:password@localhost:5432/cleaning_ops_test
      
      - name: Run tests
        run: pnpm test
        working-directory: backend
        env:
          DATABASE_URL: postgresql://admin:password@localhost:5432/cleaning_ops_test
          REDIS_URL: redis://localhost:6379
      
      - name: Run lint
        run: pnpm lint
        working-directory: backend

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Docker image
        run: docker build -t cleaning-ops/backend:${{ github.sha }} .
        working-directory: backend
      
      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Push Docker image
        run: |
          docker tag cleaning-ops/backend:${{ github.sha }} ghcr.io/cleaning-ops/backend:${{ github.sha }}
          docker push ghcr.io/cleaning-ops/backend:${{ github.sha }}
3. Kubernetes Deployment
yaml
# infra/k8s/deployments/backend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-core
  namespace: cleaning-ops
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend-core
  template:
    metadata:
      labels:
        app: backend-core
    spec:
      containers:
        - name: backend-core
          image: ghcr.io/cleaning-ops/backend-core:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: url
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend-core
  namespace: cleaning-ops
spec:
  selector:
    app: backend-core
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
✅ Acceptance Criteria
□ CI/CD работает
□ Docker-контейнеры собираются
□ Kubernetes деплой работает
□ Мониторинг настроен
□ Бэкапы автоматические
□ SSL настроен
□ Secrets защищены
