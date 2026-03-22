import { beforeEach, describe, expect, it } from "vitest";
import { UNIVERSE } from "../world/config/universe.config.js";
import { ActionRegistry } from "../world/systems/ActionRegistry.js";
import type { GameSystem } from "../world/systems/GameSystem.js";
import type { ActionDef } from "../world/systems/types.js";

describe("ActionRegistry", () => {
  beforeEach(() => {
    ActionRegistry._reset();
  });

  const mockAction1: ActionDef = {
    id: "action1",
    name: "Action 1",
    description: "Desc 1",
    qiCost: 10,
    needsTarget: true,
  };

  const mockAction2: ActionDef = {
    id: "action2",
    name: "Action 2",
    description: "Desc 2",
    qiCost: 0,
    needsTarget: false,
  };

  const mockSystem: GameSystem = {
    id: "system1",
    name: "System 1",
    actions: [mockAction1, mockAction2],
    handler: (_entity, _actionId, _ctx) => ({ status: "success" as const, successEffects: [] }),
  };

  it("should register a system and its actions", () => {
    ActionRegistry.registerSystem(mockSystem);

    expect(ActionRegistry.getSystems()).toHaveLength(1);
    expect(ActionRegistry.getAll()).toHaveLength(2);
    expect(ActionRegistry.get("action1")).toBeDefined();
    expect(ActionRegistry.getHandler("action1")).toBe(mockSystem.handler);

    // Check systemId assignment
    expect(ActionRegistry.get("action1")?.systemId).toBe("system1");
  });

  it("should throw an error if system provides actions but no handler", () => {
    const badSystem: GameSystem = {
      id: "bad",
      name: "Bad System",
      actions: [{ ...mockAction1, id: "badAction" }],
      // omit handler
    } as any;

    expect(() => ActionRegistry.registerSystem(badSystem)).toThrowError(
      "System Bad System provides actions but no handler",
    );
  });

  it("should successfully filter actions by species", () => {
    ActionRegistry.registerSystem(mockSystem);

    // Mock UNIVERSE.reactors for this test since forSpecies depends on it now.
    const originalReactors = UNIVERSE.reactors;
    UNIVERSE.reactors = {
      human: { actions: [mockAction1, mockAction2] },
      beast: { actions: [mockAction2] },
      plant: { actions: [] },
    } as any;

    const humanActions = ActionRegistry.forSpecies("human");
    expect(humanActions).toHaveLength(2);

    const beastActions = ActionRegistry.forSpecies("beast");
    expect(beastActions).toHaveLength(1);
    expect(beastActions[0].id).toBe("action2");

    const plantActions = ActionRegistry.forSpecies("plant");
    expect(plantActions).toHaveLength(0);

    UNIVERSE.reactors = originalReactors;
  });

  it("should return action details via helper methods", () => {
    ActionRegistry.registerSystem(mockSystem);

    expect(ActionRegistry.cost("action1")).toBe(10);
    expect(ActionRegistry.cost("action2")).toBe(0);
    expect(ActionRegistry.cost("unknown")).toBe(0);

    expect(ActionRegistry.name("action1")).toBe("Action 1");
    expect(ActionRegistry.name("unknown")).toBe("unknown");

    expect(ActionRegistry.desc("action1")).toBe("Desc 1");
    expect(ActionRegistry.desc("unknown")).toBe("");

    expect(ActionRegistry.needsTarget("action1")).toBe(true);
    expect(ActionRegistry.needsTarget("action2")).toBe(false);
    expect(ActionRegistry.needsTarget("unknown")).toBe(false);
  });

  it("should reset registry completely", () => {
    ActionRegistry.registerSystem(mockSystem);
    expect(ActionRegistry.getAll()).toHaveLength(2);

    ActionRegistry._reset();
    expect(ActionRegistry.getAll()).toHaveLength(0);
    expect(ActionRegistry.getSystems()).toHaveLength(0);
    expect(ActionRegistry.get("action1")).toBeUndefined();
    expect(ActionRegistry.getHandler("action1")).toBeUndefined();
  });
});
