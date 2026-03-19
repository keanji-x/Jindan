import { expect, describe, it, vi } from "vitest";
import { World } from "./world/World.js";
import { attachFileLogger } from "./logger.js";

describe("World E2E Simulation Harness", () => {
  it("should run the world autonomously for N ticks without crashing", () => {
    const world = new World();
    attachFileLogger(world);
    const observer = world.createEntity("太上老君", "human");

    let tickCount = 0;
    world.events.onAny((e) => {
      if (e.type === "tick_complete") {
        tickCount++;
      }
    });

    const TARGET_TICKS = 5;
    const MAX_ITERATIONS = 5000;
    let iterations = 0;

    // Fast-forward simulation synchronously
    // Because setTimeout is used in processNextTick, we'll use vi.useFakeTimers
    vi.useFakeTimers();

    while (world.tick < TARGET_TICKS && iterations < MAX_ITERATIONS) {
      iterations++;

      const allAlive = world.getAliveEntities();
      if (allAlive.length === 0) {
        break; // Everyone died, but the engine didn't crash
      }

      // Pick a random alive entity to drive the flux
      const actor = allAlive[Math.floor(Math.random() * allAlive.length)]!;
      const actions = world.getAvailableActions(actor.id);
      const valid = actions.filter((a) => a.possible);

      if (valid.length > 0) {
        const choice = valid[Math.floor(Math.random() * valid.length)]!;
        const res = world.performAction(actor.id, choice.action, choice.targetId);
        if (!res.success) {
           // Might fail if not targetable during loop?
        }
      } else {
        world.performAction(actor.id, "rest");
      }

      // Fast-forward timers to flush tick triggers
      vi.runAllTimers();
    }

    vi.useRealTimers();

    // Proves flux generates ticks
    expect(world.tick).toBeGreaterThan(0);
    // Proves we didn't infinite loop without ticks
    expect(iterations).toBeLessThan(MAX_ITERATIONS);

    // Assert structural integrity
    const state = world.getSnapshot();
    expect(state.entities).toBeDefined();
    expect(state.ambientPool).toBeDefined();
    expect(Array.isArray(state.entities)).toBe(true);
  });
});
