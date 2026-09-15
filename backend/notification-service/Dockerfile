# notification-service (М3.3).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/notification-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ должен сохранять раскладку монорепо (backend/notification-service + shared/dist).
# Перед сборкой контракты обязаны быть собраны: pnpm build:shared
#
#   docker build -f backend/notification-service/Dockerfile -t cleaning-ops/notification-service .
#
# Примечание: пока нет pnpm-lock.yaml в сервисе — npm; при появлении lock перейти
# на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /repo/backend/notification-service
COPY backend/notification-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/notification-service/tsconfig.json backend/notification-service/nest-cli.json ./
COPY backend/notification-service/prisma ./prisma
RUN npx prisma generate
COPY backend/notification-service/src ./src
# Собранные контракты — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
RUN npm run build

# Runtime-стадия сохраняет раскладку монорепо (/repo/...): tsc резолвит
# @cleaning-ops/shared/* в относительный путь ../../../../shared/dist/*, поэтому
# shared/dist обязан лежать на своём месте и в финальном образе — иначе
# `node dist/main.js` упадёт на require('../../../../shared/dist/constants/events').
FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /repo/backend/notification-service
ENV NODE_ENV=production
COPY --from=builder /repo/backend/notification-service/node_modules ./node_modules
COPY --from=builder /repo/backend/notification-service/dist ./dist
COPY --from=builder /repo/backend/notification-service/prisma ./prisma
COPY --from=builder /repo/shared/dist /repo/shared/dist
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3006
# Живость: защищённый ресурс под глобальным JwtAuthGuard отвечает 401 без токена —
# любой ответ < 500 означает, что HTTP-сервер поднят и приложение инициализировано.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.NOTIFICATION_SERVICE_PORT)||3006,path:'/api/notifications'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты).
CMD ["node", "dist/main.js"]
