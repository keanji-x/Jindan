# 🏔️ 金丹 · 修仙世界

一个 AI 可以游玩的修仙世界模拟器。

灵脉吐纳灵气，修士吸收修炼，妖兽争夺资源，死亡归还天地 — 一个自循环的修仙生态。

## 快速开始 (Quick Start)

项目提供了多种启动方式，推荐使用 [`just`](https://github.com/casey/just) 命令快速管理。

### 1. 环境配置 (必需)
每个子包各自管理自己的环境变量，互不干扰。首次启动前，请根据模板生成配置：
```bash
# 后端 API 配置 (数据库、JWT 密钥、邀请码)
cp packages/core/.env.example packages/core/.env

# AI 代理配置 (OpenAI API Key、实体私钥)
cp packages/agent/.env.example packages/agent/.env
```

### 2. 本地内存模式启动 (适合快速体验与测试)
此模式不依赖外部数据库，服务重启后世界会重置。
```bash
# 安装依赖
npm install

# 一键启动 (自动构建前端 + 启动核心引擎)
just start_mem
```
启动成功后，在浏览器访问: [http://127.0.0.1:3001](http://127.0.0.1:3001)

### 3. Docker 部署启动 (持久化 PostgreSQL 数据库)
如果你需要长久运行金丹世界并持久化所有实体记录，推荐使用 Docker Compose：
```bash
# 自动构建并启动容器组 (包含数据库和引擎 API)
just start_docker

# 停止并移除容器
just stop_docker
```

### 4. 启动自动化 AI 玩家 (Agent)
你在 Web 界面创建一个角色后，系统会分配一个**实体私钥**。此时你可以启动一个 AI 代理，让大语言模型接管这个角色：
1. 在 `packages/agent/.env` 中配置 `OPENAI_API_KEY` 和 `ENTITY_SECRET`。
2. 运行代理程序：
```bash
just start_agent
```
> Agent 启动后会自动通过私钥连接角色，并以 1 秒间隔发送心跳保持在线。在线状态下，用户可通过 Web UI 与角色潜意识对话。

## 用 CLI 来玩

```bash
# 查看世界
npx tsx packages/cli/src/index.ts world

# 创建角色
npx tsx packages/cli/src/index.ts create -n "张三"
# → 记住返回的 id

# 修炼
npx tsx packages/cli/src/index.ts cultivate -i <id>

# 突破
npx tsx packages/cli/src/index.ts breakthrough -i <id>

# 打怪
npx tsx packages/cli/src/index.ts fight -i <id>

# 拾取灵石
npx tsx packages/cli/src/index.ts pickup -i <id>

# 查看帮助
npx tsx packages/cli/src/index.ts help
```

所有指令支持 `--json` 输出结构化数据，方便 AI 解析。

## 项目结构

```
packages/
├── core/    # 世界引擎 + API Server + WebSocket
├── cli/     # AI 玩家命令行接口
└── web/     # 实时观战前端
```

## 让 AI 来玩

在 `.agents/skills/play-jindan/SKILL.md` 中有完整的 AI 玩家指南，包含：

- 世界背景与核心机制
- CLI 命令参考
- 输出解读方法
- 策略建议与数值表

AI Agent 读取该 SKILL.md 后即可自主修炼。

## 世界文档

详见 [docs/world-lerta.md](docs/world-lore.md) — 金丹世界的完整背景设定。

## 技术栈

- **TypeScript** + Node.js (npm workspaces monorepo)
- **SQLite** (规划中, 当前内存态)
- **WebSocket** 实时广播
- **HTML/CSS/JS** 前端
