#!/usr/bin/env tsx
// ============================================================
// optimize — Simulated Annealing balance optimizer
//
// Usage: just optimize
//        npx tsx tools/optimize/optimize.ts
// ============================================================

import { anneal } from "./ParamSearch.js";
import { applyParams, DEFAULT_PARAMS } from "../../src/world/config/TunableParams.js";
import { evaluateWorld } from "./WorldEvaluator.js";

console.log("🔬 金丹世界平衡调优\n");

// 1. Evaluate current defaults
applyParams(DEFAULT_PARAMS);
const baseline = evaluateWorld({ ticks: 50 });

console.log("── 当前默认得分 ──");
console.log(`  总分:        ${baseline.total.toFixed(3)}`);
console.log(`  生存率:      ${baseline.playerSurvival.toFixed(3)}`);
console.log(`  多样性:      ${baseline.speciesDiversity.toFixed(3)}`);
console.log(`  突破率:      ${baseline.breakthroughRate.toFixed(3)}`);
console.log(`  生态:        ${baseline.ecosystemHealth.toFixed(3)}`);
console.log(`  灵气分布:    ${(baseline.ambientEntityRatio * 100).toFixed(1)}% (理想 ~50%)`);
console.log(`  煞/灵比:     ${(baseline.shaLingRatio * 100).toFixed(1)}% (理想 ~40%)`);

// 2. Run simulated annealing
console.log("\n── 模拟退火优化 (100 iterations × 30 ticks) ──");
const result = anneal({ iterations: 100, ticksPerTrial: 30 });

console.log(`  最佳总分: ${result.bestScore.total.toFixed(3)}`);
console.log("  得分分解:");
console.log(`    生存率:      ${result.bestScore.playerSurvival.toFixed(3)}`);
console.log(`    多样性:      ${result.bestScore.speciesDiversity.toFixed(3)}`);
console.log(`    突破率:      ${result.bestScore.breakthroughRate.toFixed(3)}`);
console.log(`    生态:        ${result.bestScore.ecosystemHealth.toFixed(3)}`);
console.log(`    灵气分布:    ${(result.bestScore.ambientEntityRatio * 100).toFixed(1)}% (理想 ~50%)`);
console.log(`    煞/灵比:     ${(result.bestScore.shaLingRatio * 100).toFixed(1)}% (理想 ~40%)`);
console.log("  最佳参数:");
for (const [k, v] of Object.entries(result.bestParams) as [string, number][]) {
  const def = (DEFAULT_PARAMS as unknown as Record<string, number>)[k]!;
  const delta = (v / def - 1) * 100;
  console.log(`    ${k}: ${v.toFixed(4)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`);
}

const accepted = result.trail.filter((t) => t.accepted).length;
console.log(`  接受率: ${accepted}/${result.trail.length} (${((accepted / result.trail.length) * 100).toFixed(0)}%)`);

console.log("\n✅ 将上方最佳参数更新至 world/config/balance.config.ts 即可生效。");
