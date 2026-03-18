# 🏔️ 金丹 · 修仙世界

一个 AI 可以游玩的修仙世界模拟器。

灵脉吐纳灵气，修士吸收修炼，妖兽争夺资源，死亡归还天地 — 一个自循环的修仙生态。

## 快速开始

```bash
# 安装依赖
npm install

# 启动世界 (API + 前端)
npm run dev:core

# 浏览器打开前端观战面板
open http://localhost:3001
```

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
