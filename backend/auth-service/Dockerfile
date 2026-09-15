# auth-service (М1.7).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/auth-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ должен сохранять раскладку монорепо (backend/auth-service + shared/dist).
# Перед сборкой контракты обязаны быть собраны: pnpm build:shared
#
#   docker build -f backend/auth-service/Dockerfile -t cleaning-ops/auth-service .
#
# Примечание: пока нет pnpm-lock.yaml в сервисе — npm; при появлении lock перейти
# на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /repo/backend/auth-service
COPY backend/auth-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/auth-service/tsconfig.json backend/auth-service/nest-cli.json ./
COPY backend/auth-service/prisma ./prisma
RUN npx prisma generate
COPY backend/auth-service/src ./src
# Собранные контракты — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/backend/auth-service/node_modules ./node_modules
COPY --from=builder /repo/backend/auth-service/dist ./dist
COPY --from=builder /repo/backend/auth-service/prisma ./prisma
EXPOSE 3001
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты)
CMD ["node", "dist/main.js"]
