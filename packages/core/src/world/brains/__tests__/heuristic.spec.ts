import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "../../systems/ActionRegistry.js";
import type { AvailableAction } from "../../types.js";
import { HeuristicOptimizerBrain } from "../heuristic.js";
import type { BrainContext } from "../types.js";

describe("HeuristicOptimizerBrain", () => {
  const mockActions: AvailableAction[] = [
    { action: "rest", description: "Rest", possible: true },
    { action: "devour", targetId: "target-1", description: "Devour", possible: true },
    { action: "breakthrough", description: "Breakthrough", possible: true },
  ];

  // Force exploration-rate guard to always pass (Math.random() > EXPLORATION_RATE=0.2)
  // so we always exercise the optimizer branch and keep tests deterministic.
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should prefer breakthrough if available and qi is full", () => {
    const ctx: BrainContext = {
      qiCurrent: 100,
      qiMax: 100,
      qiRatio: 1,
      mood: 0.5,
      recentEvents: [],
    };
    const decision = HeuristicOptimizerBrain.decide(mockActions, ctx);
    expect(decision?.action).toBe("breakthrough");
  });

  it("should prefer devour if qi is low and we can afford the cost", () => {
    // Use brainDepth=1 (single-step lookahead) so devour's +40 qi gain
    // clearly beats rest's +5. With depth=5, both actions score equally after
    // N steps because qi gets capped at qiMax, so the tie-break is unpredictable.
    const ctx: BrainContext = {
      qiCurrent: 20,
      qiMax: 100,
      qiRatio: 0.2,
      mood: 0.5,
      brainDepth: 1,
      recentEvents: [],
    };

    // Breakthrough is not possible when qi is low
    const actions: AvailableAction[] = [
      { action: "rest", description: "Rest", possible: true },
      { action: "devour", targetId: "target-1", description: "Devour", possible: true },
      { action: "breakthrough", description: "Breakthrough", possible: false },
    ];

    const decision = HeuristicOptimizerBrain.decide(actions, ctx);
    expect(decision?.action).toBe("devour");
  });

  it("should fallback to rest if qi is too low to devour", () => {
    const ctx: BrainContext = {
      qiCurrent: 5,
      qiMax: 100,
      qiRatio: 0.05,
      mood: 0.5,
      recentEvents: [],
    };

    const actions: AvailableAction[] = [
      { action: "rest", description: "Rest", possible: true },
      // Too poor for devour (needs 10), but let's assume `devour` is passed as possible from world
      // initially, we test if the engine correctly filters it out due to local cost simulation.
      // Wait, we need to mock ActionRegistry.cost("devour") = 10 for the local simulator to know.
      { action: "devour", targetId: "target-1", description: "Devour", possible: true },
      { action: "breakthrough", description: "Breakthrough", possible: false },
    ];

    // Mock the cost function since ActionRegistry is singleton
    vi.spyOn(ActionRegistry, "cost").mockImplementation((id: string) => {
      if (id === "devour") return 10;
      return 0;
    });

    const decision = HeuristicOptimizerBrain.decide(actions, ctx);
    expect(decision?.action).toBe("rest");
  });
});
