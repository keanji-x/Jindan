import { describe, expect, it, vi } from "vitest";
import { AiRegistry } from "../world/ai/AiRegistry.js";
import { MiasmaBrain } from "../world/ai/miasma.js";
import { WeedBrain } from "../world/ai/weed.js";

describe("Built-in NPC AI Brains", () => {
  describe("AiRegistry", () => {
    it("should carry predefined brains", () => {
      expect(AiRegistry.get("weed_brain")).toBeDefined();
      expect(AiRegistry.get("miasma_brain")).toBeDefined();
    });

    it("should allow registering custom brains", () => {
      AiRegistry.register({ id: "custom", decide: vi.fn() as any });
      expect(AiRegistry.get("custom")).toBeDefined();
    });
  });

  describe("WeedBrain", () => {
    it("should decide to photosynth if available in actions", () => {
      const decision = WeedBrain.decide(
        [{ action: "photosynth", possible: true, description: "" }],
        { qiRatio: 0.5, recentEvents: [] },
      );
      expect(decision).toEqual({ action: "photosynth" });
    });

    it("should fallback to rest if photosynth not available", () => {
      const decision = WeedBrain.decide(
        [{ action: "some_other", possible: true, description: "" }],
        { qiRatio: 0.5, recentEvents: [] },
      );
      expect(decision).toEqual({ action: "rest" });
    });

    it("should prioritize breakthrough if available", () => {
      const decision = WeedBrain.decide(
        [
          { action: "breakthrough", possible: true, description: "" },
          { action: "photosynth", possible: true, description: "" },
        ],
        { qiRatio: 0.5, recentEvents: [] },
      );
      expect(decision).toEqual({ action: "breakthrough" });
    });
  });

  describe("MiasmaBrain", () => {
    it("should prioritize devour if target is available and hungry (qiRatio < 0.5)", () => {
      const decision = MiasmaBrain.decide(
        [{ action: "devour", possible: true, targetId: "target1", description: "" }],
        { qiRatio: 0.4, recentEvents: [] },
      );
      expect(decision).toEqual({ action: "devour", targetId: "target1" });
    });

    it("should prioritize breakthrough/moonlight if not hungry", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.9); // disable 20% devour chance
      const decision = MiasmaBrain.decide(
        [
          { action: "devour", possible: true, targetId: "t1", description: "" },
          { action: "moonlight", possible: true, description: "" },
        ],
        { qiRatio: 0.8, recentEvents: [] },
      );
      expect(decision?.action).toEqual("moonlight");
    });

    it("should fallback to rest if nothing else to do", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.9);
      const decision = MiasmaBrain.decide([], { qiRatio: 0.8, recentEvents: [] });
      expect(decision?.action).toBe("rest");
    });
  });
});
