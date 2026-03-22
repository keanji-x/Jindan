import { ActionRegistry } from "../../systems/ActionRegistry.js";
import type { AvailableAction } from "../../types.js";
import type { StateSimulator } from "./types.js";

export interface EntityState {
  qiCurrent: number;
  qiMax: number;
  mood: number;
}

export class EntityActionSimulator implements StateSimulator<EntityState, AvailableAction> {
  simulate(state: EntityState, action: AvailableAction): EntityState {
    const nextState = { ...state };

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
        // Actual absorb is ~60-90 base after absorbScale; simulate ~50 as conservative estimate
        nextState.qiCurrent += Math.floor(50 * moodAbsorbBonus);
        break;
      case "moonlight":
        // Moonlight absorb is ~70 base; simulate ~55
        nextState.qiCurrent += Math.floor(55 * moodAbsorbBonus);
        break;
      case "devour":
        nextState.qiCurrent += 40;
        nextState.mood = Math.max(0, nextState.mood - 0.05);
        break;
      case "breakthrough":
        nextState.qiMax *= 2;
        nextState.qiCurrent = nextState.qiMax;
        nextState.mood = Math.min(1, nextState.mood + 0.2);
        break;
      // Social actions: no direct qi gain but boost mood → future absorb efficiency
      // Mood directly multiplies absorb gain (0.5× at mood=0, 1.5× at mood=1),
      // so keeping mood high is strategically important
      case "chat": {
        const gain = nextState.mood > 0.7 ? 0.04 : 0.08;
        nextState.mood = Math.min(1, nextState.mood + gain);
        break;
      }
      case "court": {
        const gain = nextState.mood > 0.7 ? 0.06 : 0.12;
        nextState.mood = Math.min(1, nextState.mood + gain);
        break;
      }
      case "treat": {
        const gain = nextState.mood > 0.7 ? 0.08 : 0.15;
        nextState.mood = Math.min(1, nextState.mood + gain);
        break;
      }
      case "travel": {
        const gain = nextState.mood > 0.7 ? 0.04 : 0.08;
        nextState.mood = Math.min(1, nextState.mood + gain);
        break;
      }
      case "mate": {
        const gain = nextState.mood > 0.7 ? 0.1 : 0.2;
        nextState.mood = Math.min(1, nextState.mood + gain);
        break;
      }
      default:
        break;
    }

    // Natural decay per simulated step (matches drain.ts: 0.02)
    nextState.mood = Math.max(0, nextState.mood - 0.01);

    if (nextState.qiCurrent > nextState.qiMax) {
      nextState.qiCurrent = nextState.qiMax;
    }
    return nextState;
  }
}
