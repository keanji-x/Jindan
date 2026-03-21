import type { ObjectiveFunction, Optimizer, StateSimulator } from "./types.js";

export class HeuristicSearchOptimizer<S, A> implements Optimizer<S, A> {
  optimize(
    initialState: S,
    availableActions: (state: S) => A[],
    simulator: StateSimulator<S, A>,
    objective: ObjectiveFunction<S>,
    depth: number,
  ): A | null {
    const actions = availableActions(initialState);
    if (actions.length === 0) return null;

    let bestAction: A | null = null;
    let bestScore = -Infinity;

    for (const action of actions) {
      const score = this.evaluateAction(
        initialState,
        action,
        availableActions,
        simulator,
        objective,
        depth,
      );

      // Slight randomness to resolve ties dynamically rather than always selecting the first one
      const jitter = Math.random() * 0.0001;
      const finalScore = score + jitter;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestAction = action;
      }
    }

    return bestAction;
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
