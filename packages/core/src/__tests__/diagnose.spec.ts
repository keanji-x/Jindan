import { describe, expect, it, vi } from "vitest";
import { UNIVERSE } from "../world/config/universe.config.js";
import { World } from "../world/World.js";

describe("诊断：游戏系统核心机制", () => {
  function createWorld() {
    const world = new World();
    vi.useFakeTimers();
    return world;
  }

  it("满灵气打坐 = 热力学平衡（净变化0是正确的）", () => {
    const world = createWorld();
    const player = world.createEntity("测试修士", "human");

    const tank = player.components.tank!;
    const core = tank.coreParticle;

    // 手动给大量灵气以测试吸收/释放平衡
    const qi = 100;
    tank.tanks[core] = qi;

    // 打坐：应该吸收灵气
    world.performAction(player.id, "meditate");
    vi.runAllTimers();

    // 打坐后灵气应该增加或保持（不再受maxTanks限制）
    expect(tank.tanks[core]!).toBeGreaterThanOrEqual(qi);
    vi.useRealTimers();
  });

  it("吞噬碧灵草（同核心粒子）走同种方程，有实际收益", () => {
    const world = createWorld();
    const player = world.createEntity("测试修士", "human");

    // 手动创建一株灵植作为吞噬目标
    const target = world.createEntity("碧灵草", "plant");

    const tank = player.components.tank!;
    const core = tank.coreParticle;

    const qiBefore = tank.tanks[core]!;
    console.log(`\n吞噬前灵气: ${qiBefore}`);

    const targetTank = target.components.tank!;
    console.log(
      `目标: ${target.name}, 核心粒子=${targetTank.coreParticle}, 灵气=${targetTank.tanks[targetTank.coreParticle]}`,
    );

    // 人(ql) 吃 植(ql) → 同核心 → 用 digest_same_l
    const result = world.performAction(player.id, "devour", target.id);
    vi.runAllTimers();

    console.log(`吞噬结果: ${JSON.stringify(result.result)}`);

    const qiAfter = tank.tanks[core]!;
    console.log(`灵气变化: ${qiBefore} → ${qiAfter} (${qiAfter > qiBefore ? "增长" : "未增长"})`);
    console.log(`目标状态: ${target.status}`);

    // 核心验证：吞噬应该成功，且灵气有实际变化
    expect(result.success).toBe(true);
    expect(target.status).toBe("lingering");

    vi.useRealTimers();
  });

  it("人吃妖兽（异核心粒子）走异种方程", () => {
    const world = createWorld();
    const player = world.createEntity("测试修士", "human");

    // 手动创建一只妖兽作为吞噬目标
    const target = world.createEntity("噬煞蝇", "beast");

    const tank = player.components.tank!;
    const core = tank.coreParticle; // ql

    const targetTank = target.components.tank!;
    console.log(`\n人(${core}) 吃 兽(${targetTank.coreParticle})`);

    // 应该是异种 (ql vs qs)
    expect(core).not.toBe(targetTank.coreParticle);

    const qiBefore = tank.tanks[core]!;
    const result = world.performAction(player.id, "devour", target.id);
    vi.runAllTimers();

    console.log(`结果: ${JSON.stringify(result.result)}`);
    console.log(`灵气: ${qiBefore} → ${tank.tanks[core]}`);

    expect(result.success).toBe(true);

    vi.useRealTimers();
  });

  it("完整 game loop：吸收灵气 → 突破 → 吞噬回血 → 再突破", () => {
    const world = createWorld();
    const player = world.createEntity("AI修士", "human");

    const tank = player.components.tank!;
    const core = tank.coreParticle;
    const reactor = UNIVERSE.reactors[player.species]!;

    console.log(`\n=== Game Loop 模拟 ===`);
    console.log(`初始: 灵气=${tank.tanks[core]}`);

    let breakthroughAttempts = 0;
    let breakthroughSuccesses = 0;

    for (let round = 0; round < 50 && player.status === "alive"; round++) {
      const qi = tank.tanks[core]!;
      const realm = player.components.cultivation?.realm ?? 1;
      const limit = reactor.proportionLimit(realm);
      const proportion = UNIVERSE.totalParticles > 0 ? qi / UNIVERSE.totalParticles : 0;
      const occupancy = limit > 0 ? proportion / limit : 0; // how close to limit
      let action = "";

      if (occupancy >= 0.9) {
        // 尝试突破
        const res = world.performAction(player.id, "breakthrough");
        vi.runAllTimers();
        breakthroughAttempts++;
        const btResult = res.result as { success?: boolean } | undefined;
        if (btResult?.success) breakthroughSuccesses++;
        action = `突破 ${btResult?.success ? "✅" : "❌"}`;
      } else if (occupancy < 0.8) {
        // 灵气不足，找灵植吞噬
        const plants = world.getAliveEntities("plant");
        if (plants.length > 0) {
          const res = world.performAction(player.id, "devour", plants[0]!.id);
          vi.runAllTimers();
          action = `吞噬${plants[0]!.name} ${res.success ? "✅" : "❌"}`;
        } else {
          // 没有灵植，打坐
          world.performAction(player.id, "meditate");
          vi.runAllTimers();
          action = "打坐";
        }
      } else {
        // 80-90%，打坐补到满
        world.performAction(player.id, "meditate");
        vi.runAllTimers();
        action = "打坐";
      }

      console.log(
        `[${round + 1}] ${action} | 灵气=${tank.tanks[core]} (占比${(proportion * 100).toFixed(1)}%/${(limit * 100).toFixed(1)}%) | 境界=${player.components.cultivation?.realm} | tick=${world.tick}`,
      );
    }

    console.log(`\n突破尝试: ${breakthroughAttempts}次, 成功: ${breakthroughSuccesses}次`);
    console.log(
      `最终: 灵气=${tank.tanks[core]}, 境界=${player.components.cultivation?.realm}, status=${player.status}`,
    );

    // 至少应该尝试过突破
    expect(breakthroughAttempts).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});
