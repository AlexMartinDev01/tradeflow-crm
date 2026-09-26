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
RUN node --check apps/api/server.mjs
COPY --from=web-builder /src/apps/web/dist ./apps/web/dist
RUN mkdir -p /data /app/uploads && chown -R node:node /app /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/api/server.mjs"]
