# file-service (М2.9).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/file-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ должен сохранять раскладку монорепо (backend/file-service + shared/dist).
# Перед сборкой контракты обязаны быть собраны: pnpm build:shared
#
#   docker build -f backend/file-service/Dockerfile -t cleaning-ops/file-service .
#
# Примечание: пока нет pnpm-lock.yaml в сервисе — npm; при появлении lock перейти
# на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /repo/backend/file-service
COPY backend/file-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/file-service/tsconfig.json backend/file-service/nest-cli.json ./
COPY backend/file-service/prisma ./prisma
RUN npx prisma generate
COPY backend/file-service/src ./src
# Собранные контракты — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
RUN npm run build

# Runtime-стадия сохраняет раскладку монорепо (/repo/...): tsc резолвит
# @cleaning-ops/shared/* в относительный путь ../../shared/dist/*, поэтому
# shared/dist обязан лежать на своём месте и в финальном образе (у core-service
# из shared импортируются значения, а не только типы).
FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /repo/backend/file-service
ENV NODE_ENV=production
COPY --from=builder /repo/backend/file-service/node_modules ./node_modules
COPY --from=builder /repo/backend/file-service/dist ./dist
COPY --from=builder /repo/backend/file-service/prisma ./prisma
COPY --from=builder /repo/shared/dist /repo/shared/dist
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3002
# Существующий health-эндпоинт: GET /api/files/health/ping → 200 {status:'ok',minio:...}.
# Недоступность MinIO отдаётся тем же 200 (minio:'unavailable') — это осознанно:
# healthcheck подтверждает живость процесса, а не доступность S3.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.PORT)||3002,path:'/api/files/health/ping'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты).
CMD ["node", "dist/main.js"]
