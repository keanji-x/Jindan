#!/usr/bin/env tsx
// ============================================================
// optimize — Simulated Annealing balance optimizer
//
// Usage: just optimize
//        npx tsx tools/optimize/optimize.ts
// ============================================================

import { anneal } from "./ParamSearch.js";
import { applyParams, DEFAULT_PARAMS } from "../../src/world/config/TunableParams.js";
import { evaluateWorldRobust } from "./WorldEvaluator.js";

const RUNS = 5;
const ALPHA = 0.5;

console.log("🔬 金丹世界平衡调优\n");

// 1. Evaluate current defaults (multi-trial)
applyParams(DEFAULT_PARAMS);
const baseline = evaluateWorldRobust({ ticks: 50, runs: RUNS, alpha: ALPHA });

const fmt = (m: number, s: number) => `${m.toFixed(3)} ± ${s.toFixed(3)}`;
const pct = (m: number, s: number) => `${(m * 100).toFixed(1)}% ± ${(s * 100).toFixed(1)}%`;

console.log("── 当前默认得分 (mean ± std) ──");
console.log(`  适应度:      ${baseline.fitness.toFixed(3)}`);
console.log(`  总分:        ${fmt(baseline.mean.total, baseline.std.total)}`);
console.log(`  生存率:      ${fmt(baseline.mean.playerSurvival, baseline.std.playerSurvival)}`);
console.log(`  多样性:      ${fmt(baseline.mean.speciesDiversity, baseline.std.speciesDiversity)}`);
console.log(`  突破率:      ${fmt(baseline.mean.breakthroughRate, baseline.std.breakthroughRate)}`);
console.log(`  生态:        ${fmt(baseline.mean.ecosystemHealth, baseline.std.ecosystemHealth)}`);
console.log(`  灵气分布:    ${pct(baseline.mean.ambientEntityRatio, baseline.std.ambientEntityRatio)} (理想 ~50%)`);
console.log(`  煞/灵比:     ${pct(baseline.mean.shaLingRatio, baseline.std.shaLingRatio)} (理想 ~40%)`);

// 2. Run simulated annealing
console.log(`\n── 模拟退火优化 (100 iterations × 30 ticks × ${RUNS} runs, α=${ALPHA}) ──`);
const result = anneal({ iterations: 100, ticksPerTrial: 30, runsPerEval: RUNS, alpha: ALPHA });

console.log(`  最佳适应度: ${result.bestScore.fitness.toFixed(3)}`);
console.log("  得分分解 (mean ± std):");
console.log(`    总分:        ${fmt(result.bestScore.mean.total, result.bestScore.std.total)}`);
console.log(`    生存率:      ${fmt(result.bestScore.mean.playerSurvival, result.bestScore.std.playerSurvival)}`);
console.log(`    多样性:      ${fmt(result.bestScore.mean.speciesDiversity, result.bestScore.std.speciesDiversity)}`);
console.log(`    突破率:      ${fmt(result.bestScore.mean.breakthroughRate, result.bestScore.std.breakthroughRate)}`);
console.log(`    生态:        ${fmt(result.bestScore.mean.ecosystemHealth, result.bestScore.std.ecosystemHealth)}`);
console.log(`    灵气分布:    ${pct(result.bestScore.mean.ambientEntityRatio, result.bestScore.std.ambientEntityRatio)} (理想 ~50%)`);
console.log(`    煞/灵比:     ${pct(result.bestScore.mean.shaLingRatio, result.bestScore.std.shaLingRatio)} (理想 ~40%)`);
console.log("  最佳参数:");
for (const [k, v] of Object.entries(result.bestParams) as [string, number][]) {
  const def = (DEFAULT_PARAMS as unknown as Record<string, number>)[k]!;
  const delta = (v / def - 1) * 100;
  console.log(`    ${k}: ${v.toFixed(4)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`);
}

const accepted = result.trail.filter((t) => t.accepted).length;
console.log(`  接受率: ${accepted}/${result.trail.length} (${((accepted / result.trail.length) * 100).toFixed(0)}%)`);

console.log("\n✅ 将上方最佳参数更新至 world/config/balance.config.ts 即可生效。");
