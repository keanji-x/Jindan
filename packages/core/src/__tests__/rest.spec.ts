import { describe, expect, it } from "vitest";
import { RestSystem } from "../world/systems/rest/index.js";
import type { ActionResolver } from "../world/systems/types.js";

describe("RestSystem", () => {
  const handler = RestSystem.handler as ActionResolver;

  it("should return success and emit report event when entity rests", () => {
    const entity: any = {
      id: "e1",
      name: "Tester",
      components: { tank: {} }, // Just needs to exist
    };

    const ctx: any = { actionCost: 0, tick: 5 };

    const result = handler(entity, "rest", ctx) as any;

    expect(result.status).toBe("success");
    expect(result.successEffects).toHaveLength(1);
    expect(result.successEffects[0].type).toBe("emit_event");
    expect(result.successEffects[0].event.tick).toBe(5);
    expect(result.successEffects[0].event.data.actionId).toBe("rest");
    expect(result.rested).toBe(true);
  });

  it("should fail gracefully if entity has no tank component", () => {
    const entity: any = {
      id: "e1",
      name: "Tester",
      components: {}, // No tank
    };

    const ctx: any = { actionCost: 0, tick: 1 };

    const result = handler(entity, "rest", ctx) as any;

    expect(result.status).toBe("aborted");
    expect(result.reason).toMatch(/粒子储罐/);
  });
});
