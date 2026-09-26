FROM node:22-alpine AS web-builder
WORKDIR /src/apps/web
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web ./
ENV VITE_API_URL=/api
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DB_FILE=/data/tradeflow.db \
    WEB_DIST=/app/apps/web/dist \
    UPLOAD_DIR=/app/uploads
COPY apps/api ./apps/api
RUN npm install --omit=dev --prefix apps/api
COPY scripts ./scripts
RUN node --check apps/api/server.mjs && node --check scripts/seed-full-demo.mjs
RUN set -eux; \
    NODE_ENV=development PORT=18080 DB_FILE=/tmp/seed-validation.db WEB_DIST=/tmp/no-web UPLOAD_DIR=/tmp/seed-uploads BACKUP_DIR=/tmp/seed-backups APP_SECRET=seed-validation-secret-2026 \
      node apps/api/server.mjs >/tmp/seed-server.log 2>&1 & \
    pid=$!; \
    sleep 3; \
    if ! kill -0 "$pid" 2>/dev/null; then cat /tmp/seed-server.log; exit 1; fi; \
    kill "$pid"; \
    wait "$pid" || true; \
    DB_FILE=/tmp/seed-validation.db node scripts/seed-full-demo.mjs; \
    rm -rf /tmp/seed-validation.db /tmp/seed-validation.db-shm /tmp/seed-validation.db-wal /tmp/seed-uploads /tmp/seed-backups /tmp/seed-server.log
COPY --from=web-builder /src/apps/web/dist ./apps/web/dist
RUN mkdir -p /data /app/uploads && chown -R node:node /app /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/api/server.mjs"]
