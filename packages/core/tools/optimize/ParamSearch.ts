// ============================================================
// ParamSearch — Simulated Annealing for world balance
//
// Explores the 10D parameter space to maximize WorldScore.
// Uses robust multi-trial evaluation (mean - α·std) to resist noise.
// ============================================================

import { applyParams, DEFAULT_PARAMS, perturb, type SearchParams } from "../../src/world/config/TunableParams.js";
import { evaluateWorldRobust, type RobustScore } from "./WorldEvaluator.js";

export interface AnnealOptions {
  iterations: number;
  ticksPerTrial: number;
  runsPerEval?: number;
  alpha?: number;
  initialTemp?: number;
  coolingRate?: number;
  /** Pre-populate this many entities */
  entities?: number;
  /** Particles per entity ratio */
  particlesPerEntity?: number;
}

export interface AnnealResult {
  bestParams: SearchParams;
  bestScore: RobustScore;
  trail: Array<{ iteration: number; fitness: number; temp: number; accepted: boolean }>;
}

export function anneal(opts: AnnealOptions): AnnealResult {
  const {
    iterations,
    ticksPerTrial,
    runsPerEval = 5,
    alpha = 0.5,
    initialTemp = 1.0,
    coolingRate = 0.995,
  } = opts;

  let current = { ...DEFAULT_PARAMS };
  applyParams(current);
  let currentScore = evaluateWorldRobust({ ticks: ticksPerTrial, runs: runsPerEval, alpha, entities: opts.entities, particlesPerEntity: opts.particlesPerEntity });

  let best = { ...current };
  let bestScore = { ...currentScore };

  let temp = initialTemp;
  const trail: AnnealResult["trail"] = [];

  for (let i = 0; i < iterations; i++) {
    const candidate = perturb(current);
    applyParams(candidate);
    const candidateScore = evaluateWorldRobust({ ticks: ticksPerTrial, runs: runsPerEval, alpha, entities: opts.entities, particlesPerEntity: opts.particlesPerEntity });

    const delta = candidateScore.fitness - currentScore.fitness;
    const accepted = delta > 0 || Math.random() < Math.exp(delta / temp);

    if (accepted) {
      current = candidate;
      currentScore = candidateScore;
    }

    if (currentScore.fitness > bestScore.fitness) {
      best = { ...current };
      bestScore = { ...currentScore };
    }

    trail.push({ iteration: i, fitness: currentScore.fitness, temp, accepted });
    temp *= coolingRate;
  }

  // Restore best params
  applyParams(best);

  return { bestParams: best, bestScore, trail };
}
