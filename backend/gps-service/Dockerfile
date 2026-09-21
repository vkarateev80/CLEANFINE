# gps-service (М3.1–М3.2).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/gps-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ обязан сохранять раскладку монорепо (backend/gps-service + shared/dist).
#
#   docker build -f backend/gps-service/Dockerfile -t cleaning-ops/gps-service .
#
# ЕДИНЫЙ ПАТТЕРН для всех девяти backend-сервисов (System Design v2,
# ADR-8 / D-3). Ключевое отличие от прежнего варианта: контракты
# @cleaning-ops/shared кладутся РЕАЛЬНОЙ КОПИЕЙ пакета в
# node_modules/@cleaning-ops/shared, а не только в /repo/shared/dist.
#
#   tsc НЕ переписывает paths: эмит commonjs сохраняет bare-спецификатор
#   require("@cleaning-ops/shared/types/core"), а Node резолвит
#   bare-спецификаторы только через node_modules. Поэтому:
#     * shared/dist в /repo/shared/dist нужен ТОЛЬКО на этапе компиляции
#       (его требует paths из tsconfig);
#     * для рантайма пакет копируется в node_modules/@cleaning-ops/shared
#       (package.json + dist) и уезжает в финальный образ внутри node_modules.
#   Вместе с условиями require/default в shared/package.json (D-2) это даёт
#   рабочий require("@cleaning-ops/shared/constants/events") без
#   ERR_PACKAGE_PATH_NOT_EXPORTED.
#
# Перед docker build контракты обязаны быть собраны на хосте: pnpm build:shared
# (shared/dist — артефакт сборки, в git его нет).
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
# Контракты для КОМПИЛЯЦИИ — ровно туда, куда указывает paths в tsconfig.
COPY shared/dist /repo/shared/dist
COPY shared/package.json /repo/shared/package.json
# Контракты для РАНТАЙМА: реальная копия пакета в node_modules/@cleaning-ops/shared.
# Без неё `node dist/main.js` падает на require("@cleaning-ops/shared/...").
RUN mkdir -p node_modules/@cleaning-ops/shared \
 && cp /repo/shared/package.json node_modules/@cleaning-ops/shared/package.json \
 && cp -a /repo/shared/dist node_modules/@cleaning-ops/shared/dist
RUN npm run build

# Runtime-стадия. Раскладка монорепо (/repo/...) сохранена для читаемости путей,
# но рантайм-резолв контрактов идёт из node_modules/@cleaning-ops/shared —
# копия /repo/shared/dist в финальный образ БОЛЬШЕ НЕ НУЖНА (ADR-8).
FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /repo/backend/gps-service
ENV NODE_ENV=production
# node_modules уже содержит @cleaning-ops/shared (package.json + dist) — см. builder.
COPY --from=builder /repo/backend/gps-service/node_modules ./node_modules
COPY --from=builder /repo/backend/gps-service/dist ./dist
COPY --from=builder /repo/backend/gps-service/prisma ./prisma
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3004
# Собственного health-эндпоинта нет (в src только доменные контроллеры), поэтому
# проверяем живость по защищённому ресурсу: глобальный JwtAuthGuard отвечает 401
# без токена — этого достаточно (любой ответ < 500 означает, что HTTP-сервер поднят).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.GPS_SERVICE_PORT)||3004,path:'/api/gps/tracks'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты).
CMD ["node", "dist/main.js"]
