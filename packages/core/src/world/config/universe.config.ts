import { ALL_BEINGS } from "../beings/index.js";
import { ALL_GENERATORS } from "../generators/index.js";
import type { UniverseConfig } from "./types.js";

export const UNIVERSE: UniverseConfig = {
  // ── Particles ──────────────────────────────────────────────
  particles: [
    { id: "ql", name: "灵", color: "#4fc3f7" },
    { id: "qs", name: "煞", color: "#ef5350" },
  ],

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
    /** Required qi ratio to attempt breakthrough (now proportion-based) */
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

  // ── Passive Drain Formula ──────────────────────────────────
  drainFormula: (baseDrain, _totalParticles, _ambientCore) => {
    return baseDrain;
  },

  // ── Ecology Parameters ────────────────────────────────────
  ecology: {
    baseAmbientCap: 200,
    ambientDensity: 1,
    spawnBaseChance: 0.3,
    maxEntities: 30,
  },

  // ── 天道裁决参数 ────────────────────────────────────────
  daoJudgment: {
    /** 每 tick 天道从超标实体回收的粒子比率 */
    drainRate: 0.3,
    /** 天道占比过高时向众生释放的比率 */
    releaseRate: 0.2,
  },
};
