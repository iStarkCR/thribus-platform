# ──────────────────────────────────────────────────────
# Thribus Worker — Multi-stage Dockerfile
# ──────────────────────────────────────────────────────

# ─── Stage 1: build ───────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifests primeiro para cache de layers
COPY package.json package-lock.json ./

RUN npm ci

# Copia código e tsconfig
COPY tsconfig.json ./
COPY src ./src

# Compila TypeScript
RUN npm run build

# ─── Stage 2: runtime ─────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Instala apenas deps de produção (sem typescript, tsx, etc.)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia o build pronto
COPY --from=builder /app/dist ./dist

# Usuário não-root
RUN addgroup -S worker && adduser -S worker -G worker
USER worker

# A aplicação escuta nesta porta (Coolify mapeia automaticamente)
ENV PORT=3200
EXPOSE 3200

# Healthcheck nativo do Docker (Coolify também tem o seu, fica em duplicidade leve)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
