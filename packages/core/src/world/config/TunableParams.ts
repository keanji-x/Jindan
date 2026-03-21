// ============================================================
// TunableParams — 7-dimensional search space for world balance
//
// All params expressed as ratios. applyParams() patches UNIVERSE in-place.
// ============================================================

import { UNIVERSE } from "./universe.config.js";

export interface SearchParams {
  /** Per-tick drain as fraction of birthCost. e.g. 0.01 → human drains ~0.5/tick */
  drainRatio: number;
  /** Breakthrough cost as fraction of birthCost × realm */
  breakthroughCostRatio: number;
  /** Base probability of breakthrough success */
  breakthroughSuccessRate: number;
  /** Spawn chance base for SpawnPool */
  spawnBaseChance: number;
  /** Plant respawn chance per tick when below minimum */
  ecologyResilience: number;
  /** Required qi proportion ratio to attempt breakthrough (e.g. 0.8 of proportionLimit) */
  breakthroughThreshold: number;
  /** Exponential base for realm-scaled drain (e.g. 1.5) */
  drainBase: number;
  /** QS infiltration exp factor */
  infiltrationK: number;
  /** QL dissipation exp factor */
  dissipationK: number;
}

export const PARAM_RANGES: Record<keyof SearchParams, [number, number]> = {
  drainRatio: [0.005, 0.05],
  breakthroughCostRatio: [0.2, 0.6],
  breakthroughSuccessRate: [0.1, 0.6],
  spawnBaseChance: [0.005, 0.05],
  ecologyResilience: [0.2, 1.0],
  breakthroughThreshold: [0.5, 0.95],
  drainBase: [1.2, 2.5],
  infiltrationK: [0.5, 4],
  dissipationK: [0.5, 4],
};

export const DEFAULT_PARAMS: SearchParams = {
  drainRatio: 0.01,
  breakthroughCostRatio: 0.4,
  breakthroughSuccessRate: 0.25,
  spawnBaseChance: 0.02,
  ecologyResilience: 0.6,
  breakthroughThreshold: 0.9,
  drainBase: 1.5,
  infiltrationK: 2,
  dissipationK: 2,
};

/** Apply search params to UNIVERSE config (mutates in-place) */
export function applyParams(p: SearchParams): void {
  // Drain: ratio × birthCost
  for (const [species, reactor] of Object.entries(UNIVERSE.reactors)) {
    const cap = reactor.birthCost || 50;
    (UNIVERSE.reactors as Record<string, typeof reactor>)[species] = {
      ...reactor,
      baseDrainRate: Math.max(1, Math.round(cap * p.drainRatio)),
    };
  }

  // Breakthrough
  const biologicalReactors = Object.values(UNIVERSE.reactors).filter(
    (r) =>
      r.id !== "sect" && r.id !== "artifact" && !r.id.startsWith("artifact_") && r.id !== "dao",
  );

  const averageCap =
    biologicalReactors.reduce((sum, r) => sum + (r.birthCost || 50), 0) /
    Math.max(1, biologicalReactors.length);

  UNIVERSE.breakthrough.qiCostPerRealm = Math.round(averageCap * p.breakthroughCostRatio * 0.1);
  UNIVERSE.breakthrough.minQiRatio = p.breakthroughThreshold;
  UNIVERSE.breakthrough.baseSuccessRate = p.breakthroughSuccessRate;

  // Ecology
  UNIVERSE.ecology.spawnBaseChance = p.spawnBaseChance;

  // Drain: realm base + dual mechanism k
  UNIVERSE.drainBase = p.drainBase;
  UNIVERSE.infiltrationK = p.infiltrationK;
  UNIVERSE.dissipationK = p.dissipationK;
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
