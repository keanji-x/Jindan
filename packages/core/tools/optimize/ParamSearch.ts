// ============================================================
// ParamSearch — Simulated Annealing for world balance
//
// Explores the 10D parameter space to maximize WorldScore.
// ============================================================

import { applyParams, DEFAULT_PARAMS, perturb, type SearchParams } from "../../src/world/config/TunableParams.js";
import { evaluateWorld, type WorldScore } from "./WorldEvaluator.js";

export interface AnnealOptions {
  iterations: number;
  ticksPerTrial: number;
  initialTemp?: number;
  coolingRate?: number;
}

export interface AnnealResult {
  bestParams: SearchParams;
  bestScore: WorldScore;
  trail: Array<{ iteration: number; score: number; temp: number; accepted: boolean }>;
}

export function anneal(opts: AnnealOptions): AnnealResult {
  const { iterations, ticksPerTrial, initialTemp = 1.0, coolingRate = 0.995 } = opts;

  let current = { ...DEFAULT_PARAMS };
  applyParams(current);
  let currentScore = evaluateWorld({ ticks: ticksPerTrial });

  let best = { ...current };
  let bestScore = { ...currentScore };

  let temp = initialTemp;
  const trail: AnnealResult["trail"] = [];

  for (let i = 0; i < iterations; i++) {
    const candidate = perturb(current);
    applyParams(candidate);
    const candidateScore = evaluateWorld({ ticks: ticksPerTrial });

    const delta = candidateScore.total - currentScore.total;
    const accepted = delta > 0 || Math.random() < Math.exp(delta / temp);

    if (accepted) {
      current = candidate;
      currentScore = candidateScore;
    }

    if (currentScore.total > bestScore.total) {
      best = { ...current };
      bestScore = { ...currentScore };
    }

    trail.push({ iteration: i, score: currentScore.total, temp, accepted });
    temp *= coolingRate;
  }

  // Restore best params
  applyParams(best);

  return { bestParams: best, bestScore, trail };
}
