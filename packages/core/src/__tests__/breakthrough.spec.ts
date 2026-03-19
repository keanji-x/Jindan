import { describe, expect, it } from "vitest";
import { EventBus } from "../EventBus.js";
import { BALANCE } from "../engine/balance.config.js";
import { UNIVERSE } from "../engine/index.js";
import { applyParams } from "../engine/TunableParams.js";
import type { ActionContext } from "../entity/actions/types.js";
import type { Entity } from "../entity/types.js";
import { doAbsorb } from "../world/AbsorbSystem.js";
import { doBreakthrough } from "../world/BreakthroughSystem.js";
import type { WorldEvent } from "../world/types.js";

function makeHuman(qi: number, maxQi = 200, realm = 1): Entity {
  return {
    id: "test_human",
    name: "测试员",
    species: "human",
    alive: true,
    components: {
      tank: {
        tanks: { ql: qi, qs: 0 },
        maxTanks: { ql: maxQi, qs: 0 },
        coreParticle: "ql",
      },
      cultivation: { realm },
      combat: { power: 10 },
    },
  };
}

function makeContext(ambientQl: number): { ctx: ActionContext; events: WorldEvent[] } {
  const bus = new EventBus();
  const collected: WorldEvent[] = [];
  bus.onAny((e) => collected.push(e));
  return {
    ctx: {
      actionCost: 3,
      ambientPool: { pools: { ql: ambientQl, qs: 500 }, total: 30000 },
      tick: 1,
      events: bus,
    },
    events: collected,
  };
}

describe("Breakthrough System", () => {
  it("empirical success rate at 90% qi", () => {
    applyParams(BALANCE);

    let successes = 0;
    const N = 1000;

    for (let i = 0; i < N; i++) {
      const e = makeHuman(180);
      const { ctx } = makeContext(1000);
      const res = doBreakthrough(e, "breakthrough", ctx);
      if (res.success) successes++;
    }

    const rate = successes / N;
    console.log(`  Breakthrough rate (90% qi, ambient=1000): ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.8);
  });

  it("80% qi threshold allows breakthrough attempt", () => {
    applyParams(BALANCE);

    const e = makeHuman(160); // 80% of 200
    const { ctx } = makeContext(1000);
    const res = doBreakthrough(e, "breakthrough", ctx);
    // Should NOT fail with "灵气未臻圆满" — it should attempt
    expect(res.reason).not.toBe(
      `灵气未臻圆满(需${Math.round(UNIVERSE.breakthrough.minQiRatio * 100)}%容量)`,
    );
  });

  it("below threshold rejects breakthrough", () => {
    applyParams(BALANCE);

    const e = makeHuman(150); // 75% of 200 — below 80%
    const { ctx } = makeContext(1000);
    const res = doBreakthrough(e, "breakthrough", ctx);
    expect(res.success).toBe(false);
    expect(res.reason).toContain("灵气未臻圆满");
  });
});

describe("Meditation Feedback", () => {
  it("warns when ambient qi is scarce", () => {
    applyParams(BALANCE);

    const e = makeHuman(100); // plenty of room to absorb
    const { ctx, events } = makeContext(2); // almost no ambient ql!
    doAbsorb(e, "meditate", ctx);

    const warnings = events.filter((ev) => ev.type === "system_warning");
    console.log(`  Warnings emitted: ${warnings.length}`);
    if (warnings.length > 0) {
      console.log(`  Message: ${warnings[0]!.message}`);
    }
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]!.message).toContain("灵气稀薄");
  });

  it("no warning when ambient qi is plentiful", () => {
    applyParams(BALANCE);

    const e = makeHuman(100);
    const { ctx, events } = makeContext(1000); // plenty of ambient ql
    doAbsorb(e, "meditate", ctx);

    const warnings = events.filter((ev) => ev.type === "system_warning");
    expect(warnings.length).toBe(0);
  });

  it("absorbed amount reflects available ambient qi", () => {
    applyParams(BALANCE);

    // Low ambient
    const e1 = makeHuman(100);
    const { ctx: ctx1 } = makeContext(5);
    const res1 = doAbsorb(e1, "meditate", ctx1);

    // High ambient
    const e2 = makeHuman(100);
    const { ctx: ctx2 } = makeContext(1000);
    const res2 = doAbsorb(e2, "meditate", ctx2);

    console.log(`  Absorbed (ambient=5): ${res1.absorbed}`);
    console.log(`  Absorbed (ambient=1000): ${res2.absorbed}`);

    expect(res2.absorbed).toBeGreaterThan(res1.absorbed as number);
  });
});
