// ============================================================
// BeingLedger — 生灵账本 (Being Conservation Ledger)
//
// 与 ParticleTransfer（粒子守恒）对称的生灵守恒层。
// 纯函数查询器 — 不存储状态，每次从外部数据实时计算。
//
// 职责:
//   • capacity  — 灵气密度 → 世界最大承载力
//   • canAcquire — 全局位格 + 物种配额守门
//   • acquire   — 为 SpawnSystem 决定化生物种 + 轮回候选
// ============================================================

import type { ReactorTemplate } from "../config/types.js";
import { UNIVERSE } from "../config/universe.config.js";
import type { AmbientPool, Entity } from "../types.js";

/** acquire 返回的化生指令 */
export interface AcquireResult {
  /** 应化生的物种 */
  species: string;
  /** 如果复用已有亡灵，返回其 entityId；否则 undefined 表示全新诞生 */
  reincarnateFrom?: string;
}

function ambientTotal(pool: AmbientPool): number {
  let sum = 0;
  for (const v of Object.values(pool.pools)) sum += v;
  return sum;
}

export const BeingLedger = {
  // ── 位格计算 ────────────────────────────────────────────

  /**
   * 世界当前最大承载力 = 灵气密度 × 容量因子。
   * 灵气充沛 → 万物化生；灵气枯竭 → 天地荒芜。
   */
  capacity(ambientPool: AmbientPool, totalParticles: number): number {
    const density = ambientTotal(ambientPool) / Math.max(totalParticles, 1);
    return Math.max(1, Math.floor(density * UNIVERSE.ecology.maxEntities));
  },

  // ── 守门 ────────────────────────────────────────────────

  /**
   * 某物种能否新增一个实体？
   * 玩家创建角色和 SpawnSystem 化生前都应调用此方法。
   */
  canAcquire(
    species: string,
    aliveEntities: Entity[],
    ambientPool: AmbientPool,
    totalParticles: number,
  ): boolean {
    // 1. 全局位格检查
    if (aliveEntities.length >= this.capacity(ambientPool, totalParticles)) {
      return false;
    }

    // 2. 物种配额检查 (maxInstances)
    const reactor = UNIVERSE.reactors[species];
    if (reactor?.maxInstances !== undefined) {
      const count = aliveEntities.filter((e) => e.species === species).length;
      if (count >= reactor.maxInstances) return false;
    }

    return true;
  },

  // ── 化生决策 ─────────────────────────────────────────────

  /**
   * 请求化生一个生灵。地府决定物种和是否轮回。
   *
   * 算法:
   *   1. 位格检查 — 存活数 ≥ 承载力则拒绝
   *   2. 遍历可自动化生物种（有 npcNames 的）
   *   3. 按各物种 coreParticle 在环境中的占比算生态权重
   *   4. 权重 × 缺口 → 加权排序，选出最优物种
   *   5. entombed 池中找同物种候选 → 轮回优先
   */
  acquire(
    ambientPool: AmbientPool,
    aliveEntities: Entity[],
    deadEntities: Entity[],
    totalParticles: number,
  ): AcquireResult | null {
    const cap = this.capacity(ambientPool, totalParticles);
    if (aliveEntities.length >= cap) return null;

    const total = ambientTotal(ambientPool);
    if (total < 20) return null; // 灵气稀薄，不足以化生

    // 收集可自动化生的物种及其权重
    const candidates: { generatorId: string; derivedReactor: ReactorTemplate; weight: number }[] =
      [];

    for (const [id, generator] of Object.entries(UNIVERSE.generators || {})) {
      if (!generator.canDerive(ambientPool.pools, total)) continue;

      const derivedReactor = generator.derive(ambientPool.pools, total);
      if (!derivedReactor.npcNames || derivedReactor.npcNames.length === 0) continue;

      // maxInstances 配额检查
      if (derivedReactor.maxInstances !== undefined) {
        const count = aliveEntities.filter((e) => e.species === derivedReactor.id).length;
        if (count >= derivedReactor.maxInstances) continue;
      }

      // 生态权重 = 该物种核心粒子在环境中的占比
      const coreParticle = derivedReactor.coreParticle || "ql";
      const coreAmount = ambientPool.pools[coreParticle] ?? 0;
      let weight = coreAmount / Math.max(total, 1);

      if (weight <= 0) weight = 0.01; // Allow a minimum chance if canDerive is true

      // 需要足额初生代价支付化生
      const cost = derivedReactor.baseTanks(1)[coreParticle] ?? 50;
      if (coreAmount < cost) continue;

      candidates.push({ generatorId: id, derivedReactor, weight });
    }

    if (candidates.length === 0) return null;

    // 按权重比例随机选择物种（加权抽签）
    const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = candidates[0]!;
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) {
        chosen = c;
        break;
      }
    }

    const { derivedReactor } = chosen;

    // 如果这是一个新物种（或变异物种），注册到运行时的 Universe 中
    if (!UNIVERSE.reactors[derivedReactor.id]) {
      UNIVERSE.reactors[derivedReactor.id] = derivedReactor;
      // The World.ts flush() process will automatically persist newly registered reactors to StorageBackend.
    }

    // 轮回优先：在安息者中找同确切物种的候选
    const reincarnateCandidate = deadEntities.find(
      (e) => e.species === derivedReactor.id && e.status === "entombed",
    );

    return {
      species: derivedReactor.id,
      reincarnateFrom: reincarnateCandidate?.id,
    };
  },
};
