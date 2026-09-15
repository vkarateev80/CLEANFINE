# gps-service (М3.1–М3.2).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/gps-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ должен сохранять раскладку монорепо (backend/gps-service + shared/dist).
# Перед сборкой контракты обязаны быть собраны: pnpm build:shared
#
#   docker build -f backend/gps-service/Dockerfile -t cleaning-ops/gps-service .
#
# Примечание: пока нет pnpm-lock.yaml в сервисе — npm; при появлении lock перейти
# на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /repo/backend/gps-service
COPY backend/gps-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/gps-service/tsconfig.json backend/gps-service/nest-cli.json ./
COPY backend/gps-service/prisma ./prisma
RUN npx prisma generate
COPY backend/gps-service/src ./src
# Собранные контракты — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
RUN npm run build

# Runtime-стадия сохраняет раскладку монорепо (/repo/...): tsc резолвит
# @cleaning-ops/shared/* в относительный путь ../../../../shared/dist/*, поэтому
# shared/dist обязан лежать на своём месте и в финальном образе — иначе
# `node dist/main.js` упадёт на require('../../../../shared/dist/constants/events').
# PostGIS-расширение и миграции применяются отдельно: npx prisma migrate deploy.
FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /repo/backend/gps-service
ENV NODE_ENV=production
COPY --from=builder /repo/backend/gps-service/node_modules ./node_modules
COPY --from=builder /repo/backend/gps-service/dist ./dist
COPY --from=builder /repo/backend/gps-service/prisma ./prisma
COPY --from=builder /repo/shared/dist /repo/shared/dist
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3004
# Собственного health-эндпоинта нет (в src только доменные контроллеры), поэтому
# проверяем живость по защищённому ресурсу: глобальный JwtAuthGuard отвечает 401
# без токена — этого достаточно (любой ответ < 500 означает, что HTTP-сервер поднят).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.GPS_SERVICE_PORT)||3004,path:'/api/gps/tracks'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
