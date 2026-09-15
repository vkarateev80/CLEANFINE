# material-service (М4.1–М4.2). Сборка из корня монорепозитория:
# docker build -f backend/material-service/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app

COPY backend/material-service/package.json ./backend/material-service/package.json
COPY shared/package.json ./shared/package.json
RUN cd backend/material-service && npm install --no-package-lock --no-audit --no-fund

COPY shared ./shared
COPY backend/material-service ./backend/material-service
RUN cd shared && npm run build --if-present
RUN cd backend/material-service && \
    node node_modules/prisma/build/index.js generate && \
    node node_modules/@nestjs/cli/bin/nest.js build

FROM node:20-alpine
WORKDIR /app/backend/material-service
ENV NODE_ENV=production
COPY --from=build /app/backend/material-service/node_modules ./node_modules
COPY --from=build /app/backend/material-service/dist ./dist
COPY --from=build /app/backend/material-service/prisma ./prisma
EXPOSE 3007
CMD ["node", "dist/main.js"]
