# ──────────────────────────────────────────────────────
# Thribus Worker — Dockerfile na raiz para Coolify/Railway
# Build context = repo root.
# ──────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifests do worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci

# Copia código
COPY worker/tsconfig.json ./
COPY worker/src ./src

RUN npm run build

# ─── runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN addgroup -S worker && adduser -S worker -G worker
USER worker

ENV PORT=3200
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
