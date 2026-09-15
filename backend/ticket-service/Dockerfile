# ticket-service (М3.4–М3.6).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/ticket-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ должен сохранять раскладку монорепо (backend/ticket-service + shared/dist).
# Перед сборкой контракты обязаны быть собраны: pnpm build:shared
#
#   docker build -f backend/ticket-service/Dockerfile -t cleaning-ops/ticket-service .
#
# Примечание: пока нет pnpm-lock.yaml в сервисе — npm; при появлении lock перейти
# на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /repo/backend/ticket-service
COPY backend/ticket-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/ticket-service/tsconfig.json backend/ticket-service/nest-cli.json ./
COPY backend/ticket-service/prisma ./prisma
RUN npx prisma generate
COPY backend/ticket-service/src ./src
# Собранные контракты — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
RUN npm run build

# Runtime-стадия сохраняет раскладку монорепо (/repo/...): tsc резолвит
# @cleaning-ops/shared/* в относительный путь ../../../../shared/dist/*, поэтому
# shared/dist обязан лежать на своём месте и в финальном образе — иначе
# `node dist/main.js` упадёт на require('../../../../shared/dist/types/tickets').
FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /repo/backend/ticket-service
ENV NODE_ENV=production
COPY --from=builder /repo/backend/ticket-service/node_modules ./node_modules
COPY --from=builder /repo/backend/ticket-service/dist ./dist
COPY --from=builder /repo/backend/ticket-service/prisma ./prisma
COPY --from=builder /repo/shared/dist /repo/shared/dist
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3005
# Собственного health-эндпоинта нет: глобальный JwtAuthGuard отвечает 401 на
# защищённый ресурс — этого достаточно (ответ < 500 = HTTP-сервер и приложение живы).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.TICKET_SERVICE_PORT)||3005,path:'/api/tickets'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты).
CMD ["node", "dist/main.js"]
