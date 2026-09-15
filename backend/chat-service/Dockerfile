# chat-service (М5.1–М5.2). Сборка из корня монорепозитория:
# docker build -f backend/chat-service/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app

COPY backend/chat-service/package.json ./backend/chat-service/package.json
COPY shared/package.json ./shared/package.json
RUN cd backend/chat-service && npm install --no-package-lock --no-audit --no-fund

COPY shared ./shared
COPY backend/chat-service ./backend/chat-service
RUN cd shared && npm run build --if-present
RUN cd backend/chat-service && \
    node node_modules/prisma/build/index.js generate && \
    node node_modules/@nestjs/cli/bin/nest.js build

FROM node:20-alpine
WORKDIR /app/backend/chat-service
ENV NODE_ENV=production
COPY --from=build /app/backend/chat-service/node_modules ./node_modules
COPY --from=build /app/backend/chat-service/dist ./dist
COPY --from=build /app/backend/chat-service/prisma ./prisma
EXPOSE 3009
CMD ["node", "dist/main.js"]
