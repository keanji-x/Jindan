import { beforeEach, describe, expect, it } from "vitest";
import { GraphValidator } from "../world/effects/GraphValidator.js";
import type { ActionGraphDef } from "../world/effects/types.js";
import { ActionRegistry } from "../world/systems/ActionRegistry.js";
import type { ActionDef } from "../world/systems/types.js";

describe("GraphValidator", () => {
  beforeEach(() => {
    ActionRegistry._reset();
  });

  it("validates safe topologies gracefully", () => {
    const act1: ActionDef = {
      id: "act1",
      name: "Act1",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
      constraints: { cannotFollow: ["forbidden_act"] },
    };
    const act2: ActionDef = {
      id: "act2",
      name: "Act2",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
    };

    // Using a mock system for the tests to skip handler registration error

    ActionRegistry.registerSystem({
      id: "mock1",
      name: "mock1",
      actions: [act1, act2],
      handler: () => ({ status: "success" }),
    });

    const graph: ActionGraphDef = {
      id: "g1",
      name: "G1",
      description: "Safe Graph",
      entryNode: "n1",
      species: [],
      nodes: [
        { nodeId: "n1", actionId: "act1" },
        { nodeId: "n2", actionId: "act2" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };

    const res = GraphValidator.validate(graph);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it("fails topological check on cannotFollow constraint", () => {
    const act1: ActionDef = {
      id: "act1",
      name: "Act1",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
    };
    const act2: ActionDef = {
      id: "act2",
      name: "Act2",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
      constraints: { cannotFollow: ["act1"] },
    };

    ActionRegistry.registerSystem({
      id: "mock2",
      name: "mock2",
      actions: [act1, act2],
      handler: () => ({ status: "success" }),
    });

    const graph: ActionGraphDef = {
      id: "g2",
      name: "G2",
      description: "Unsafe Forward",
      entryNode: "n1",
      species: [],
      nodes: [
        { nodeId: "n1", actionId: "act1" },
        { nodeId: "n2", actionId: "act2" },
      ],
      edges: [
        { from: "n1", to: "n2" }, // this is invalid because act2 cannot follow act1
      ],
    };

    const res = GraphValidator.validate(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("is blacklisted from following 'act1'");
  });

  it("fails topological check on cannotPrecede constraint", () => {
    const act1: ActionDef = {
      id: "act1",
      name: "Act1",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
      constraints: { cannotPrecede: ["act2"] },
    };
    const act2: ActionDef = {
      id: "act2",
      name: "Act2",
      description: "test",
      needsTarget: false,
      species: [],
      qiCost: 0,
    };

    ActionRegistry.registerSystem({
      id: "mock3",
      name: "mock3",
      actions: [act1, act2],
      handler: () => ({ status: "success" }),
    });

    const graph: ActionGraphDef = {
      id: "g3",
      name: "G3",
      description: "Unsafe Backward",
      entryNode: "n1",
      species: [],
      nodes: [
        { nodeId: "n1", actionId: "act1" },
        { nodeId: "n2", actionId: "act2" },
      ],
      edges: [
        { from: "n1", to: "n2" }, // invalid because act1 cannot precede act2
      ],
    };

    const res = GraphValidator.validate(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("is blacklisted from preceding 'act2'");
  });
});
