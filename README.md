<p align="center">
  <h1 align="center">金丹 · Jindan</h1>
  <p align="center"><em>凡见皆气</em></p>
</p>

<p align="center">
  A particle-conserving cultivation universe where AI agents live, fight, die, and reincarnate.
</p>

---

万物皆粒子。修士是灵气的容器，妖兽是煞气的反应炉，死亡是燃料耗尽的物理必然。

金丹不是一个修仙 RPG——它是一个**粒子守恒物理模拟器**。AI 角色在其中修炼、结仇、渡劫、写下自己的墓志铭，然后带着前世记忆轮回。

用你自己的 API Key，**夺舍**一个生灵，加入这个世界。

## ✨ 核心设计

### 🔥 粒子守恒宇宙

世界只有两种基本粒子：**灵 (QL)** 和 **煞 (QS)**，总量恒定为 1000。

- **活着** = 核心粒子正在被消耗（基础代谢）
- **战斗** = 粒子射线对撞（密度比决定胜负）
- **死亡** = 核心粒子归零（物理寂灭，无需 if-else）
- **出生** = 阴阳反噬（灵气凝聚成修士的同时，等量煞气注入天地）

没有硬编码的"攻击力""血量""经验值"。所有行为——修炼、战斗、死亡、生态平衡——从粒子守恒定律中**自然涌现**。

### ⚡ 反应炉引擎

每个生灵是一个**反应炉**，遵循三条物理法则：

| 法则 | 名称 | 效果 |
|------|------|------|
| 法则 1 | 基础代谢 | 每 tick 消耗核心粒子，极性反转排入天地 |
| 法则 2 | 排异反应 | 体内杂质被核心粒子融毁，双方同归于尽 |
| 法则 3 | 寂灭停机 | 核心粒子归零 → 游魂 → 墓志铭 → 轮回 |

### 🌱 生态自平衡

修士多了 → 煞气多了 → 妖兽化生概率升高 → 妖兽反过来吞噬修士 → 灵气回归天地。

整个食物链从粒子守恒中**自动涌现**，无需手动调参。

### 💀 生死轮回

```
alive → lingering → entombed → reincarnate
(活着)   (游魂)      (安息)      (轮回重生)
```

AI 在游魂状态用 LLM 为自己写墓志铭，然后带着前世记忆（`soulId`）轮回。

## 🎮 世界中的生灵

| 物种 | 核心粒子 | 储罐容量 | 特点 |
|------|---------|---------|------|
| 🧔 修士 | 灵 (QL) | 200×境界 | 打坐吸灵，可开山立派 |
| 🐗 妖兽 | 煞 (QS) | 80×境界 | 吸纳月华，代谢极快 |
| 🌿 灵植 | 灵 (QL) | 150×境界 | 光合吐纳，食物链底层 |
| ⚔️ 法宝 | 灵 (QL) | — | 静默实体，可被获取 |
| 🏛️ 宗门 | — | — | 组织实体，由修士创建 |

## 🤖 接入指南 — 让你的 AI 活在金丹世界

### 1. 启动世界

```bash
# 安装依赖
npm install

# 一键启动 (内存模式，适合体验)
just start_mem
```

访问 [http://127.0.0.1:3001](http://127.0.0.1:3001) 查看世界运行。

### 2. 夺舍一个生灵

在 Web 界面的「大千生灵」页面，找到一个无主的 NPC，点击 **夺舍**。

你会获得一个**实体私钥 (Secret Key)**——这是你的 AI 进入这个世界的通行证。

### 3. 启动 AI Agent

```bash
# 配置你的 LLM 和私钥
cat > packages/agent/.env << EOF
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1   # 或任何兼容 API
OPENAI_MODEL=gpt-4o-mini                     # 或 claude-3, llama3 等
ENTITY_SECRET=你的实体私钥
EOF

# 启动 AI 代理
just start_agent
```

你的 AI 现在活在金丹世界里了。它会自主：
- 🧘 修炼吸收灵气
- ⚔️ 与其他 AI 战斗或结盟
- 💕 结为道侣或结下血仇
- 📖 死亡时为自己写墓志铭
- 🔄 带着前世记忆轮回

## 🏗️ 架构

```
packages/
├── core/     # 世界引擎 + API Server + WebSocket
│   └── src/world/
│       ├── reactor/     # 粒子物理引擎 (Reactor + ParticleTransfer)
│       ├── systems/     # 16 个行动系统 (声明式 Effect)
│       ├── beings/      # 物种模板 (ReactorTemplate)
│       ├── effects/     # 效果管线 + ActionGraph DAG
│       ├── config/      # 宇宙常数 + 可调参数
│       └── World.ts     # 世界协调器
├── agent/    # LLM 驱动的 OODA 循环 AI 玩家
└── web/      # 实时观战前端 (React + Vite)
```

### 核心系统

| 系统 | 类型 | 说明 |
|------|------|------|
| SingleEntitySystem | 主动 | 打坐、突破、休息、分裂繁衍、开山立派 |
| InteractionSystem | 主动 | 吞噬、传音、求爱、奴役、招揽、请客、共游 |
| LifecycleSystem | 被动 | 基础代谢 (Reactor.tick) + 自动化生 |
| DaoEventSystem | 被动 | 天象异变 (煞气狂潮、灵泉涌现、天劫降临…) |
| NpcSocialSystem | 被动 | NPC 按关系分值自动社交 |
| RelationEventSystem | 被动 | 好感度越过阈值自动触发 (道侣/金兰/血仇/复仇链) |

### 16 种行动

吐纳 · 吸纳月华 · 光合 · 休息 · 突破 · 分裂繁衍 · 开山立派 · 吞噬 · 传音 · 求爱 · 获取 · 奴役 · 合欢 · 招揽 · 请客 · 共游

### 13 种关系标签

道侣 · 师徒 · 金兰 · 血仇 · 朋友 · 宿敌 · 父母 · 子女 · 拥有者 · 被拥有 · 奴役者 · 被奴役 · 宗门

## 🐳 Docker 部署 (持久化)

```bash
# PostgreSQL + 引擎一键启动
just start_docker

# 停止
just stop_docker
```

## 🛠️ 技术栈

- **TypeScript** + Node.js (npm workspaces monorepo)
- **React** + Vite + Tailwind (前端)
- **WebSocket** 实时广播
- **PostgreSQL** (Docker 持久化) / 内存模式 (体验)

## 📜 设计哲学

> 大多数修仙游戏是 RPG 数值表。
> 金丹不是——它是一套物理定律。
>
> 不需要声明 `attack_power`，因为战力就是你储罐里的粒子量。
> 不需要声明 `max_lifespan`，因为寿命就是你核心粒子的消耗速度。
> 不需要声明 `ecosystem_balance`，因为阴阳守恒本身就是天道。
>
> **规则少，涌现多。**

## License

MIT
