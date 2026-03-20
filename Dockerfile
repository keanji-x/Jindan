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

# Install all dependencies (including devDependencies for build)
RUN npm ci --workspace=@jindan/core --workspace=@jindan/cli --workspace=@jindan/agent --include-workspace-root

# Copy source code
COPY tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/cli/ packages/cli/
COPY packages/agent/ packages/agent/
COPY packages/web/ packages/web/

# Build TypeScript
RUN npm run build -w @jindan/core

# ── Stage 2: Runner ────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/agent/package.json packages/agent/

RUN npm ci --workspace=@jindan/core --workspace=@jindan/cli --workspace=@jindan/agent --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/tsconfig.base.json ./

# Copy web static files (served by ApiServer)
COPY packages/web/ packages/web/

# Create logs directory
RUN mkdir -p logs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "packages/core/dist/server.js"]
