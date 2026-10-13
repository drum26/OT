# ---- сборка
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build && npm prune --omit=dev

# ---- выполнение
FROM node:22-alpine
WORKDIR /app
# pg_dump той же основной версии, что и сервер PostgreSQL (для резервного копирования из интерфейса)
RUN apk add --no-cache openssl postgresql16-client tini \
 && addgroup -S ot && adduser -S ot -G ot
ENV NODE_ENV=production
COPY --from=build --chown=ot:ot /app/node_modules ./node_modules
COPY --from=build --chown=ot:ot /app/dist ./dist
COPY --from=build --chown=ot:ot /app/prisma ./prisma
COPY --from=build --chown=ot:ot /app/package.json ./package.json
COPY --chown=ot:ot docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/storage/uploads /app/storage/backups && chown -R ot:ot /app/storage
USER ot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
