import { ActionRegistry } from "../../systems/ActionRegistry.js";
import type { AvailableAction } from "../../types.js";
import type { StateSimulator } from "./types.js";

export interface EntityState {
  qiCurrent: number;
  qiMax: number;
}

export class EntityActionSimulator implements StateSimulator<EntityState, AvailableAction> {
  simulate(state: EntityState, action: AvailableAction): EntityState {
    const nextState = { ...state };

    const cost = ActionRegistry.cost(action.action) ?? 0;
    nextState.qiCurrent -= cost;
    if (nextState.qiCurrent < 0) nextState.qiCurrent = 0;

    switch (action.action) {
      case "rest":
        nextState.qiCurrent += 2; // Basic idle regen
        break;
      case "photosynth":
      case "absorb":
      case "moonlight":
        nextState.qiCurrent += 5;
        break;
      case "devour":
        // Heuristic: assumed payout minus the risk factor.
        // It costs 10, yields maybe 20. Net gain +10 over cost.
        nextState.qiCurrent += 20;
        break;
      case "breakthrough":
        // Breakthrough doubles max qi conceptually
        nextState.qiMax *= 2;
        nextState.qiCurrent = nextState.qiMax;
        break;
      default:
        break;
    }

    if (nextState.qiCurrent > nextState.qiMax) {
      nextState.qiCurrent = nextState.qiMax;
    }
    return nextState;
  }
}
