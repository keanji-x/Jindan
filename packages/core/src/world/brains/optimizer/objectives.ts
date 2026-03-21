import type { EntityState } from "./entity.ts";
import type { ObjectiveFunction } from "./types.ts";

/**
 * Evaluates state based on Qi ratio.
 * Rewards both high ratio (survival) and absolute maxQi (breakthrough progression).
 */
export class QiRatioObjective implements ObjectiveFunction<EntityState> {
  evaluate(state: EntityState): number {
    const ratio = state.qiMax > 0 ? state.qiCurrent / state.qiMax : 0;

    // Penalize death heavily
    if (state.qiCurrent <= 0) return -99999;

    // Base utility is the ratio (0 to 1). We add log2(max) to reward increasing total capacity.
    // So ratio 1 with max 10 (log ~3.3) is better than ratio 1 with max 5 (log ~2.3).
    const scale = 0.5;
    const maxBonus = state.qiMax > 0 ? Math.log2(state.qiMax) * scale : 0;

    return ratio + maxBonus;
  }
}
