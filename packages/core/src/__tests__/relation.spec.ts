import { describe, expect, it } from "vitest";
import { makeRelationKey } from "../world/types.js";
import { World } from "../world/World.js";

describe("RelationGraph (关系图)", () => {
  function createTestWorld() {
    const world = new World();
    const a = world.createEntity("甲", "human");
    const b = world.createEntity("乙", "human");
    return { world, a, b };
  }

  // ── Unit: makeRelationKey ──────────────────────────────

  it("makeRelationKey 保证对称性", () => {
    expect(makeRelationKey("aaa", "bbb")).toBe("aaa:bbb");
    expect(makeRelationKey("bbb", "aaa")).toBe("aaa:bbb");
  });

  // ── Unit: RelationGraph ────────────────────────────────

  it("默认关系为 0", () => {
    const { world, a, b } = createTestWorld();
    expect(world.relations.get(a.id, b.id)).toBe(0);
  });

  it("adjust 增量修改并 clamp", () => {
    const { world, a, b } = createTestWorld();

    world.relations.adjust(a.id, b.id, 30);
    expect(world.relations.get(a.id, b.id)).toBe(30);
    expect(world.relations.get(b.id, a.id)).toBe(30); // 对称

    world.relations.adjust(a.id, b.id, -50);
    expect(world.relations.get(a.id, b.id)).toBe(-20);

    // clamp to +100
    world.relations.adjust(a.id, b.id, 200);
    expect(world.relations.get(a.id, b.id)).toBe(100);

    // clamp to -100
    world.relations.adjust(a.id, b.id, -300);
    expect(world.relations.get(a.id, b.id)).toBe(-100);
  });

  it("set 直接设置", () => {
    const { world, a, b } = createTestWorld();

    world.relations.set(a.id, b.id, 75);
    expect(world.relations.get(a.id, b.id)).toBe(75);

    world.relations.set(a.id, b.id, -200); // clamp
    expect(world.relations.get(a.id, b.id)).toBe(-100);
  });

  it("getAll 查询某实体所有关系", () => {
    const { world, a, b } = createTestWorld();
    const c = world.createEntity("丙", "human");

    world.relations.set(a.id, b.id, 50);
    world.relations.set(a.id, c.id, -30);

    const rels = world.relations.getAll(a.id);
    expect(rels).toHaveLength(2);
    expect(rels.find((r) => r.otherId === b.id)?.score).toBe(50);
    expect(rels.find((r) => r.otherId === c.id)?.score).toBe(-30);
  });

  it("removeEntity 清除全部关系", () => {
    const { world, a, b } = createTestWorld();

    world.relations.set(a.id, b.id, 50);
    world.relations.removeEntity(a.id);
    expect(world.relations.get(a.id, b.id)).toBe(0);
  });

  it("toJSON 序列化", () => {
    const { world, a, b } = createTestWorld();

    world.relations.set(a.id, b.id, 42);
    const json = world.relations.toJSON();
    const key = makeRelationKey(a.id, b.id);
    expect(json[key]).toBe(42);
  });

  // ── Integration: relationRange 目标过滤 ─────────────────

  it("关系值超出 relationRange 的目标不出现在 availableActions 中", () => {
    const { world, a, b } = createTestWorld();

    // 默认关系 = 0, devour 的 relationRange = [-100, 50] → 应该可以吞噬
    const actions1 = world.getAvailableActions(a.id);
    const devourTargets1 = actions1.filter(
      (act) => act.action === "devour" && act.targetId === b.id && act.possible,
    );
    expect(devourTargets1.length).toBe(1);

    // 设关系 = 80 → 超出 [-100, 50]，不应该出现
    world.relations.set(a.id, b.id, 80);
    const actions2 = world.getAvailableActions(a.id);
    const devourTargets2 = actions2.filter(
      (act) => act.action === "devour" && act.targetId === b.id && act.possible,
    );
    expect(devourTargets2.length).toBe(0);

    // 设关系 = 50 → 边界值，应该可以
    world.relations.set(a.id, b.id, 50);
    const actions3 = world.getAvailableActions(a.id);
    const devourTargets3 = actions3.filter(
      (act) => act.action === "devour" && act.targetId === b.id && act.possible,
    );
    expect(devourTargets3.length).toBe(1);
  });

  it("chat 的 relationRange [-80, 100] 过滤极端仇恨目标", () => {
    const { world, a, b } = createTestWorld();

    // 默认关系 = 0 → 可以传音
    const actions1 = world.getAvailableActions(a.id);
    const chatTargets1 = actions1.filter(
      (act) => act.action === "chat" && act.targetId === b.id && act.possible,
    );
    expect(chatTargets1.length).toBe(1);

    // 设关系 = -90 → 超出 [-80, 100]，不应该出现
    world.relations.set(a.id, b.id, -90);
    const actions2 = world.getAvailableActions(a.id);
    const chatTargets2 = actions2.filter(
      (act) => act.action === "chat" && act.targetId === b.id && act.possible,
    );
    expect(chatTargets2.length).toBe(0);
  });

  // ── Integration: handler 中的 adjustRelation ────────────

  it("吞噬后关系值下降", () => {
    const { world, a, b } = createTestWorld();

    // 先设一个初始关系
    world.relations.set(a.id, b.id, 20);

    // 执行吞噬
    world.performAction(a.id, "devour", b.id);

    // 关系应该下降 30 → 20 - 30 = -10
    expect(world.relations.get(a.id, b.id)).toBe(-10);
  });

  it("聊天后关系值上升", () => {
    const { world, a, b } = createTestWorld();

    world.relations.set(a.id, b.id, 0);

    world.performAction(a.id, "chat", b.id, { message: "道友好" });

    expect(world.relations.get(a.id, b.id)).toBe(5);
  });
});
