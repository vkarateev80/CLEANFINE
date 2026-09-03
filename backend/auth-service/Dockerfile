# auth-service (М1.7). Контекст сборки: backend/auth-service.
# Примечание: пока нет pnpm-lock.yaml — npm; при появлении lock перейти на pnpm (устав).
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
RUN npm install --no-package-lock --no-audit --no-fund
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl tzdata
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
# Миграции применяются отдельно: npx prisma migrate deploy (инфра/скрипты)
CMD ["node", "dist/main.js"]
