import { describe, expect, it, vi } from "vitest";
import { World } from "../world/World.js";

describe("Tomb System (坟墓系统)", () => {
  function createTestWorld() {
    const world = new World();
    vi.useFakeTimers();
    const hunter = world.createEntity("猎手", "human");
    const prey = world.createEntity("猎物", "human");
    return { world, hunter, prey };
  }

  /**
   * Force-kill an entity by directly depleting its core particle,
   * simulating what happens during combat death.
   * This avoids relying on RNG from devour combat.
   */
  function forceKill(world: World, entityId: string) {
    const entity = world.getEntity(entityId)!;
    const tank = entity.components.tank!;

    // Dump all particles back to ambient (simulate chain collapse)
    const ambient = world.ledger.qiPool.state;
    for (const [pid, amount] of Object.entries(tank.tanks)) {
      if (amount > 0) {
        ambient.pools[pid] = (ambient.pools[pid] ?? 0) + amount;
        tank.tanks[pid] = 0;
      }
    }
    entity.status = "lingering";

    world.events.emit({
      tick: world.tick,
      type: "entity_died",
      data: { id: entity.id, name: entity.name, species: entity.species, cause: "测试击杀" },
      message: `💀「${entity.name}」被测试击杀`,
    });
    vi.runAllTimers();
  }

  it("死亡后实体进入 lingering 状态", () => {
    const { world, prey } = createTestWorld();
    forceKill(world, prey.id);

    const entity = world.getEntity(prey.id)!;
    expect(entity.status).toBe("lingering");

    vi.useRealTimers();
  });

  it("getLifeStatus 正确返回生死状态", () => {
    const { world, hunter, prey } = createTestWorld();

    // 存活状态
    const aliveStatus = world.getLifeStatus(hunter.id);
    expect(aliveStatus?.status).toBe("alive");

    // 杀死猎物
    forceKill(world, prey.id);

    // 游魂状态
    const deadStatus = world.getLifeStatus(prey.id);
    expect(deadStatus?.status).toBe("lingering");

    // 不存在的实体
    expect(world.getLifeStatus("nonexistent")).toBeUndefined();

    vi.useRealTimers();
  });

  it("life.events 在存活期间累积事件 ID", () => {
    const { world, hunter } = createTestWorld();

    // Perform an action to generate events
    world.performAction(hunter.id, "rest");
    vi.runAllTimers();

    const status = world.getLifeStatus(hunter.id);
    expect(status!.life.events.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("游魂执行 performTomb → 生成墓志铭 → 进入 entombed 状态", () => {
    const { world, prey } = createTestWorld();

    // Perform some actions first so prey has history
    world.performAction(prey.id, "rest");
    vi.runAllTimers();

    forceKill(world, prey.id);

    // 游魂执行盖棺定论
    const tombResult = world.performTomb(prey.id);
    expect(tombResult.success).toBe(true);
    expect(tombResult.epitaph).toBeDefined();
    expect(tombResult.epitaph!.length).toBeGreaterThan(0);
    expect(tombResult.snapshot).toBeDefined();

    // 验证状态变为 entombed
    const entity = world.getEntity(prey.id)!;
    expect(entity.status).toBe("entombed");
    expect(entity.life.article).toBe(tombResult.epitaph);
    expect(entity.life.events).toEqual([]); // events cleared

    vi.useRealTimers();
  });

  it("只有 lingering 状态才能执行 performTomb", () => {
    const { world, hunter, prey } = createTestWorld();

    // 还活着的不能 tomb
    const aliveResult = world.performTomb(hunter.id);
    expect(aliveResult.success).toBe(false);

    // 先杀后 tomb 两次，第二次应失败
    forceKill(world, prey.id);
    world.performTomb(prey.id);
    const secondTomb = world.performTomb(prey.id);
    expect(secondTomb.success).toBe(false);

    vi.useRealTimers();
  });

  it("安息后可以转生，继承前世 article", () => {
    const { world, prey } = createTestWorld();
    forceKill(world, prey.id);

    const tombResult = world.performTomb(prey.id);
    expect(tombResult.success).toBe(true);

    // 转生
    const reinResult = world.reincarnate(prey.id, "重生者", "human");
    expect(reinResult.success).toBe(true);
    expect(reinResult.entity).toBeDefined();
    expect(reinResult.entity!.name).toBe("重生者");
    expect(reinResult.entity!.species).toBe("human");
    expect(reinResult.entity!.status).toBe("alive");
    expect(reinResult.entity!.life.article).toBe(tombResult.epitaph);
    expect(reinResult.entity!.life.events).toEqual([]);

    vi.useRealTimers();
  });

  it("只有 entombed 状态才能转生", () => {
    const { world, hunter, prey } = createTestWorld();

    // 活着的不能转生
    const aliveResult = world.reincarnate(hunter.id, "X", "human");
    expect(aliveResult.success).toBe(false);

    // 游魂不能转生
    forceKill(world, prey.id);
    const lingeringResult = world.reincarnate(prey.id, "X", "human");
    expect(lingeringResult.success).toBe(false);

    vi.useRealTimers();
  });

  it("完整流程：存活 → 死亡 → 盖棺 → 转生 → 再次存活", () => {
    const { world, prey } = createTestWorld();

    // 1. 存活期间做些事
    world.performAction(prey.id, "rest");
    vi.runAllTimers();

    // 2. 被杀死 → lingering
    forceKill(world, prey.id);
    expect(world.getEntity(prey.id)!.status).toBe("lingering");

    // 3. 盖棺定论 → entombed
    const tomb = world.performTomb(prey.id);
    expect(tomb.success).toBe(true);
    expect(world.getEntity(prey.id)!.status).toBe("entombed");

    // 4. 转生 → 新实体 alive，继承 article
    const rein = world.reincarnate(prey.id, "涅槃者", "plant");
    expect(rein.success).toBe(true);
    const newEntity = rein.entity!;
    expect(newEntity.status).toBe("alive");
    expect(newEntity.life.article.length).toBeGreaterThan(0);

    // 5. 新实体可以正常行动
    const actionResult = world.performAction(newEntity.id, "rest");
    vi.runAllTimers();
    expect(actionResult.success).toBe(true);

    vi.useRealTimers();
  });
});
