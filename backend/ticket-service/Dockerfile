# ticket-service (М3.4–М3.6).
#
# ВНИМАНИЕ: контекст сборки — КОРЕНЬ РЕПОЗИТОРИЯ (не backend/ticket-service).
# Причина: tsconfig маппит @cleaning-ops/shared/* в ../../shared/dist/*, поэтому
# образ обязан сохранять раскладку монорепо (backend/ticket-service + shared/dist).
#
#   docker build -f backend/ticket-service/Dockerfile -t cleaning-ops/ticket-service .
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
WORKDIR /repo/backend/ticket-service
COPY backend/ticket-service/package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY backend/ticket-service/tsconfig.json backend/ticket-service/nest-cli.json ./
COPY backend/ticket-service/prisma ./prisma
RUN npx prisma generate
COPY backend/ticket-service/src ./src
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
WORKDIR /repo/backend/ticket-service
ENV NODE_ENV=production
# node_modules уже содержит @cleaning-ops/shared (package.json + dist) — см. builder.
COPY --from=builder /repo/backend/ticket-service/node_modules ./node_modules
COPY --from=builder /repo/backend/ticket-service/dist ./dist
COPY --from=builder /repo/backend/ticket-service/prisma ./prisma
# non-root: в node:20-alpine уже есть пользователь node (uid 1000).
USER node
EXPOSE 3005
# Собственного health-эндпоинта нет: глобальный JwtAuthGuard отвечает 401 на
# защищённый ресурс — этого достаточно (ответ < 500 = HTTP-сервер и приложение живы).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:Number(process.env.TICKET_SERVICE_PORT)||3005,path:'/api/tickets'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты).
CMD ["node", "dist/main.js"]
