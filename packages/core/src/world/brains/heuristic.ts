import { ActionRegistry } from "../systems/ActionRegistry.js";
import type { AvailableAction } from "../types.js";
import { HeuristicSearchOptimizer } from "./optimizer/engine.js";
import { EntityActionSimulator, type EntityState } from "./optimizer/entity.js";
import { DEFAULT_PERSONALITY, PersonalityObjective } from "./optimizer/PersonalityObjective.js";
import type { AgentBrain, BrainContext, BrainDecision } from "./types.js";

// A pre-instantiated simulator (stateless, can be shared)
const simulator = new EntityActionSimulator();

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
const EXPLORATION_RATE = 0.35;

export const HeuristicOptimizerBrain: AgentBrain = {
  id: "heuristic_optimizer",

  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null {
    const possibleActions = actions.filter((a) => a.possible);
    if (possibleActions.length === 0) return { action: "rest" };

    if (Math.random() < EXPLORATION_RATE) {
      const pick = possibleActions[Math.floor(Math.random() * possibleActions.length)]!;
      return { action: pick.action, targetId: pick.targetId };
    }

    const personality = ctx.personality ?? DEFAULT_PERSONALITY;
    const objective = new PersonalityObjective(personality);
    const depth = ctx.brainDepth ?? ACTIONS_PER_TICK;
    const optimizer = new HeuristicSearchOptimizer<EntityState, AvailableAction>();
    const initialState: EntityState = {
      qiCurrent: ctx.qiCurrent,
      qiMax: ctx.qiMax,
      mood: ctx.mood,
      avgRelation: ctx.avgRelation ?? 0,
      personality,
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

    const personality = ctx.personality ?? DEFAULT_PERSONALITY;
    const objective = new PersonalityObjective(personality);

    const initialState: EntityState = {
      qiCurrent: ctx.qiCurrent,
      qiMax: ctx.qiMax,
      mood: ctx.mood,
      avgRelation: ctx.avgRelation ?? 0,
      personality,
    };

    const optimizer = new HeuristicSearchOptimizer<EntityState, AvailableAction>();
    const getAvailableActions = (state: EntityState) =>
      actions.filter((a) => a.possible && state.qiCurrent >= (ActionRegistry.cost(a.action) ?? 0));

    // Get full optimizer plan once
    const optimizerPlan = optimizer.optimizePlan(
      initialState,
      getAvailableActions,
      simulator,
      objective,
      depth,
    );

    // Merge: each step has EXPLORATION_RATE chance of going random
    const plan: BrainDecision[] = [];
    for (let step = 0; step < depth; step++) {
      if (Math.random() < EXPLORATION_RATE) {
        const pick = possibleActions[Math.floor(Math.random() * possibleActions.length)]!;
        plan.push({ action: pick.action, targetId: pick.targetId });
      } else {
        const optimizerStep = optimizerPlan[step];
        if (optimizerStep)
          plan.push({ action: optimizerStep.action, targetId: optimizerStep.targetId });
        else plan.push({ action: "rest" });
      }
    }

    return plan;
  },
};
