// ============================================================
// Universe Config — default binary QL/QS universe
//
// All game rules live here as pure data.
// The engine never hard-codes physics — it reads this.
// ============================================================

import type { UniverseConfig } from "./types.js";

export const UNIVERSE: UniverseConfig = {
  // ── Particles ──────────────────────────────────────────────
  particles: [
    { id: "ql", name: "灵", color: "#4fc3f7" },
    { id: "qs", name: "煞", color: "#ef5350" },
  ],

  // ── Equations (化学方程式) ──────────────────────────────────
  equations: {
    // 被动排毒: 1 QL(自身燃料) + 1 QS(入侵毒素) → 2 QS(废气)
    detox: {
      id: "detox",
      name: "排毒",
      input: { ql: 1, qs: 1 },
      output: { qs: 2 },
    },
    // 异类消化 (L吃S): 2 QL(消化火) + 10 QS(妖兽肉) → 10 QL(吸收) + 2 QS(废气)
    digest_cross_l: {
      id: "digest_cross_l",
      name: "异类消化(灵)",
      input: { ql: 2, qs: 10 },
      output: { ql: 10, qs: 2 },
    },
    // 异类消化 (S吃L): 2 QS(消化火) + 10 QL(修士肉) → 10 QS(吸收) + 2 QL(废气)
    digest_cross_s: {
      id: "digest_cross_s",
      name: "异类消化(煞)",
      input: { qs: 2, ql: 10 },
      output: { qs: 10, ql: 2 },
    },
    // 同类消化 (L吃L): 10 QL(人肉) → 2 QL(抢救) + 8 QS(废气)
    digest_same_l: {
      id: "digest_same_l",
      name: "同类相食(灵)",
      input: { ql: 10 },
      output: { ql: 2, qs: 8 },
    },
    // 同类消化 (S吃S): 10 QS(兽肉) → 2 QS(抢救) + 8 QL(废气)
    digest_same_s: {
      id: "digest_same_s",
      name: "同类相食(煞)",
      input: { qs: 10 },
      output: { qs: 2, ql: 8 },
    },
    // 日常代谢 (L型): 1 QL → 1 QS + 做功
    metabolize_l: {
      id: "metabolize_l",
      name: "代谢(灵)",
      input: { ql: 1 },
      output: { qs: 1 },
    },
    // 日常代谢 (S型): 1 QS → 1 QL + 做功
    metabolize_s: {
      id: "metabolize_s",
      name: "代谢(煞)",
      input: { qs: 1 },
      output: { ql: 1 },
    },
  },

  // ── Reactor Templates (反应炉模板) ─────────────────────────
  reactors: {
    human: {
      id: "human",
      name: "修士",
      coreParticle: "ql",
      baseTanks: (realm) => ({ ql: 100 * realm, qs: 0 }),
      basePower: (realm) => 10 * realm,
      baseDrainRate: 5,
      devourCrossEq: "digest_cross_l",
      devourSameEq: "digest_same_l",
      metabolismEq: "metabolize_l",
      actions: ["meditate", "devour", "breakthrough", "rest"],
    },
    beast: {
      id: "beast",
      name: "妖兽",
      coreParticle: "qs",
      baseTanks: (realm) => ({ qs: 80 * realm, ql: 0 }),
      basePower: (realm) => 12 * realm,
      baseDrainRate: 10,
      devourCrossEq: "digest_cross_s",
      devourSameEq: "digest_same_s",
      metabolismEq: "metabolize_s",
      actions: ["moonlight", "devour", "breakthrough", "rest"],
    },
    plant: {
      id: "plant",
      name: "灵植",
      coreParticle: "ql",
      baseTanks: (realm) => ({ ql: 150 * realm, qs: 0 }),
      basePower: (realm) => 4 * realm,
      baseDrainRate: 2,
      devourCrossEq: "digest_cross_l",
      devourSameEq: "digest_same_l",
      metabolismEq: "metabolize_l",
      actions: ["photosynth", "breakthrough", "rest"],
    },
  },

  // ── World Constants ────────────────────────────────────────
  totalParticles: 100_000,
  initialAmbientRatio: 0.9,
  initialBeasts: 5,
  initialPlants: 3,

  // ── Breakthrough ───────────────────────────────────────────
  breakthrough: {
    qiCostPerRealm: 50,
    baseSuccessRate: 0.1,
    maxSuccessRate: 0.8,
    failLossRatio: 0.5,
  },

  // ── Absorb (particles pulled from ambient per action) ──────
  absorb: {
    meditate: { base: 20, perRealm: 5 },
    moonlight: { base: 35, perRealm: 8 },
    photosynth: { base: 8, perRealm: 2 },
  },

  // ── Devour sigmoid scaling factor ──────────────────────────
  devourPowerScaling: 0.15,

  // ── Passive Drain Formula ──────────────────────────────────
  drainFormula: (baseDrain, totalParticles, ambientCore) => {
    const ambient = Math.max(ambientCore, 1);
    return baseDrain * Math.log(1 + totalParticles / ambient);
  },
};
