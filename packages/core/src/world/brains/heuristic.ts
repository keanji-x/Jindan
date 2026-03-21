import { ActionRegistry } from "../systems/ActionRegistry.js";
import type { AvailableAction } from "../types.js";
import { HeuristicSearchOptimizer } from "./optimizer/engine.js";
import { EntityActionSimulator, type EntityState } from "./optimizer/entity.js";
import { QiRatioObjective } from "./optimizer/objectives.js";
import type { AgentBrain, BrainContext, BrainDecision } from "./types.js";

// A pre-instantiated optimizer engine
const simulator = new EntityActionSimulator();
const objective = new QiRatioObjective();
const searchDepth = 2; // N-degree lookahead (N=2 is usually plenty for these heuristic states)

export const HeuristicOptimizerBrain: AgentBrain = {
  id: "heuristic_optimizer",
  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null {
    const initialState: EntityState = {
      qiCurrent: ctx.qiCurrent,
      qiMax: ctx.qiMax,
    };

    const optimizer = new HeuristicSearchOptimizer<EntityState, AvailableAction>();

    // The available actions function filters out actions that the simulated future state cannot afford.
    const getAvailableActions = (state: EntityState) => {
      return actions.filter((a) => {
        // Only consider actions that were initially possible
        if (!a.possible) return false;

        // Ensure state has enough Qi for the action
        const cost = ActionRegistry.cost(a.action) ?? 0;
        return state.qiCurrent >= cost;
      });
    };

    const bestAction = optimizer.optimize(
      initialState,
      getAvailableActions,
      simulator,
      objective,
      searchDepth,
    );

    if (bestAction) {
      return {
        action: bestAction.action,
        targetId: bestAction.targetId,
      };
    }

    // Fallback if nothing is optimal or affordable
    return { action: "rest" };
  },
};
