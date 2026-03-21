// ============================================================
// TunableParams — 7-dimensional search space for world balance
//
// All params expressed as ratios of baseTanks(1) so species
// scale proportionally. applyParams() patches UNIVERSE in-place.
// ============================================================

import { UNIVERSE } from "./universe.config.js";

export interface SearchParams {
  /** Per-tick drain as fraction of baseTanks(1). e.g. 0.01 → human drains 1/tick */
  drainRatio: number;
  /** Per-action absorb as fraction of baseTanks(1). e.g. 0.2 → human absorbs 20/action */
  absorbRatio: number;
  /** Breakthrough cost as fraction of baseTanks(1) × realm */
  breakthroughCostRatio: number;
  /** Base probability of breakthrough success */
  breakthroughSuccessRate: number;
  /** Spawn chance base for SpawnPool */
  spawnBaseChance: number;
  /** Plant respawn chance per tick when below minimum */
  ecologyResilience: number;
  /** Required qi ratio to attempt breakthrough (e.g. 0.8) */
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
  absorbRatio: [0.05, 0.4],
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
  absorbRatio: 0.2,
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
  // Drain: ratio × baseTanks(1)
  for (const [species, reactor] of Object.entries(UNIVERSE.reactors)) {
    const cap = Object.values(reactor.baseTanks(1)).reduce((a, b) => a + b, 0);
    (UNIVERSE.reactors as Record<string, typeof reactor>)[species] = {
      ...reactor,
      baseDrainRate: Math.max(1, Math.round(cap * p.drainRatio)),
    };
  }

  // Absorb: ratio × baseTanks(1)
  const biologicalReactors = Object.values(UNIVERSE.reactors).filter(
    (r) => r.id !== "sect" && r.id !== "artifact" && !r.id.startsWith("artifact_"),
  );

  const averageCap =
    biologicalReactors.reduce((sum, r) => sum + (r.baseTanks(1)[r.coreParticle] ?? 100), 0) /
    Math.max(1, biologicalReactors.length);

  for (const reactor of biologicalReactors) {
    const cap = reactor.baseTanks(1)[reactor.coreParticle] ?? 100;

    if (reactor.actions.includes("meditate")) {
      UNIVERSE.absorb.meditate = { base: Math.round(cap * p.absorbRatio), perRealm: 5 };
    }
    if (reactor.actions.includes("moonlight")) {
      UNIVERSE.absorb.moonlight = { base: Math.round(cap * p.absorbRatio), perRealm: 5 };
    }
    if (reactor.actions.includes("photosynth")) {
      UNIVERSE.absorb.photosynth = { base: Math.round(cap * p.absorbRatio * 0.4), perRealm: 2 };
    }
  }

  // Breakthrough
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
