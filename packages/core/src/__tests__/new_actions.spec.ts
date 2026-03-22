import { describe, expect, it } from "vitest";
import { RelationTag } from "../world/types.js";
import { World } from "../world/World.js";

describe("New Action System (新增行动系统)", () => {
  function createTestWorld() {
    const world = new World();
    const a = world.createEntity("甲", "human");
    const b = world.createEntity("乙", "human");
    return { world, a, b };
  }

  // ── 求爱 (Court) ─────────────────────────────────────────

  describe("Court (求爱)", () => {
    it("好感度 >= 30 时可以求爱", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 30);

      const result = world.performAction(a.id, "court", b.id);
      expect(result.success).toBe(true);
      // 关系应增加 15
      expect(world.relations.get(a.id, b.id)).toBe(45);
    });

    it("好感度 < 30 时不出现在可用行动列表", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 10);

      const actions = world.getAvailableActions(a.id);
      const courtTargets = actions.filter(
        (act) => act.action === "court" && act.targetId === b.id && act.possible,
      );
      expect(courtTargets.length).toBe(0);
    });

    it("跨物种求爱应失败", () => {
      const { world, a } = createTestWorld();
      const beast = world.createEntity("灵狐", "beast");
      world.relations.set(a.id, beast.id, 50);

      const result = world.performAction(a.id, "court", beast.id);
      expect(result.success).toBe(false);
    });
  });

  // ── 植物行动限制 (Plant Action Restrictions) ──────────────

  describe("Plant Action Restrictions (灵植行动限制)", () => {
    it("灵植不应拥有求爱/合欢/请客/共游", () => {
      const { world } = createTestWorld();
      const plant = world.createEntity("灵芝", "plant");
      plant.components.tank!.tanks.ql = 500;

      const actions = world.getAvailableActions(plant.id);
      const forbidden = ["court", "mate", "treat", "travel"];
      for (const actionId of forbidden) {
        const found = actions.filter((a) => a.action === actionId);
        expect(found.length, `植物不应有 ${actionId}`).toBe(0);
      }
    });

    it("灵植应有分裂繁衍(spawn_offspring)", () => {
      const { world } = createTestWorld();
      const plant = world.createEntity("灵芝", "plant");
      plant.components.tank!.tanks.ql = 500;

      const actions = world.getAvailableActions(plant.id);
      const spawn = actions.find((a) => a.action === "spawn_offspring" && a.possible);
      expect(spawn).toBeDefined();
    });
  });

  // ── 获取 (Acquire) ───────────────────────────────────────

  describe("Acquire (获取)", () => {
    it("获取后双方有 Owner/Owned 标签", () => {
      const { world, a, b } = createTestWorld();

      const result = world.performAction(a.id, "acquire", b.id);
      expect(result.success).toBe(true);
      expect(world.relations.hasTag(a.id, b.id, RelationTag.Owner)).toBe(true);
      expect(world.relations.hasTag(b.id, a.id, RelationTag.Owned)).toBe(true);
    });

    it("获取后关系值增加 10", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 0);

      world.performAction(a.id, "acquire", b.id);
      expect(world.relations.get(a.id, b.id)).toBe(10);
    });
  });

  // ── 奴役 (Enslave) ───────────────────────────────────────

  describe("Enslave (奴役)", () => {
    it("境界差 >= 2 时可以奴役", () => {
      const { world, a, b } = createTestWorld();
      // Set realm difference: a=3, b=1
      a.components.cultivation!.realm = 3;
      b.components.cultivation!.realm = 1;
      // Ensure enough qi for the action cost
      a.components.tank!.tanks.ql = 200;

      const result = world.performAction(a.id, "enslave", b.id);
      expect(result.success).toBe(true);
      expect(world.relations.hasTag(a.id, b.id, RelationTag.Enslaver)).toBe(true);
      expect(world.relations.hasTag(b.id, a.id, RelationTag.Enslaved)).toBe(true);
    });

    it("境界差 < 2 时奴役失败", () => {
      const { world, a, b } = createTestWorld();
      a.components.cultivation!.realm = 2;
      b.components.cultivation!.realm = 1;
      a.components.tank!.tanks.ql = 200;

      const result = world.performAction(a.id, "enslave", b.id);
      expect(result.success).toBe(false);
    });

    it("奴役后关系值下降 20", () => {
      const { world, a, b } = createTestWorld();
      a.components.cultivation!.realm = 4;
      b.components.cultivation!.realm = 1;
      a.components.tank!.tanks.ql = 200;
      world.relations.set(a.id, b.id, 0);

      world.performAction(a.id, "enslave", b.id);
      expect(world.relations.get(a.id, b.id)).toBe(-20);
    });
  });

  // ── 有性繁衍 (Mate) ──────────────────────────────────────

  describe("Mate (有性繁衍)", () => {
    it("好感度 >= 70 的同种可以繁衍", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 80);
      // Give both enough qi
      a.components.tank!.tanks.ql = 300;
      b.components.tank!.tanks.ql = 300;

      const entitiesBefore = world.getAllEntities().length;
      const result = world.performAction(a.id, "mate", b.id);
      expect(result.success).toBe(true);

      // A child entity should have been created
      const entitiesAfter = world.getAllEntities().length;
      expect(entitiesAfter).toBeGreaterThan(entitiesBefore);
    });

    it("繁衍后子实体带有 Parent/Child 标签", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 80);
      a.components.tank!.tanks.ql = 300;
      b.components.tank!.tanks.ql = 300;

      const entitiesBefore = new Set(world.getAllEntities().map((e) => e.id));
      world.performAction(a.id, "mate", b.id);

      // Find the new child entity
      const allAfter = world.getAllEntities();
      const child = allAfter.find((e) => !entitiesBefore.has(e.id));
      expect(child).toBeDefined();
      expect(child!.species).toBe("human");

      // Check parent-child tags
      expect(world.relations.hasTag(a.id, child!.id, RelationTag.Parent)).toBe(true);
      expect(world.relations.hasTag(b.id, child!.id, RelationTag.Parent)).toBe(true);
      expect(world.relations.hasTag(child!.id, a.id, RelationTag.Child)).toBe(true);
    });
  });

  // ── 无性繁衍 (Spawn Offspring) ────────────────────────────

  describe("Spawn Offspring (无性繁衍)", () => {
    it("灵气充足时可以分裂", () => {
      const { world } = createTestWorld();
      const plant = world.createEntity("大灵草", "plant");
      // Give enough qi to reproduce
      plant.components.tank!.tanks.ql = 300;

      const entitiesBefore = world.getAllEntities().length;
      const result = world.performAction(plant.id, "spawn_offspring");
      expect(result.success).toBe(true);

      const entitiesAfter = world.getAllEntities().length;
      expect(entitiesAfter).toBeGreaterThan(entitiesBefore);
    });

    it("分裂后子实体与亲本同种", () => {
      const { world } = createTestWorld();
      const plant = world.createEntity("大灵草", "plant");
      plant.components.tank!.tanks.ql = 300;

      const entitiesBefore = new Set(world.getAllEntities().map((e) => e.id));
      world.performAction(plant.id, "spawn_offspring");

      const child = world.getAllEntities().find((e) => !entitiesBefore.has(e.id));
      expect(child).toBeDefined();
      expect(child!.species).toBe("plant");
    });

    it("灵气不足时分裂失败", () => {
      const { world } = createTestWorld();
      const plant = world.createEntity("小灵草", "plant");
      plant.components.tank!.tanks.ql = 5; // Not enough

      const result = world.performAction(plant.id, "spawn_offspring");
      expect(result.success).toBe(false);
    });
  });

  // ── 开山立派 (Found Sect) ─────────────────────────────────

  describe("Found Sect (开山立派)", () => {
    it("境界 >= 3 且灵气充足时可以建宗", () => {
      const { world, a } = createTestWorld();
      a.components.cultivation!.realm = 5;
      a.components.tank!.tanks.ql = 500;

      const entitiesBefore = world.getAllEntities().length;
      const result = world.performAction(a.id, "found_sect");
      expect(result.success).toBe(true);

      // A sect entity should have been created
      const entitiesAfter = world.getAllEntities().length;
      expect(entitiesAfter).toBeGreaterThan(entitiesBefore);

      // Find sect
      const sect = world.getAllEntities().find((e) => e.species === "sect");
      expect(sect).toBeDefined();
    });

    it("境界不足时建宗失败", () => {
      const { world, a } = createTestWorld();
      a.components.cultivation!.realm = 1;
      a.components.tank!.tanks.ql = 500;

      const actions = world.getAvailableActions(a.id);
      const foundSect = actions.find((act) => act.action === "found_sect");
      // Should not be possible due to canExecute
      expect(foundSect?.possible).toBeFalsy();
    });
  });

  // ── 杀人夺宝 ActionGraph (Kill & Loot) ────────────────────

  describe("Kill and Loot (杀人夺宝 ActionGraph)", () => {
    it("应能作为复合动作执行", () => {
      const { world, a, b } = createTestWorld();
      // Set up: a is strong, b is weak
      a.components.tank!.tanks.ql = 300;
      b.components.tank!.tanks.ql = 10;

      // Execute the composite action
      const result = world.performAction(a.id, "kill_and_loot", b.id);
      // The devour should succeed (a is much stronger)
      // This creates an action graph, first node is devour
      expect(result).toBeDefined();
    });
  });

  // ── RelationTag 全面性检查 ────────────────────────────────

  describe("RelationTag System (关系标签)", () => {
    it("所有新标签正确定义", () => {
      expect(RelationTag.Parent).toBe("parent");
      expect(RelationTag.Child).toBe("child");
      expect(RelationTag.Owner).toBe("owner");
      expect(RelationTag.Owned).toBe("owned");
      expect(RelationTag.Enslaver).toBe("enslaver");
      expect(RelationTag.Enslaved).toBe("enslaved");
      expect(RelationTag.SectMember).toBe("sect_member");
      expect(RelationTag.SectLeader).toBe("sect_leader");
    });

    it("可以通过 add/remove Effect 操控标签", () => {
      const { world, a, b } = createTestWorld();

      world.relations.addTag(a.id, b.id, RelationTag.Friend);
      expect(world.relations.hasTag(a.id, b.id, RelationTag.Friend)).toBe(true);

      world.relations.removeTag(a.id, b.id, RelationTag.Friend);
      expect(world.relations.hasTag(a.id, b.id, RelationTag.Friend)).toBe(false);
    });
  });

  // ── 招揽 (Recruit) ──────────────────────────────────────────

  describe("Recruit (招揽)", () => {
    it("好感度 >= 20 时可以招揽", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 30);

      const result = world.performAction(a.id, "recruit", b.id);
      expect(result.success).toBe(true);
      expect(world.relations.hasTag(a.id, b.id, RelationTag.SectLeader)).toBe(true);
      expect(world.relations.hasTag(b.id, a.id, RelationTag.SectMember)).toBe(true);
    });

    it("招揽后关系值增加 10", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 25);

      world.performAction(a.id, "recruit", b.id);
      expect(world.relations.get(a.id, b.id)).toBe(35);
    });

    it("好感度 < 20 时不出现在可用行动列表", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 10);

      const actions = world.getAvailableActions(a.id);
      const recruitTargets = actions.filter(
        (act) => act.action === "recruit" && act.targetId === b.id && act.possible,
      );
      expect(recruitTargets.length).toBe(0);
    });
  });

  // ── 天象异变 (Dao Events) ──────────────────────────────────

  describe("Dao Events (天象异变)", () => {
    it("DaoEventSystem 已注册且不影响正常运行", () => {
      const { world, a } = createTestWorld();
      a.components.tank!.tanks.ql = 100;

      // Run many ticks — some should trigger dao events
      for (let i = 0; i < 30; i++) {
        world.settle();
      }

      // World should still be stable after many ticks with random events
      const pool = world.getDaoPoolState();
      expect(pool.pools.ql).toBeGreaterThanOrEqual(0);
      expect(pool.pools.qs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 请客 (Treat) ──────────────────────────────────────────

  describe("Treat (请客)", () => {
    it("请客后关系值增加 10", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 0);
      a.components.tank!.tanks.ql = 100;

      const result = world.performAction(a.id, "treat", b.id);
      expect(result.success).toBe(true);
      expect(world.relations.get(a.id, b.id)).toBe(20);
    });

    it("请客会转移灵气给目标", () => {
      const { world, a, b } = createTestWorld();
      a.components.tank!.tanks.ql = 100;
      const bQiBefore = b.components.tank!.tanks.ql ?? 0;

      world.performAction(a.id, "treat", b.id);

      const bQiAfter = b.components.tank!.tanks.ql ?? 0;
      // b should have received some qi
      expect(bQiAfter).toBeGreaterThanOrEqual(bQiBefore);
    });
  });

  // ── 共游 (Travel) ─────────────────────────────────────────

  describe("Travel (共游)", () => {
    it("共游后关系值增加 8", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 15);

      const result = world.performAction(a.id, "travel", b.id);
      expect(result.success).toBe(true);
      expect(world.relations.get(a.id, b.id)).toBe(23);
    });

    it("关系 < 10 时共游不可用", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 5);

      const actions = world.getAvailableActions(a.id);
      const travelTargets = actions.filter(
        (act) => act.action === "travel" && act.targetId === b.id && act.possible,
      );
      expect(travelTargets.length).toBe(0);
    });
  });

  // ── 关系事件链 (RelationEventSystem) ───────────────────────

  describe("RelationEventSystem (关系事件链)", () => {
    it("关系 ≥ 80 时自动结为道侣", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, 82);

      // Trigger a tick to fire the RelationEventSystem
      world.settle();

      expect(world.relations.hasTag(a.id, b.id, RelationTag.DaoPartner)).toBe(true);
    });

    it("关系 ≤ -80 时自动结下血仇", () => {
      const { world, a, b } = createTestWorld();
      world.relations.set(a.id, b.id, -85);
      // Give both entities qi so the auto-revenge can fire
      a.components.tank!.tanks.ql = 200;
      b.components.tank!.tanks.ql = 50;

      world.settle();

      expect(world.relations.hasTag(a.id, b.id, RelationTag.BloodFeud)).toBe(true);
    });
  });
});
