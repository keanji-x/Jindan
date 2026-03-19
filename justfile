set allow-duplicate-recipes := true

# 启动核心 API 服务器与 Web 界面
start:
    npm run dev:core

# 调用 CLI，例如：just cli create -n TestPlayer -s human
cli +args:
    npm exec -w @jindan/cli -- tsx src/index.ts {{args}}

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
