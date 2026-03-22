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
  totalParticles: 50_000,
  tickIntervalMs: 15_000,
  ledgerWindowSize: 2000,

  // ── Breakthrough ───────────────────────────────────────────
  breakthrough: {
    qiCostPerRealm: 20,
    /** Required qi ratio to attempt breakthrough (proportion-based) */
    minQiRatio: 0.8,
    baseSuccessRate: 0.3,
    maxSuccessRate: 0.85,
    failLossRatio: 0,
    burnRatio: 0.8,
    maxRealm: 10,
  },

  // ── Drain & Absorb ─────────────────────────────────────────
  drainBase: 1.5,
  absorbScale: 1.0,
  drainScale: 1.0,
  /** 天劫触发阈值 (1.5× proportionLimit) */
  tribulationThreshold: 1.5,

  // ── Ecology Parameters ────────────────────────────────────
  ecology: {
    spawnBaseChance: 0.08,
    maxEntities: 50,
  },

};
