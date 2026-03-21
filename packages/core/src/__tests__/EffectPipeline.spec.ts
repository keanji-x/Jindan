import { beforeEach, describe, expect, it } from "vitest";
import { EffectPipeline } from "../world/effects/EffectPipeline.js";
import type { Effect, EffectWorldContext } from "../world/effects/types.js";

describe("EffectPipeline", () => {
  let pipeline: EffectPipeline;
  let mockCtx: EffectWorldContext;

  beforeEach(() => {
    pipeline = new EffectPipeline();
    mockCtx = {} as EffectWorldContext;
  });

  it("should process effects without middlewares", () => {
    const originalEffects: Effect[] = [{ type: "test-effect" } as any];
    const result = pipeline.process(originalEffects, mockCtx);

    expect(result).toBe(originalEffects);
  });

  it("should run middlewares in order and allow next() propagation", () => {
    const log: string[] = [];

    pipeline.use((_effects, _ctx, next) => {
      log.push("mw1-enter");
      const res = next();
      log.push("mw1-exit");
      return res;
    });

    pipeline.use((_effects, _ctx, next) => {
      log.push("mw2-enter");
      const res = next();
      log.push("mw2-exit");
      return res;
    });

    pipeline.process([{ type: "test" } as any], mockCtx);

    expect(log).toEqual(["mw1-enter", "mw2-enter", "mw2-exit", "mw1-exit"]);
  });

  it("should allow a middleware to modify, add or drop effects", () => {
    pipeline.use((_effects, _ctx, next) => {
      // drop the original effects, provide a new one
      return next().concat([{ type: "appended" } as any]);
    });

    pipeline.use((effects, _ctx, _next) => {
      // map existing effects
      const modified = effects.map((e) => ({ ...e, modified: true }));
      // we must pass `modified` to next? wait, `next()` doesn't take arguments.
      // Next() invokes the original closure which captures the original array!
      // This is a typical koa-like middleware where effects are NOT passed to next().

      // Actually, looking at process: `next = () => mw(effects, ctx, nextFn)`
      // Every middleware receives the SAME `effects` array reference.
      // Modifying it in place works, or returning a new array works.
      modified.push({ type: "added-by-mw2" } as any);
      // don't call next(), just return modified to drop whatever is after?
      // Wait, let's call next() and ignore its result, OR return modified + next()
      return modified;
    });

    const result = pipeline.process([{ type: "original" } as any], mockCtx);

    // MW1 calls next() which runs MW2.
    // MW2 returns `modified` (original mutated + added-by-mw2).
    // MW1 receives that as `res`, and concats "appended".

    expect(result).toEqual([
      { type: "original", modified: true },
      { type: "added-by-mw2" },
      { type: "appended" },
    ]);
  });
});
