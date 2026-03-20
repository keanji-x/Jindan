# ============================================================
# Jindan — 修仙世界模拟器 Docker 镜像
# Multi-stage build: builder → runner
# ============================================================

# ── Stage 1: Builder ───────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/agent/package.json packages/agent/
COPY packages/web/package.json packages/web/

# Install all dependencies (including devDependencies for build)
RUN npm ci --workspace=@jindan/core --workspace=@jindan/cli --workspace=@jindan/agent --workspace=@jindan/web --include-workspace-root

# Copy source code
COPY tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/cli/ packages/cli/
COPY packages/agent/ packages/agent/
COPY packages/web/ packages/web/

# Build TypeScript
RUN npm run build -w @jindan/core
# Build web frontend (Vite)
RUN npm run build -w @jindan/web

# ── Stage 2: Runner ────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/agent/package.json packages/agent/
COPY packages/web/package.json packages/web/

RUN npm ci --workspace=@jindan/core --workspace=@jindan/cli --workspace=@jindan/agent --workspace=@jindan/web --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/tsconfig.base.json ./

# Copy web built static files (served by ApiServer)
COPY --from=builder /app/packages/web/dist packages/web/dist

# Create logs directory
RUN mkdir -p logs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "packages/core/dist/server.js"]
