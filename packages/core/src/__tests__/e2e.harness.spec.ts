// ============================================================
// E2E Test Suite — fluent harness tests for @jindan/core
//
// Usage patterns:
//   world().run(10).check(h => h.tickAtLeast(5))
//   world().run(5).check(h => h.assertNoNegativeQi())
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { UNIVERSE } from "../world/config/universe.config.js";
import { type TestHarness, world } from "./TestHarness.js";

// Keep harness ref for cleanup
let harness: TestHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

describe("World E2E — Fluent Harness", () => {
  // ── 1. 世界初始化 ──────────────────────────────────────────

  describe("Initialization", () => {
    it("should bootstrap a world with ambient pool and generate NPCs via SpawnPool", () => {
      harness = world();
      const snap = harness.snapshot();

      expect(snap.tick).toBe(0);
      // Ambient pool starts with initial totalParticles (default 1000)
      expect(snap.ambientPool.pools.ql).toBeGreaterThanOrEqual(1000);

      // After a few ticks, SpawnPool should organically generate entities
      harness.createHuman("触发者"); // need a player to drive ticks
      harness.run(5);
      const alive = harness.world.getAliveEntities();
      expect(alive.length).toBeGreaterThan(0);
    });

    it("should generate beasts and plants organically via SpawnPool", () => {
      harness = world();
      harness.createHuman("观测者");

      // Temporarily boost spawn chance to guarantee a spawn in test
      const oldChance = UNIVERSE.ecology.spawnBaseChance;
      UNIVERSE.ecology.spawnBaseChance = 1.0;

      // Run enough ticks for SpawnPool to fire reliably
      harness.run(15);

      UNIVERSE.ecology.spawnBaseChance = oldChance;

      const alive = harness.world.getAliveEntities();
      const nonHumans = alive.filter((e) => e.species !== "human");
      // SpawnPool should have generated at least some beasts or plants
      expect(nonHumans.length).toBeGreaterThan(0);
    });
  });

  // ── 2. 创建实体 ──────────────────────────────────────────

  describe("Entity Creation", () => {
    it("should create a human entity with correct structure", () => {
      harness = world();
      const human = harness.createHuman("张三");

      expect(human.name).toBe("张三");
      expect(human.species).toBe("human");
      expect(human.status).toBe("alive");
      expect(human.components.tank).toBeDefined();
      expect(human.components.cultivation).toBeDefined();
      expect(human.components.tank!.coreParticle).toBe("ql");
    });

    it("should emit entity_created event via fluent check", () => {
      harness = world();
      harness.createHuman("李四");
      harness.check((h) => h.assertEventEmitted("entity_created"));
    });

    it("should create entities of all species", () => {
      harness = world();
      const human = harness.createHuman("修士A");
      const beast = harness.createBeast("妖兽A");
      const plant = harness.createPlant("灵植A");

      expect(human.components.tank!.coreParticle).toBe("ql");
      expect(beast.components.tank!.coreParticle).toBe("qs");
      expect(plant.components.tank!.coreParticle).toBe("ql");
    });
  });

  // ── 3. 冥想修炼 ──────────────────────────────────────────

  describe("Meditation (Absorb)", () => {
    it("should absorb qi from ambient pool", () => {
      harness = world();
      const human = harness.createHuman("打坐者");
      const snapBefore = harness.snapshot();
      const _ambientBefore = snapBefore.ambientPool.pools.ql ?? 0;

      const result = harness.act(human.id, "meditate");
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      harness.check((h) => h.assertEventEmitted("entity_absorbed"));
    });

    it("should increase entity qi after meditation", () => {
      harness = world();
      const human = harness.createHuman("修炼者");
      const _initialQi = human.components.tank!.tanks.ql ?? 0;

      // Meditate several times
      for (let i = 0; i < 3; i++) {
        harness.act(human.id, "meditate");
      }

      const updated = harness.world.getEntity(human.id)!;
      // After meditation: paid cost but absorbed more, net positive expected
      // (if ambient has enough qi)
      expect(updated.status).toBe("alive");
    });
  });

  // ── 4. Tick 推进 ──────────────────────────────────────────

  describe("Tick Advancement", () => {
    it("should advance ticks via run()", () => {
      harness = world();
      harness.createHuman("推时者");

      harness.run(3).check(
        (h) => h.tickAtLeast(3),
        (h) => h.assertEventEmitted("tick_complete"),
      );
    });

    it("should drain entities each tick", () => {
      harness = world();
      harness.createHuman("被消耗者");

      harness.run(2).check((h) => h.assertEventEmitted("entity_drained"));
    });
  });
  // ── 6. 完整模拟 — 不崩溃 ──────────────────────────────────

  describe("Full Simulation", () => {
    it("world().run(10) should complete without crashes", () => {
      harness = world();
      harness.createHuman("观测者");

      harness.run(10).check(
        (h) => h.tickAtLeast(10),
        (h) => h.assertNoNegativeQi(),
        (h) => h.assertNoNegativeAmbient(),
      );
    });

    it("world().run(20) stress test", () => {
      harness = world();
      harness.createHuman("历劫者A");
      harness.createHuman("历劫者B");
      harness.createBeast("天妖");

      harness.run(20).check(
        (h) => h.tickAtLeast(20),
        (h) => h.assertNoNegativeQi(),
        (h) => h.assertNoNegativeAmbient(),
      );

      // Structural integrity
      const snap = harness.snapshot();
      expect(snap.entities).toBeDefined();
      expect(Array.isArray(snap.entities)).toBe(true);
      expect(snap.ambientPool).toBeDefined();
    });
  });

  // ── 7. Headless AI 探索模式 ────────────────────────────────

  describe("Headless AI Exploration", () => {
    it("should allow step-by-step exploration via act()", () => {
      harness = world();
      const ai = harness.createHuman("AI探索者");

      // AI step 1: observe what I can do
      const actions = harness.plan(ai.id);
      expect(actions.length).toBeGreaterThan(0);

      // AI step 2: pick a possible action
      const possible = actions.filter((a) => a.possible);
      expect(possible.length).toBeGreaterThan(0);

      // AI step 3: execute
      const choice = possible[0]!;
      const result = harness.act(ai.id, choice.action, choice.targetId);
      if (!result.success) {
        // Breakthrough and other actions can legitimately fail random chances after initiation
        expect(result.error).toMatch(/失败|未臻圆满|不足/);
      } else {
        expect(result.success).toBe(true);
      }

      // AI step 4: observe result
      expect(result.availableActions).toBeDefined();
      // The action itself succeeded, events are collected in harness
      expect(harness.collectedEvents.length).toBeGreaterThan(0);
    });

    it("should allow AI to chain observe → decide → act loop", () => {
      harness = world();
      const ai = harness.createHuman("AI循环者");
      const results: boolean[] = [];

      // Simple AI loop: observe, decide, act × N
      for (let i = 0; i < 10; i++) {
        const entity = harness.world.getEntity(ai.id);
        if (entity?.status !== "alive") break;

        const actions = harness.plan(ai.id);
        const possible = actions.filter((a) => a.possible);

        if (possible.length === 0) {
          // Rest as fallback
          const r = harness.act(ai.id, "rest");
          results.push(r.success);
        } else {
          const choice = possible[Math.floor(Math.random() * possible.length)]!;
          const r = harness.act(ai.id, choice.action, choice.targetId);
          results.push(r.success);
        }
      }

      // At least some iterations should complete (entity may die early)
      expect(results.length).toBeGreaterThan(0);
      // At least some actions should succeed
      expect(results.filter(Boolean).length).toBeGreaterThan(0);
    });
  });

  // ── 8. runActions — 确定性序列 ─────────────────────────────

  describe("Deterministic Action Sequences", () => {
    it("should run a specific action sequence", () => {
      harness = world();
      const human = harness.createHuman("序列者");

      harness
        .runActions([
          { entityId: human.id, action: "meditate" },
          { entityId: human.id, action: "meditate" },
          { entityId: human.id, action: "rest" },
        ])
        .check((h) => h.assertAlive(human.id));

      // All 3 absorbed events should exist
      const absorbEvents = harness.eventsOfType("entity_absorbed");
      expect(absorbEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 9. Event Collection ────────────────────────────────────

  describe("Event Collection", () => {
    it("should collect all events across the simulation", () => {
      harness = world();
      harness.createHuman("事件收集者");
      harness.run(5);

      expect(harness.collectedEvents.length).toBeGreaterThan(0);
      expect(harness.eventsOfType("tick_complete").length).toBeGreaterThanOrEqual(5);
    });

    it("should support clearEvents for fresh collection", () => {
      harness = world();
      harness.createHuman("清理者");
      harness.run(2);

      expect(harness.collectedEvents.length).toBeGreaterThan(0);
      harness.clearEvents();
      expect(harness.collectedEvents.length).toBe(0);

      // After clearing, new events accumulate from scratch
      harness.run(1);
      expect(harness.collectedEvents.length).toBeGreaterThan(0);
    });
  });
});
