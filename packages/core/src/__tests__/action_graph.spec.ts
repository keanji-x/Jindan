import { describe, expect, it } from "vitest";
import { GraphRegistry } from "../world/effects/GraphRegistry.js";
import type { ActionGraphDef } from "../world/effects/types.js";
import { World } from "../world/World.js";

describe("ActionGraph Execution (Gongfa)", () => {
  it("executes a multi-tick static graph (5x Meditate)", () => {
    // 1. Setup world and entity
    const world = new World();
    const entity = world.createEntity("Test Cultivator", "human");

    // Clear initial qi for predictable testing
    const core = entity.components.tank!.coreParticle;
    entity.components.tank!.tanks[core] = 10;
    const initialQi = entity.components.tank!.tanks[core]!;

    // 2. Register a static Gongfa graph (5 ticks of meditation)
    const gongfaId = "gongfa_meditate_5x";
    const gongfaDef: ActionGraphDef = {
      id: gongfaId,
      name: "五息吐纳法",
      description: "连续吸纳天地灵气五次",
      entryNode: "n1",
      species: ["human"],
      nodes: [
        {
          nodeId: "n1",
          actionId: "meditate",
          repeat: 5,
        },
      ],
      edges: [],
    };
    GraphRegistry.register(gongfaDef);

    // 3. Initiate the action
    const startResult = world.performAction(entity.id, gongfaId);
    expect(startResult.success).toBe(true);

    // Entity should now have an active graph
    expect(entity.components.actionGraph).toBeDefined();
    expect(entity.components.actionGraph!.graphId).toBe(gongfaId);
    expect(entity.components.actionGraph!.currentRepeatCount).toBe(1); // executed once on invocation

    const qiAfterTick1 = entity.components.tank!.tanks[core]!;
    expect(qiAfterTick1).toBeGreaterThan(initialQi);

    // 4. Advance 4 more ticks
    for (let i = 0; i < 4; i++) {
      world.settle();
    }

    // It should have repeated exactly 5 times (1 invocation + 4 settles)
    expect(entity.components.actionGraph).toBeUndefined(); // Graph finished!

    const finalQi = entity.components.tank!.tanks[core]!;
    expect(finalQi).toBeGreaterThan(qiAfterTick1);

    // After graph completes, settle should still apply passive drain
    // but entity keeps its qi (may lose small amount to drain)
    const snapshotQi = finalQi;
    world.settle();
    // Qi may decrease slightly due to passive drain, but shouldnt increase
    expect(entity.components.tank!.tanks[core]!).toBeLessThanOrEqual(snapshotQi);
  });
});
