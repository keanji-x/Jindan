/**
 * Diagnostic tests for two breakthrough bugs:
 *
 * BUG 1: isBreakthroughReady=true when qi is far below threshold
 *   - canExecute code is correct (verified in container), but
 *     getAvailableActions returns possible=true anyway
 *
 * BUG 2: showProgress not appearing in breakthrough description
 *   - BREAKTHROUGH.showProgress function exists, but description
 *     shows bare "突破" instead of "突破 (12% 还需XXXqs)"
 */
import { describe, expect, it } from "vitest";
import { buildContextSnapshot } from "../world/ContextSnapshot.js";
import { UNIVERSE } from "../world/config/universe.config.js";
import { ActionRegistry } from "../world/systems/ActionRegistry.js";
import { BREAKTHROUGH } from "../world/systems/SingleEntitySystem.js";
import { World } from "../world/World.js";

describe("Breakthrough Bug Diagnosis", () => {
  it("BUG 1: getAvailableActions should return possible=false for breakthrough at low qi", () => {
    const world = new World();
    // Create a beast with only birthCost qi (120 qs for beast)
    const beast = world.createEntity("测试妖兽", "beast");

    console.log(`  Beast: id=${beast.id} species=${beast.species}`);
    console.log(
      `  Tank: core=${beast.components.tank?.coreParticle} tanks=`,
      beast.components.tank?.tanks,
    );
    console.log(`  Realm: ${beast.components.cultivation?.realm}`);

    const qi = beast.components.tank?.tanks[beast.components.tank.coreParticle] ?? 0;
    console.log(`  QI: ${qi}`);

    // Calculate what canExecute should compute
    const limit = UNIVERSE.reactors.beast.proportionLimit(beast.components.cultivation!.realm);
    const minQiRatio = UNIVERSE.breakthrough.minQiRatio;
    const needed = limit * minQiRatio * UNIVERSE.totalParticles;
    console.log(`  proportionLimit: ${limit}`);
    console.log(`  minQiRatio: ${minQiRatio}`);
    console.log(`  needed: ${needed} (qi=${qi} < needed=${needed}: ${qi < needed})`);

    // 1a. Test canExecute directly with the BREAKTHROUGH constant
    const canExecResult = BREAKTHROUGH.canExecute!(beast, world);
    console.log(`  BREAKTHROUGH.canExecute result:`, canExecResult);
    expect(canExecResult.ok).toBe(false);

    // 1b. Test canExecute from the beast reactor's actions array
    const beastReactor = UNIVERSE.reactors.beast;
    const btFromReactor = beastReactor.actions.find((a) => a.id === "breakthrough");
    console.log(`  btFromReactor has canExecute? ${typeof btFromReactor?.canExecute}`);
    if (btFromReactor?.canExecute) {
      const reactorResult = btFromReactor.canExecute(beast, world);
      console.log(`  reactor.canExecute result:`, reactorResult);
      expect(reactorResult.ok).toBe(false);
    }

    // 1c. Test canExecute from ActionRegistry.forSpecies
    const speciesActions = ActionRegistry.forSpecies("beast");
    const btFromRegistry = speciesActions.find((a) => a.id === "breakthrough");
    console.log(`  btFromRegistry has canExecute? ${typeof btFromRegistry?.canExecute}`);
    if (btFromRegistry?.canExecute) {
      const registryResult = btFromRegistry.canExecute(beast, world);
      console.log(`  registry.canExecute result:`, registryResult);
      expect(registryResult.ok).toBe(false);
    }

    // 1d. THE REAL TEST: getAvailableActions
    const actions = world.getAvailableActions(beast.id);
    const btAction = actions.find((a) => a.action === "breakthrough");
    console.log(`  getAvailableActions breakthrough:`, btAction);

    // This is the bug — if possible=true here, we've reproduced it
    expect(btAction).toBeDefined();
    expect(btAction!.possible).toBe(false);
    expect(btAction!.reason).toBeDefined();
    console.log(`  ✅ BUG 1 STATUS: possible=${btAction!.possible} reason="${btAction!.reason}"`);
  });

  it("BUG 2: showProgress should appear in breakthrough description", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");
    const _qi = beast.components.tank?.tanks[beast.components.tank.coreParticle] ?? 0;

    // 2a. Test showProgress directly
    const progress = BREAKTHROUGH.showProgress?.(beast);
    console.log(`  showProgress direct: "${progress}"`);
    expect(progress).toBeDefined();
    expect(progress).not.toBe("");

    // 2b. Test showProgress from reactor actions
    const beastReactor = UNIVERSE.reactors.beast;
    const btFromReactor = beastReactor.actions.find((a) => a.id === "breakthrough");
    const reactorProgress = btFromReactor?.showProgress?.(beast);
    console.log(`  showProgress from reactor: "${reactorProgress}"`);
    expect(reactorProgress).toBeDefined();

    // 2c. Test showProgress from ActionRegistry.forSpecies
    const speciesActions = ActionRegistry.forSpecies("beast");
    const btFromRegistry = speciesActions.find((a) => a.id === "breakthrough");
    const registryProgress = btFromRegistry?.showProgress?.(beast);
    console.log(`  showProgress from registry: "${registryProgress}"`);
    expect(registryProgress).toBeDefined();

    // 2d. THE REAL TEST: description in getAvailableActions
    const actions = world.getAvailableActions(beast.id);
    const btAction = actions.find((a) => a.action === "breakthrough");
    console.log(`  getAvailableActions desc: "${btAction?.description}"`);

    // Description should contain showProgress info, not bare "突破"
    expect(btAction?.description).toContain("还需");
    console.log(`  ✅ BUG 2 STATUS: description="${btAction?.description}"`);
  });

  it("BUG 1+2 combined: buildContextSnapshot isBreakthroughReady should be false at low qi", () => {
    const world = new World();
    const beast = world.createEntity("测试妖兽", "beast");
    beast.sentient = true; // mark as player-controlled

    const snapshot = buildContextSnapshot(world, beast.id);
    console.log(`  hints.isBreakthroughReady: ${snapshot.hints.isBreakthroughReady}`);
    console.log(`  self.qi: ${snapshot.self.qi}/${snapshot.self.maxQi}`);

    const btAction = snapshot.options.actions.find((a) => a.action === "breakthrough");
    console.log(
      `  breakthrough action: possible=${btAction?.possible} desc="${btAction?.description}"`,
    );

    expect(snapshot.hints.isBreakthroughReady).toBe(false);
  });
});
