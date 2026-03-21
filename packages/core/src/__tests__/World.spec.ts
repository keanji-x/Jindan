import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeingLedger } from "../world/beings/BeingLedger.js";
import { UNIVERSE } from "../world/config/universe.config.js";
import { ActionRegistry } from "../world/systems/ActionRegistry.js";
import { World } from "../world/World.js";

describe("World", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Entity lifecycle & limits", () => {
    it("should throw error when entity limit is reached (mocked canAcquire)", () => {
      const spy = vi.spyOn(BeingLedger, "canAcquire").mockReturnValue(false);
      expect(() => world.createEntity("Test", "human")).toThrow(/无法创建/);
      spy.mockRestore();
    });

    it("should create entity and assign initial particles", () => {
      const entity = world.createEntity("Test", "human");
      expect(entity).toBeDefined();
      expect(entity.status).toBe("alive");
      expect(world.getEntity(entity.id)).toBe(entity);
      expect(world.getAliveEntities()).toHaveLength(1);
    });

    it("should mark entity as lingering when core particle reaches 0", () => {
      const entity = world.createEntity("Test", "human");
      if (entity.components.tank) {
        entity.components.tank.tanks[entity.components.tank.coreParticle] = 0;
      }
      world.settle();
      expect(entity.status).toBe("lingering");
      expect(world.getAliveEntities()).toHaveLength(0);
    });
  });

  describe("performAction validations", () => {
    it("should fail if entity is dead", () => {
      const entity = world.createEntity("DeadOne", "human");
      entity.status = "lingering";
      world.setEntity(entity);
      const res = world.performAction(entity.id, "rest");
      expect(res.success).toBe(false);
      if ("error" in res) {
        expect(res.error).toMatch(/生灵不存在或已消亡/);
      }
    });

    it("should fail if entity is already executing a graph", () => {
      const entity = world.createEntity("BusyOne", "human");
      entity.components.actionGraph = {
        graphId: "mock",
        currentNodeId: "root",
        currentRepeatCount: 0,
        ticksHeld: 0,
      };

      const res = world.performAction(entity.id, "rest");
      expect(res.success).toBe(false);
      if ("error" in res) {
        expect(res.error).toMatch(/正在执行其他功法/);
      }
    });

    it("should fail if action is unknown", () => {
      const entity = world.createEntity("One", "human");
      const res = world.performAction(entity.id, "unknown_action" as any);
      expect(res.success).toBe(false);
      if ("error" in res) {
        expect(res.error).toMatch(/未知/);
      }
    });

    it("should fail if target is required but missing or dead", () => {
      const entity = world.createEntity("Attacker", "human");
      const target = world.createEntity("Victim", "human");

      const spyRegistry = vi.spyOn(ActionRegistry, "get").mockReturnValue({
        id: "attack",
        name: "Attack",
        description: "",
        qiCost: 0,
        needsTarget: true,
      });
      const spyHandler = vi
        .spyOn(ActionRegistry, "getHandler")
        .mockReturnValue(() => ({ success: true, newQi: 0 }));

      const originalActions = UNIVERSE.reactors["human"].actions;
      UNIVERSE.reactors["human"].actions = [
        ...originalActions,
        { id: "attack", name: "Attack", description: "", qiCost: 0, needsTarget: true },
      ];

      const resNoTarget = world.performAction(entity.id, "attack" as any);
      expect(resNoTarget.success).toBe(false);
      if ("error" in resNoTarget) {
        expect(resNoTarget.error).toMatch(/缺少目标/);
      }

      target.status = "lingering";
      const resDeadTarget = world.performAction(entity.id, "attack" as any, target.id);
      expect(resDeadTarget.success).toBe(false);
      if ("error" in resDeadTarget) {
        expect(resDeadTarget.error).toMatch(/目标已消亡/);
      }

      UNIVERSE.reactors["human"].actions = originalActions;
      spyRegistry.mockRestore();
      spyHandler.mockRestore();
    });
  });

  describe("Tomb & Reincarnate", () => {
    it("should allow a lingering entity to be entombed", () => {
      const entity = world.createEntity("Ghost", "human");
      entity.life.events = ["e1"];
      entity.status = "lingering";

      const res = world.performTomb(entity.id, "A great person.");
      expect(res.success).toBe(true);
      expect(entity.status).toBe("entombed");
      expect(entity.life.article).toBe("A great person.");
      expect(entity.life.events).toEqual([]); // events are flushed
    });

    it("should fail to entomb if not lingering", () => {
      const entity = world.createEntity("Alive", "human");
      const res = world.performTomb(entity.id);
      expect(res.success).toBe(false);
    });

    it("should allow entombed entity to reincarnate", () => {
      const entity = world.createEntity("OldHero", "human");
      entity.status = "entombed";
      entity.life.article = "Heroic deeds";

      const res = world.reincarnate(entity.id, "NewBorn", "beast");
      expect(res.success).toBe(true);
      expect(entity.name).toBe("NewBorn");
      expect(entity.species).toBe("beast");
      expect(entity.status).toBe("alive");
      expect(entity.life.article).toBe("Heroic deeds"); // memories retained
    });

    it("should fail to reincarnate if not entombed", () => {
      const entity = world.createEntity("Alive", "human");
      const res = world.reincarnate(entity.id, "New", "human");
      expect(res.success).toBe(false);
    });
  });
});
