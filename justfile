set allow-duplicate-recipes := true

# 内存模式（开发用），例如：just mem run
mem cmd:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{cmd}}" in
        run) npm run build -w @jindan/web && DATABASE_URL=memory npm run dev:core ;;
        *)   echo "Usage: just mem [run]" && exit 1 ;;
    esac

# 开发模式：web 前端热重载（需配合 start_mem 的 API 服务）
dev_web:
    npm run dev -w @jindan/web

# Docker Compose 前台启动（PostgreSQL 持久化）
# 配置：packages/core/.env (JWT_SECRET, INVITE_CODE, SITE_ADDRESS 等)
docker cmd:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{cmd}}" in
        start)  docker compose up --build -d ;;
        run)    docker compose up --build ;;
        stop)   docker compose down ;;
        update) docker compose down && docker compose up --build -d ;;
        *)      echo "Usage: just docker [start|run|stop|update]" && exit 1 ;;
    esac

# 调用 CLI，例如：just cli snapshot
cli +args:
    npm run dev -w @jindan/cli -- {{args}}

# AI 代理，例如：just agent start --name "Bot"
agent cmd +args="":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{cmd}}" in
        start) npm run dev -w @jindan/agent -- {{args}} ;;
        *)     echo "Usage: just agent [start]" && exit 1 ;;
    esac

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
