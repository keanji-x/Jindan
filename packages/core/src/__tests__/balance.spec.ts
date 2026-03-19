// ============================================================
// Balance Test — Run simulated annealing to find optimal params
// ============================================================

import { describe, expect, it } from "vitest";
import { anneal } from "../engine/ParamSearch.js";
import { applyParams, DEFAULT_PARAMS } from "../engine/TunableParams.js";
import { evaluateWorld } from "../engine/WorldEvaluator.js";

describe("World Balance", () => {
  it("evaluate current defaults", () => {
    applyParams(DEFAULT_PARAMS);
    const score = evaluateWorld({ ticks: 50 });

    console.log("\n── Current Default Score ──");
    console.log(`  Total:        ${score.total.toFixed(3)}`);
    console.log(`  Survival:     ${score.playerSurvival.toFixed(3)}`);
    console.log(`  Diversity:    ${score.speciesDiversity.toFixed(3)}`);
    console.log(`  Breakthrough: ${score.breakthroughRate.toFixed(3)}`);
    console.log(`  Ecosystem:    ${score.ecosystemHealth.toFixed(3)}`);
    console.log(`  Ambient/Entity: ${(score.ambientEntityRatio * 100).toFixed(1)}% (ideal ~50%)`);
    console.log(`  Sha/Ling:     ${(score.shaLingRatio * 100).toFixed(1)}% (ideal ~40%)`);

    expect(score.total).toBeGreaterThan(0);
  });

  it("simulated annealing finds good params", () => {
    const result = anneal({ iterations: 100, ticksPerTrial: 30 });

    console.log("\n── Simulated Annealing ──");
    console.log(`  Best Total Score: ${result.bestScore.total.toFixed(3)}`);
    console.log("  Score Breakdown:");
    console.log(`    Survival:     ${result.bestScore.playerSurvival.toFixed(3)}`);
    console.log(`    Diversity:    ${result.bestScore.speciesDiversity.toFixed(3)}`);
    console.log(`    Breakthrough: ${result.bestScore.breakthroughRate.toFixed(3)}`);
    console.log(`    Ecosystem:    ${result.bestScore.ecosystemHealth.toFixed(3)}`);
    console.log(
      `    Ambient/Entity: ${(result.bestScore.ambientEntityRatio * 100).toFixed(1)}% (ideal ~50%)`,
    );
    console.log(
      `    Sha/Ling:     ${(result.bestScore.shaLingRatio * 100).toFixed(1)}% (ideal ~40%)`,
    );
    console.log("  Best Params:");
    for (const [k, v] of Object.entries(result.bestParams) as [string, number][]) {
      const def = (DEFAULT_PARAMS as unknown as Record<string, number>)[k]!;
      const delta = (v / def - 1) * 100;
      console.log(`    ${k}: ${v.toFixed(4)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`);
    }

    // Acceptance stats
    const accepted = result.trail.filter((t) => t.accepted).length;
    console.log(
      `  Accepted: ${accepted}/${result.trail.length} (${((accepted / result.trail.length) * 100).toFixed(0)}%)`,
    );

    expect(result.bestScore.total).toBeGreaterThan(0.3);
  });
});
