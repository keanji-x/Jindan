// ============================================================
// DaoEventSystem — 天象异变 / 天道随机事件
//
// 纯被动 System: 无主动 Action，每 tick 有概率触发随机天象事件。
// 所有事件严格遵守粒子守恒 — 只做 QL↔QS 转化或 实体↔天地 转移。
//
// 事件池:
//   1. 煞气狂潮 — QL→QS 转化 (30% ambient QL)
//   2. 灵气狂潮 — QS→QL 转化 (30% ambient QS)
//   3. 灵泉涌现 — ambient → 众生 转移 (5% total)
//   4. 煞气迷雾 — 众生 core → ambient poison 转移 (5% each)
//   5. 天劫降临 — 高境界者 → ambient 转移 (30% qi)
// ============================================================

import { UNIVERSE } from "../config/universe.config.js";
import type { GameSystem, WorldTickContext } from "./GameSystem.js";

/** 天象事件触发概率（每 tick） */
const EVENT_CHANCE = 0.08;

interface DaoEvent {
  id: string;
  name: string;
  emoji: string;
  weight: number;
  execute: (ctx: WorldTickContext) => void;
}

// ── 事件定义 ───────────────────────────────────────────────

const daoEvents: DaoEvent[] = [
  {
    id: "sha_qi_surge",
    name: "煞气狂潮",
    emoji: "🌑",
    weight: 3,
    execute: (ctx) => {
      const pool = ctx.ambientPool;
      // 将环境中 30% 的灵气转化为煞气
      const qlAmount = pool.pools.ql ?? 0;
      const converted = Math.floor(qlAmount * 0.3);
      if (converted > 0) {
        pool.pools.ql = (pool.pools.ql ?? 0) - converted;
        pool.pools.qs = (pool.pools.qs ?? 0) + converted;
        ctx.events.emit({
          tick: ctx.tick,
          type: "system_warning",
          data: { event: "sha_qi_surge", converted },
          message: `🌑 天象异变！煞气狂潮涌来，${converted} 灵气被转化为煞气`,
        });
      }
    },
  },
  {
    id: "ling_qi_surge",
    name: "灵气狂潮",
    emoji: "✨",
    weight: 3,
    execute: (ctx) => {
      const pool = ctx.ambientPool;
      // 将环境中 30% 的煞气转化为灵气
      const qsAmount = pool.pools.qs ?? 0;
      const converted = Math.floor(qsAmount * 0.3);
      if (converted > 0) {
        pool.pools.qs = (pool.pools.qs ?? 0) - converted;
        pool.pools.ql = (pool.pools.ql ?? 0) + converted;
        ctx.events.emit({
          tick: ctx.tick,
          type: "system_warning",
          data: { event: "ling_qi_surge", converted },
          message: `✨ 天降祥瑞！灵气狂潮席卷天地，${converted} 煞气被净化为灵气`,
        });
      }
    },
  },
  {
    id: "spirit_spring",
    name: "灵泉涌现",
    emoji: "🌊",
    weight: 2,
    execute: (ctx) => {
      // 从 ambient 的 qs 转移给所有存活实体的核心粒子
      const recipients = ctx.entities.filter(
        (e) => e.status === "alive" && e.species !== "dao" && e.components.tank,
      );
      if (recipients.length === 0) return;
      const total = UNIVERSE.totalParticles;
      const bonus = Math.floor(total * 0.05); // 5% of world total
      const perEntity = Math.floor(bonus / recipients.length);
      if (perEntity <= 0) return;

      for (const e of recipients) {
        const tank = e.components.tank!;
        const core = tank.coreParticle;
        const available = ctx.ambientPool.pools[core] ?? 0;
        const actual = Math.min(perEntity, available);
        if (actual > 0) {
          ctx.ambientPool.pools[core] = (ctx.ambientPool.pools[core] ?? 0) - actual;
          tank.tanks[core] = (tank.tanks[core] ?? 0) + actual;
        }
      }
      ctx.events.emit({
        tick: ctx.tick,
        type: "system_warning",
        data: { event: "spirit_spring", bonus, perEntity, recipients: recipients.length },
        message: `🌊 灵泉涌现！天地灵力回馈众生，每位生灵获得约 ${perEntity} 灵气`,
      });
    },
  },
  {
    id: "sha_mist",
    name: "煞气迷雾",
    emoji: "🌫️",
    weight: 2,
    execute: (ctx) => {
      // 所有存活实体损失少量核心粒子（转为毒素进入环境）
      const victims = ctx.entities.filter(
        (e) => e.status === "alive" && e.species !== "dao" && e.components.tank,
      );
      if (victims.length === 0) return;

      let totalDamage = 0;
      for (const e of victims) {
        const tank = e.components.tank!;
        const core = tank.coreParticle;
        const poison = core === "ql" ? "qs" : "ql";
        const qi = tank.tanks[core] ?? 0;
        const damage = Math.floor(qi * 0.05); // 5% of current qi
        if (damage > 0) {
          tank.tanks[core] = (tank.tanks[core] ?? 0) - damage;
          ctx.ambientPool.pools[poison] = (ctx.ambientPool.pools[poison] ?? 0) + damage;
          totalDamage += damage;
        }
      }

      if (totalDamage > 0) {
        ctx.events.emit({
          tick: ctx.tick,
          type: "system_warning",
          data: { event: "sha_mist", totalDamage, victims: victims.length },
          message: `🌫️ 煞气迷雾弥漫！众生中毒，共损失 ${totalDamage} 灵气`,
        });
      }
    },
  },
  {
    id: "heaven_wrath",
    name: "天劫降临",
    emoji: "⚡",
    weight: 1,
    execute: (ctx) => {
      // 优先选占比 > 2× proportionLimit 的实体，否则随机选高境界者
      const candidates = ctx.entities.filter(
        (e) =>
          e.status === "alive" &&
          e.species !== "dao" &&
          e.components.tank &&
          (e.components.cultivation?.realm ?? 1) >= 3,
      );
      if (candidates.length === 0) return;

      const overLimitEntities = candidates.filter((e) => {
        const tank = e.components.tank!;
        const qi = tank.tanks[tank.coreParticle] ?? 0;
        const reactor = UNIVERSE.reactors[e.species];
        if (!reactor) return false;
        const limit = reactor.proportionLimit(e.components.cultivation?.realm ?? 1);
        return qi / UNIVERSE.totalParticles > limit * UNIVERSE.tribulationThreshold;
      });

      const pool = overLimitEntities.length > 0 ? overLimitEntities : candidates;
      const target = pool[Math.floor(Math.random() * pool.length)]!;

      const tank = target.components.tank!;
      const core = tank.coreParticle;
      const qi = tank.tanks[core] ?? 0;
      const damage = Math.floor(qi * 0.3); // 30% of qi

      if (damage > 0) {
        tank.tanks[core] = (tank.tanks[core] ?? 0) - damage;
        ctx.ambientPool.pools[core] = (ctx.ambientPool.pools[core] ?? 0) + damage;
      }

      ctx.events.emit({
        tick: ctx.tick,
        type: "system_warning",
        data: {
          event: "heaven_wrath",
          target: { id: target.id, name: target.name },
          damage,
        },
        message: `⚡ 天劫降临！「${target.name}」大道显圣，${damage > 0 ? `损失 ${damage} 灵气` : "安然渡劫"}`,
      });
    },
  },
];

// ── 加权随机选择 ──────────────────────────────────────────────

function pickWeightedEvent(): DaoEvent {
  const totalWeight = daoEvents.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const event of daoEvents) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return daoEvents[0]!;
}

// ── System Export ──────────────────────────────────────────────

export const DaoEventSystem: GameSystem = {
  id: "dao_events",
  name: "天象异变",
  actions: [], // 纯被动系统
  onTick: (context) => {
    // ── Deterministic trigger: extreme over-proportion → 天劫 ──
    const extremeEntities = context.entities.filter((e) => {
      if (e.status !== "alive" || e.species === "dao" || !e.components.tank) return false;
      const tank = e.components.tank;
      const qi = tank.tanks[tank.coreParticle] ?? 0;
      const reactor = UNIVERSE.reactors[e.species];
      if (!reactor) return false;
      const limit = reactor.proportionLimit(e.components.cultivation?.realm ?? 1);
      return qi / UNIVERSE.totalParticles > limit * UNIVERSE.tribulationThreshold;
    });

    if (extremeEntities.length > 0) {
      // Force heaven_wrath on each extreme entity
      const heavenWrath = daoEvents.find((e) => e.id === "heaven_wrath")!;
      heavenWrath.execute(context);
      return; // Skip random event this tick
    }

    // ── Random probability gate ──
    if (Math.random() > EVENT_CHANCE) return;

    const event = pickWeightedEvent();
    event.execute(context);
  },
};
