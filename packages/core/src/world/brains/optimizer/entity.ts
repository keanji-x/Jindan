import { ActionRegistry } from "../../systems/ActionRegistry.js";
import type { AvailableAction } from "../../types.js";
import type { Personality } from "./PersonalityObjective.js";
import type { StateSimulator } from "./types.js";

export interface EntityState {
  qiCurrent: number;
  qiMax: number;
  mood: number;
  avgRelation: number;
  personality?: Personality;
}

/**
 * Personality-aware action simulator.
 *
 * 每个动作的收益受 personality 调制：
 * - meditate: greed 越高 qi gain 越大
 * - devour: aggression 越高 qi gain 越大
 * - social (chat/court/treat): sociability 越高 mood + relation 加成越大
 * - breakthrough: ambition 越高 qiMax 增幅越大
 */
export class EntityActionSimulator implements StateSimulator<EntityState, AvailableAction> {
  simulate(state: EntityState, action: AvailableAction): EntityState {
    const nextState = { ...state };
    const p = state.personality;
    const aggression = p?.aggression ?? 0.3;
    const sociability = p?.sociability ?? 0.4;
    const greed = p?.greed ?? 0.5;
    const ambition = p?.ambition ?? 0.5;

    const cost = ActionRegistry.cost(action.action) ?? 0;
    nextState.qiCurrent -= cost;
    if (nextState.qiCurrent < 0) nextState.qiCurrent = 0;

    // Mood-scaled absorption: simulates how mood affects qi gain
    const moodAbsorbBonus = 0.5 + nextState.mood; // [0.5, 1.5]

    switch (action.action) {
      case "rest":
        nextState.qiCurrent += 5;
        break;

      case "meditate":
      case "photosynth":
      case "absorb":
        // 贪婪越高 → 打坐收益越大 [25, 75]
        nextState.qiCurrent += Math.floor((25 + greed * 50) * moodAbsorbBonus);
        break;

      case "moonlight":
        nextState.qiCurrent += Math.floor((30 + greed * 50) * moodAbsorbBonus);
        break;

      case "devour":
        // 攻击性越高 → 吞噬获取灵气越多 [20, 100]
        nextState.qiCurrent += Math.floor(20 + aggression * 80);
        // 吞噬降心境，但高攻击性不太在意
        nextState.mood = Math.max(0, nextState.mood - 0.03 * (1 - aggression * 0.5));
        // 吞噬降关系
        nextState.avgRelation = Math.max(-1, nextState.avgRelation - 0.1);
        break;

      case "breakthrough": {
        // Expected-value simulation: E[state] = P × success + (1 - P) × failure
        const ratio = nextState.qiMax > 0 ? nextState.qiCurrent / nextState.qiMax : 0;
        const k = 3; // successExponent
        const P = Math.min(ratio, 1) ** k;
        const burnRatio = 0.5;

        // Success outcome: qiMax grows, qi burns
        const successQiMax = Math.floor(nextState.qiMax * (1.0 + ambition * 0.3));
        const successQi = Math.floor(nextState.qiCurrent * (1 - burnRatio));
        const successMood = Math.min(1, nextState.mood + 0.2);

        // Failure outcome: no qi loss, mood penalty
        const failQi = nextState.qiCurrent;
        const failMood = Math.max(0, nextState.mood - 0.15);

        // Expected state
        nextState.qiMax = Math.floor(P * successQiMax + (1 - P) * nextState.qiMax);
        nextState.qiCurrent = Math.floor(P * successQi + (1 - P) * failQi);
        nextState.mood = P * successMood + (1 - P) * failMood;
        break;
      }

      // Social actions: mood + relation boost scaled by sociability
      case "chat": {
        const moodGain = 0.04 + sociability * 0.08; // [0.04, 0.12]
        nextState.mood = Math.min(1, nextState.mood + moodGain);
        nextState.avgRelation = Math.min(1, nextState.avgRelation + 0.05 + sociability * 0.05);
        break;
      }
      case "court": {
        const moodGain = 0.06 + sociability * 0.12;
        nextState.mood = Math.min(1, nextState.mood + moodGain);
        nextState.avgRelation = Math.min(1, nextState.avgRelation + 0.08 + sociability * 0.07);
        break;
      }
      case "treat": {
        const moodGain = 0.08 + sociability * 0.15;
        nextState.mood = Math.min(1, nextState.mood + moodGain);
        nextState.avgRelation = Math.min(1, nextState.avgRelation + 0.1 + sociability * 0.1);
        break;
      }
      case "travel": {
        const moodGain = 0.04 + sociability * 0.08;
        nextState.mood = Math.min(1, nextState.mood + moodGain);
        break;
      }
      case "mate": {
        const moodGain = 0.1 + sociability * 0.15;
        nextState.mood = Math.min(1, nextState.mood + moodGain);
        nextState.avgRelation = Math.min(1, nextState.avgRelation + 0.15);
        break;
      }
      default:
        break;
    }

    // Natural decay per simulated step
    nextState.mood = Math.max(0, nextState.mood - 0.01);

    if (nextState.qiCurrent > nextState.qiMax) {
      nextState.qiCurrent = nextState.qiMax;
    }
    return nextState;
  }
}
