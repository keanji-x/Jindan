// ============================================================
// TunableParams — 9-dimensional search space for world balance
//
// All params map 1:1 to UniverseConfig fields.
// applyParams() patches UNIVERSE in-place via direct assignment.
// ============================================================

import { UNIVERSE } from "./universe.config.js";

export interface SearchParams {
  // ── Drain (entity → Dao) ──
  /** Exponential base for realm-scaled drain (e.g. 1.5) */
  drainBase: number;
  /** Global drain multiplier applied to all species' baseDrainRate */
  drainScale: number;

  // ── Absorb (Dao → entity) ──
  /** Global absorb multiplier applied to all species' absorbRate */
  absorbScale: number;

  // ── Breakthrough ──
  /** Absolute qi cost per realm for breakthrough */
  qiCostPerRealm: number;
  /** Base probability of breakthrough success */
  breakthroughSuccessRate: number;
  /** Required qi proportion ratio to attempt breakthrough (e.g. 0.8 of proportionLimit) */
  breakthroughThreshold: number;

  // ── Ecology ──
  /** Spawn chance base for SpawnPool */
  spawnBaseChance: number;
}

export const PARAM_RANGES: Record<keyof SearchParams, [number, number]> = {
  drainBase: [1.2, 2.5],
  drainScale: [0.5, 2.0],
  absorbScale: [0.5, 2.0],
  qiCostPerRealm: [2, 20],
  breakthroughSuccessRate: [0.1, 0.6],
  breakthroughThreshold: [0.5, 0.95],
  spawnBaseChance: [0.005, 0.05],
};

export const DEFAULT_PARAMS: SearchParams = {
  drainBase: 1.66,
  drainScale: 1.12,
  absorbScale: 1.87,
  qiCostPerRealm: 10.2,
  breakthroughSuccessRate: 0.31,
  breakthroughThreshold: 0.4,
  spawnBaseChance: 0.021,
};

/** Apply search params to UNIVERSE config (mutates in-place, 1:1 direct assignment) */
export function applyParams(p: SearchParams): void {
  // Drain
  UNIVERSE.drainBase = p.drainBase;
  UNIVERSE.drainScale = p.drainScale;

  // Absorb
  UNIVERSE.absorbScale = p.absorbScale;

  // Breakthrough
  UNIVERSE.breakthrough.qiCostPerRealm = p.qiCostPerRealm;
  UNIVERSE.breakthrough.minQiRatio = p.breakthroughThreshold;
  UNIVERSE.breakthrough.baseSuccessRate = p.breakthroughSuccessRate;

  // Ecology
  UNIVERSE.ecology.spawnBaseChance = p.spawnBaseChance;
}

/** Generate a neighbor by perturbing 1-2 random dims by ±10% */
export function perturb(params: SearchParams): SearchParams {
  const keys = Object.keys(PARAM_RANGES) as (keyof SearchParams)[];
  const result = { ...params };
  const numPerturb = Math.random() < 0.5 ? 1 : 2;

  for (let i = 0; i < numPerturb; i++) {
    const key = keys[Math.floor(Math.random() * keys.length)]!;
    const [min, max] = PARAM_RANGES[key];
    const delta = (max - min) * (Math.random() * 0.2 - 0.1); // ±10%
    result[key] = Math.max(min, Math.min(max, result[key] + delta));
  }

  return result;
}
