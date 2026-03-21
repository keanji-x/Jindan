// ============================================================
// EffectPipeline — uniform execution engine for declarative effects
//
// Passes an array of Effects through a middleware chain before
// yielding the final array to be applied by the World.
// ============================================================

import type { Effect, EffectMiddleware, EffectWorldContext } from "./types.js";

export class EffectPipeline {
  private middlewares: EffectMiddleware[] = [];

  /** Add a middleware to the pipeline */
  use(mw: EffectMiddleware): void {
    this.middlewares.push(mw);
  }

  /**
   * Run the effects through all registered middlewares.
   * Middlewares can intercept, inspect, drop, or append effects.
   */
  process(effects: Effect[], ctx: EffectWorldContext): Effect[] {
    // Build the middleware chain backwards so that next() works automatically
    let next: () => Effect[] = () => effects;

    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      const nextFn = next; // capture current next

      next = () => mw(effects, ctx, nextFn);
    }

    // Trigger the chain
    return next();
  }
}
