import type { ObjectiveFunction, Optimizer, StateSimulator } from "./types.js";

export class HeuristicSearchOptimizer<S, A> implements Optimizer<S, A> {
  /** Returns only the best first action (original behavior) */
  optimize(
    initialState: S,
    availableActions: (state: S) => A[],
    simulator: StateSimulator<S, A>,
    objective: ObjectiveFunction<S>,
    depth: number,
  ): A | null {
    const plan = this.optimizePlan(initialState, availableActions, simulator, objective, depth);
    return plan.length > 0 ? plan[0]! : null;
  }

  /**
   * Returns the full N-step optimal action plan.
   * Each step is greedily chosen: pick the best action at each level,
   * then simulate forward and repeat.
   */
  optimizePlan(
    initialState: S,
    availableActions: (state: S) => A[],
    simulator: StateSimulator<S, A>,
    objective: ObjectiveFunction<S>,
    depth: number,
  ): A[] {
    const plan: A[] = [];
    let currentState = initialState;

    for (let step = 0; step < depth; step++) {
      const actions = availableActions(currentState);
      if (actions.length === 0) break;

      let bestAction: A | null = null;
      let bestScore = -Infinity;
      const remainingDepth = depth - step;

      for (const action of actions) {
        const score = this.evaluateAction(
          currentState,
          action,
          availableActions,
          simulator,
          objective,
          remainingDepth,
        );

        const jitter = Math.random() * 0.0001;
        const finalScore = score + jitter;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestAction = action;
        }
      }

      if (!bestAction) break;
      plan.push(bestAction);
      currentState = simulator.simulate(currentState, bestAction);
    }

    return plan;
  }

  private evaluateAction(
    state: S,
    action: A,
    availableActions: (state: S) => A[],
    simulator: StateSimulator<S, A>,
    objective: ObjectiveFunction<S>,
    depth: number,
  ): number {
    const nextState = simulator.simulate(state, action);

    // Evaluate at leaves
    if (depth <= 1) {
      return objective.evaluate(nextState);
    }

    const nextActions = availableActions(nextState);
    if (nextActions.length === 0) {
      return objective.evaluate(nextState);
    }

    let maxNextScore = -Infinity;
    for (const nextAction of nextActions) {
      const branchScore = this.evaluateAction(
        nextState,
        nextAction,
        availableActions,
        simulator,
        objective,
        depth - 1,
      );
      if (branchScore > maxNextScore) {
        maxNextScore = branchScore;
      }
    }

    // Optional discount factor to prefer earlier rewards if scores are identical
    return maxNextScore * 0.99;
  }
}
