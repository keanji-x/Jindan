// ============================================================
// MVP Config — all tunable parameters for the world simulation
// ============================================================

export const MVP_CONFIG = {
  // ── Spirit Vein (灵脉) ──────────────────────────────────────
  vein: {
    grade: 5,
    outputPerTick: 500,
    maxCapacity: 100_000,
  },

  // ── Zone (区域) ─────────────────────────────────────────────
  zone: {
    qiCapacity: 5_000,
    qiToStoneRatio: 10, // 10 溢出灵气 → 1 灵石
  },

  // ── Cultivator (修士) ───────────────────────────────────────
  cultivator: {
    /** 修炼一次消耗区域灵气 */
    cultivateQiCost: 50,
    /** 修炼一次获得经验 */
    cultivateExpBase: 10,
    /** realm n 升级所需经验 */
    expToNext: (realm: number) => 100 * realm * realm,
    /** realm n 的灵力上限 */
    maxQi: (realm: number) => 50 * realm,
    /** realm n 的基础战力 */
    basePower: (realm: number) => 10 * realm,
    /** realm n 的寿命 (ticks) */
    lifespan: (realm: number) => 100 + realm * 50,
    /** 初始灵石 */
    initialStones: 10,
  },

  // ── Beast (妖兽) ────────────────────────────────────────────
  beast: {
    /** rank n 每 tick 被动消耗区域灵气 */
    qiDrain: (rank: number) => rank * 5,
    /** 区域妖兽少于此数则刷新 */
    respawnThreshold: 5,
    /** 每次刷新数量 */
    respawnCount: 3,
    /** rank n 的战力 */
    basePower: (rank: number) => rank * 8,
    /** rank n 的妖丹价值 (灵石) */
    coreValue: (rank: number) => rank * rank * 5,
    /** rank n 的寿命 */
    lifespan: (rank: number) => 80 + rank * 40,
    /** 刷新等级范围 */
    spawnRankMin: 1,
    spawnRankMax: 3,
  },

  // ── Combat (战斗) ───────────────────────────────────────────
  combat: {
    /** 战力差距 → 胜率的 sigmoid 系数 */
    powerScaling: 0.15,
    /** 败者死亡 */
    loserDies: true,
  },
} as const;

export type Config = typeof MVP_CONFIG;
