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

  // ── Equations (化学方程式 - 已被物理极性引擎取代) ───────────────────
  equations: {},

  // ── Reactor Templates (反应炉模板) ─────────────────────────
  reactors: {
    human: {
      id: "human",
      name: "修士",
      coreParticle: "ql",
      baseTanks: (realm) => ({ ql: 200 * realm, qs: 0 }),
      baseDrainRate: 1,
      ownPolarity: { ql: 1.0, qs: 0.0 },
      oppositePolarity: { ql: 0.0, qs: 1.0 },
      actions: ["meditate", "devour", "breakthrough", "rest"],
      ambientCapContribution: 200,
    },
    beast: {
      id: "beast",
      name: "妖兽",
      coreParticle: "qs",
      baseTanks: (realm) => ({ qs: 80 * realm, ql: 0 }),
      baseDrainRate: 3,
      ownPolarity: { qs: 1.0, ql: 0.0 },
      oppositePolarity: { qs: 0.0, ql: 1.0 },
      actions: ["moonlight", "devour", "breakthrough", "rest"],
      ambientCapContribution: 150,
    },
    plant: {
      id: "plant",
      name: "灵植",
      coreParticle: "ql",
      baseTanks: (realm) => ({ ql: 150 * realm, qs: 0 }),
      baseDrainRate: 1,
      ownPolarity: { ql: 1.0, qs: 0.0 },
      oppositePolarity: { ql: 0.0, qs: 1.0 },
      actions: ["photosynth", "breakthrough", "rest"],
      ambientCapContribution: 100,
    },
  },

  // ── World Constants ────────────────────────────────────────
  totalParticles: 1_000,
  tickIntervalMs: 15_000,
  ledgerWindowSize: 2000,

  // ── Breakthrough ───────────────────────────────────────────
  breakthrough: {
    qiCostPerRealm: 10,
    /** Required qi ratio to attempt breakthrough */
    minQiRatio: 0.9,
    baseSuccessRate: 0.25,
    maxSuccessRate: 0.85,
    failLossRatio: 0,
    burnRatio: 0.9,
    maxRealm: 10,
  },

  // ── Drain exponential base: drain = baseDrain × drainBase^(realm-1) ──
  drainBase: 1.5,
  /** QS infiltration k: higher = more QS seeps in when environment is polluted */
  infiltrationK: 2,
  /** QL dissipation k: higher = more QL leaks when ambient is sparse */
  dissipationK: 2,

  // ── Absorb (particles pulled from ambient per action) ──────
  absorb: {
    meditate: { base: 20, perRealm: 5 },
    moonlight: { base: 20, perRealm: 5 },
    photosynth: { base: 8, perRealm: 2 },
  },

  // ── Passive Drain Formula ──────────────────────────────────
  drainFormula: (baseDrain, _totalParticles, _ambientCore) => {
    // Simplified: flat drain for more predictable survival curves
    return baseDrain;
  },

  // ── Ecology Parameters ────────────────────────────────────
  ecology: {
    baseAmbientCap: 200,
    ambientDensity: 1,
    spawnBaseChance: 0.3,
    maxEntities: 30,
  },
};
