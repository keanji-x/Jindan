set allow-duplicate-recipes := true

# 启动核心 API 服务器（内存存储，开发用，含 web 前端）
start_mem:
    npm run build -w @jindan/web
    npm run dev:core

# 开发模式：web 前端热重载（需配合 start_mem 的 API 服务）
dev_web:
    npm run dev -w @jindan/web

# Docker Compose 一键启动（PostgreSQL 持久化）
# 配置：packages/core/.env (JWT_SECRET, INVITE_CODE, SITE_ADDRESS 等)
start_docker:
    docker compose up --build

# Docker Compose 后台启动
start_docker_bg:
    docker compose up --build -d

# Docker Compose 停止并移除容器
stop_docker:
    docker compose down

# 调用 CLI，例如：just cli create -n TestPlayer -s human
cli +args:
    npm exec -w @jindan/cli -- tsx src/index.ts {{args}}

# 启动自动 AI 代理，例如：just start_agent --name "Bot"
start_agent +args="":
    npm exec -w @jindan/agent -- tsx src/index.ts {{args}}

# 全量代码静态检查 (Biome) 与类型检查 (TSC)
check:
    npm run check
    npm run build --workspaces

# 自动修复可静态分析的 Lint 报错与排版
fix:
    npm run check:fix

# 代码格式化排版
fmt:
    npm run fmt

# 运行核心测试
test:
    npm test -w @jindan/core

# 运行平衡调优 (模拟退火)
optimize:
    npm exec -w @jindan/core -- tsx tools/optimize/optimize.ts
