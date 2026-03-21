import { ALL_BEINGS } from "../beings/index.js";
import { ALL_GENERATORS } from "../generators/index.js";
import type { UniverseConfig } from "./types.js";

export const UNIVERSE: UniverseConfig = {
  // ── Particles ──────────────────────────────────────────────
  particles: [
    { id: "ql", name: "灵", color: "#4fc3f7" },
    { id: "qs", name: "煞", color: "#ef5350" },
  ],

  // ── Equations (化学方程式 - 已被物理极性引擎取代) ───────────────────
  equations: {},

  // ── Reactor Templates (基本模板与动态载入) ─────
  reactors: ALL_BEINGS,

  // ── Species Generators (物种蓝图与变异池) ─────
  generators: ALL_GENERATORS,

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
