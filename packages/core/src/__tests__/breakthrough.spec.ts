import { describe, expect, it } from "vitest";
import { EventBus } from "../EventBus.js";
import { BALANCE } from "../world/config/balance.config.js";
import { applyParams } from "../world/config/TunableParams.js";
import { doAbsorb } from "../world/systems/handlers/absorb.js";
import { doBreakthrough } from "../world/systems/handlers/breakthrough.js";
import type { ActionContext } from "../world/systems/types.js";
import type { Entity, WorldEvent } from "../world/types.js";

function makeHuman(qi: number, _maxQi = 200, realm = 1): Entity {
  return {
    id: "test_human",
    soulId: "test_soul",
    name: "测试员",
    species: "human",
    status: "alive" as const,
    sentient: true,
    life: { article: "", events: [] },
    components: {
      tank: {
        tanks: { ql: qi, qs: 0 },
        coreParticle: "ql" as const,
      },
      cultivation: { realm },
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
      getRelation: () => 0,
      adjustRelation: (_a: string, _b: string, _delta: number) => 0,
    },
    events: collected,
  };
}

describe("Breakthrough System", () => {
  it("empirical success rate scales with qi ratio (P = ratio^k)", () => {
    applyParams(BALANCE);

    // At realm=1, proportionLimit=0.05. With total=30000, maxQi = 1500
    // ratio = 1400/1500 ≈ 0.933, P = 0.933^k
    let successes = 0;
    const N = 1000;

    for (let i = 0; i < N; i++) {
      const e = makeHuman(1400);
      const { ctx } = makeContext(1000);
      const res = doBreakthrough(e, "breakthrough", ctx);
      if (res.status === "success") successes++;
    }

    const rate = successes / N;
    console.log(`  Breakthrough rate (ratio≈0.93): ${(rate * 100).toFixed(1)}%`);
    // With k=3: P = 0.933^3 ≈ 0.812
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(1.0);
  });

  it("80% qi threshold allows breakthrough attempt", () => {
    applyParams(BALANCE);

    const e = makeHuman(1350); // Just at threshold: 1350/30000 = 4.5% ~= 0.05 * 0.9
    const { ctx } = makeContext(1000);
    const res = doBreakthrough(e, "breakthrough", ctx);
    // Should NOT fail with "灵气占比不足" — it should attempt (either success or failure, not aborted)
    expect(res.status).not.toBe("aborted");
  });

  it("very low qi has near-zero success rate but still attempts", () => {
    applyParams(BALANCE);

    let successes = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const e = makeHuman(1); // ratio ≈ 0.0007, P ≈ 0
      const { ctx } = makeContext(1000);
      const res = doBreakthrough(e, "breakthrough", ctx);
      if (res.status === "success") successes++;
    }

    const rate = successes / N;
    console.log(`  Breakthrough rate (ratio≈0): ${(rate * 100).toFixed(1)}%`);
    // Should almost never succeed
    expect(rate).toBeLessThan(0.05);
  });
});

describe("Meditation Feedback", () => {
  it("warns when ambient qi is scarce", () => {
    applyParams(BALANCE);

    const e = makeHuman(100); // plenty of room to absorb
    const { ctx } = makeContext(2); // almost no ambient ql!
    const res = doAbsorb(e, "meditate", ctx);

    const effects = res.successEffects ?? [];
    const warnings = effects.filter(
      (eff) => eff.type === "emit_event" && "event" in eff && eff.event.type === "system_warning",
    );
    console.log(`  Warnings emitted: ${warnings.length}`);
    if (warnings.length > 0) {
      console.log(`  Message: ${(warnings[0] as { event: { message: string } }).event.message}`);
    }
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect((warnings[0] as { event: { message: string } }).event.message).toContain("灵气稀薄");
  });

  it("no warning when ambient qi is plentiful", () => {
    applyParams(BALANCE);

    const e = makeHuman(100);
    const { ctx } = makeContext(1000); // plenty of ambient ql
    const res = doAbsorb(e, "meditate", ctx);

    const effects = res.successEffects ?? [];
    const warnings = effects.filter(
      (eff) => eff.type === "emit_event" && "event" in eff && eff.event.type === "system_warning",
    );
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
