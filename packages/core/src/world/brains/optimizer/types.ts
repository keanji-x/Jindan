/**
 * Predicts the next state given a current state and an action.
 */
export interface StateSimulator<S, A> {
  simulate(state: S, action: A): S;
}

/**
 * Evaluates a state and returns a utility score.
 */
export interface ObjectiveFunction<S> {
  evaluate(state: S): number;
}

/**
 * An optimizer that searches for the best sequence of actions.
 */
export interface Optimizer<S, A> {
  optimize(
    initialState: S,
    availableActions: (state: S) => A[],
    simulator: StateSimulator<S, A>,
    objective: ObjectiveFunction<S>,
    depth: number,
  ): A | null;
}
