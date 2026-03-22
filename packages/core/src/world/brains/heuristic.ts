import { ActionRegistry } from "../systems/ActionRegistry.js";
import type { AvailableAction } from "../types.js";
import { HeuristicSearchOptimizer } from "./optimizer/engine.js";
import { EntityActionSimulator, type EntityState } from "./optimizer/entity.js";
import { QiRatioObjective } from "./optimizer/objectives.js";
import type { AgentBrain, BrainContext, BrainDecision } from "./types.js";

// A pre-instantiated optimizer engine
const simulator = new EntityActionSimulator();
const objective = new QiRatioObjective();

/**
 * Default actions per tick (used when brainDepth not specified).
 * Each tick = 1-5 minutes, so 5 actions per tick is reasonable for simple creatures.
 * Smarter species (human) override this via brainDepth in ReactorTemplate.
 */
export const ACTIONS_PER_TICK = 5;

/**
 * Exploration rate: probability of picking a random affordable action
 * instead of the optimizer's best. Drives action diversity.
 */
const EXPLORATION_RATE = 0.2;

export const HeuristicOptimizerBrain: AgentBrain = {
  id: "heuristic_optimizer",

  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null {
    const possibleActions = actions.filter((a) => a.possible);
    if (possibleActions.length === 0) return { action: "rest" };

    if (Math.random() < EXPLORATION_RATE) {
      const pick = possibleActions[Math.floor(Math.random() * possibleActions.length)]!;
      return { action: pick.action, targetId: pick.targetId };
    }

    const depth = ctx.brainDepth ?? ACTIONS_PER_TICK;
    const optimizer = new HeuristicSearchOptimizer<EntityState, AvailableAction>();
    const initialState: EntityState = {
      qiCurrent: ctx.qiCurrent,
      qiMax: ctx.qiMax,
      mood: ctx.mood,
    };
    const getAvailableActions = (state: EntityState) =>
      actions.filter((a) => a.possible && state.qiCurrent >= (ActionRegistry.cost(a.action) ?? 0));

    const bestAction = optimizer.optimize(
      initialState,
      getAvailableActions,
      simulator,
      objective,
      depth,
    );
    return bestAction
      ? { action: bestAction.action, targetId: bestAction.targetId }
      : { action: "rest" };
  },

  decidePlan(actions: AvailableAction[], ctx: BrainContext): BrainDecision[] {
    const depth = ctx.brainDepth ?? ACTIONS_PER_TICK;
    const possibleActions = actions.filter((a) => a.possible);
    if (possibleActions.length === 0) return [{ action: "rest" }];

    const plan: BrainDecision[] = [];

    for (let step = 0; step < depth; step++) {
      // Exploration: 20% chance to pick a random action at each step
      if (Math.random() < EXPLORATION_RATE) {
        const pick = possibleActions[Math.floor(Math.random() * possibleActions.length)]!;
        plan.push({ action: pick.action, targetId: pick.targetId });
        continue;
      }

      // First non-exploration step: use full optimizer plan
      if (plan.length === 0 || plan.every((p) => p.action === "rest")) {
        const initialState: EntityState = {
          qiCurrent: ctx.qiCurrent,
          qiMax: ctx.qiMax,
          mood: ctx.mood,
        };

        const optimizer = new HeuristicSearchOptimizer<EntityState, AvailableAction>();

        const getAvailableActions = (state: EntityState) => {
          return actions.filter((a) => {
            if (!a.possible) return false;
            const cost = ActionRegistry.cost(a.action) ?? 0;
            return state.qiCurrent >= cost;
          });
        };

        const actionPlan = optimizer.optimizePlan(
          initialState,
          getAvailableActions,
          simulator,
          objective,
          depth,
        );

        // Convert full plan to BrainDecisions
        for (const a of actionPlan) {
          plan.push({ action: a.action, targetId: a.targetId });
        }
        break; // Optimizer already returned full plan
      }
    }

    return plan.slice(0, depth);
  },
};
