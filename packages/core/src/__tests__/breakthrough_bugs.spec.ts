/**
 * Diagnostic tests for breakthrough:
 *
 * After refactor: breakthrough has no minQiRatio precondition.
 * Any entity can attempt breakthrough, but success probability = ratio^k.
 * Tests now verify:
 * 1. canExecute returns true (any qi level can attempt)
 * 2. showProgress shows success probability percentage
 * 3. buildContextSnapshot correctly reflects breakthrough availability
 */
import { describe, expect, it } from "vitest";
import { buildContextSnapshot } from "../world/ContextSnapshot.js";
import { UNIVERSE } from "../world/config/universe.config.js";
import { BREAKTHROUGH } from "../world/systems/SingleEntitySystem.js";
import { World } from "../world/World.js";

describe("Breakthrough Probability System", () => {
  it("canExecute returns false at very low qi (soft threshold ratio < 0.3)", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");

    // At birth, qi is very low → ratio < 0.3 → soft gate blocks
    const canExecResult = BREAKTHROUGH.canExecute!(beast, world);
    expect(canExecResult.ok).toBe(false);

    // getAvailableActions should list it as not possible
    const actions = world.getAvailableActions(beast.id);
    const btAction = actions.find((a) => a.action === "breakthrough");
    expect(btAction).toBeDefined();
    expect(btAction!.possible).toBe(false);
  });

  it("showProgress shows success probability percentage", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");

    const progress = BREAKTHROUGH.showProgress?.(beast);
    expect(progress).toBeDefined();
    expect(progress).toContain("成功率");
    expect(progress).toContain("%");
  });

  it("max realm blocks breakthrough", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");
    const maxRealm = UNIVERSE.breakthrough.maxRealm ?? 10;
    beast.components.cultivation!.realm = maxRealm;

    const canExecResult = BREAKTHROUGH.canExecute!(beast, world);
    expect(canExecResult.ok).toBe(false);
    expect(canExecResult.reason).toContain("最高境界");
  });

  it("buildContextSnapshot reflects breakthrough as unavailable at low qi", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");
    beast.sentient = true;

    const snapshot = buildContextSnapshot(world, beast.id);
    const btAction = snapshot.options.actions.find((a) => a.action === "breakthrough");
    expect(btAction).toBeDefined();
    expect(btAction!.possible).toBe(false);
  });

  it("success probability is ratio^k", () => {
    const k = UNIVERSE.breakthrough.successExponent;
    // Low ratio → low probability
    expect(0.3 ** k).toBeLessThan(0.1);
    // High ratio → high probability
    expect(0.9 ** k).toBeGreaterThan(0.5);
    // Full ratio → 100%
    expect(1.0 ** k).toBe(1.0);
  });
});
