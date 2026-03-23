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
  tickIntervalMs: 300_000, // 5 分钟 / tick
  ledgerWindowSize: 2000,

  // ── Breakthrough ───────────────────────────────────────────
  breakthrough: {
    qiCostPerRealm: 20,
    /** P(success) = ratio^3. ratio=0.5→12.5%, ratio=0.8→51%, ratio=1.0→100% */
    successExponent: 3,
    /** Fraction of core qi burned on successful breakthrough (0.5 = keep 50%) */
    burnRatio: 0.5,
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
