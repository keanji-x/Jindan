import type { EntityState } from "./entity.ts";
import type { ObjectiveFunction } from "./types.ts";

/**
 * Evaluates state based on Qi ratio and mood.
 * Rewards both high ratio (survival) and mood (absorb efficiency).
 * Mood weight is significant because mood directly multiplies absorb gain [0.5x, 1.5x].
 */
export class QiRatioObjective implements ObjectiveFunction<EntityState> {
  evaluate(state: EntityState): number {
    const ratio = state.qiMax > 0 ? state.qiCurrent / state.qiMax : 0;

    // Penalize death heavily
    if (state.qiCurrent <= 0) return -99999;

    // Base utility is the ratio (0 to 1). We add log2(max) to reward increasing total capacity.
    const scale = 0.5;
    const maxBonus = state.qiMax > 0 ? Math.log2(state.qiMax) * scale : 0;

    // Mood bonus (0.3 weight): mood directly multiplies absorb gain [0.5x, 1.5x],
    // so the brain should invest ~30% of ticks in social actions to maintain high mood.
    // At mood=0.5 → absorb×1.0, at mood=1.0 → absorb×1.5, that's 50% more qi/action.
    const moodBonus = state.mood * 0.3;
    return ratio + maxBonus + moodBonus;
  }
}
