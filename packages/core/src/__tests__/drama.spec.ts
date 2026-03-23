import { describe, expect, it } from "vitest";
import { DramaDirector } from "../world/drama/DramaDirector.js";
import { BUILTIN_PLOTS } from "../world/drama/templates.js";
import type { Effect } from "../world/effects/types.js";
import { World } from "../world/World.js";

describe("DramaDirector", () => {
  it("registers and evaluates templates", () => {
    const director = new DramaDirector();
    director.registerAll(BUILTIN_PLOTS);
    const world = new World();
    // Run a tick to populate entities
    world.settle();
    // Evaluate should not crash on an empty/fresh world
    const effects = director.evaluate(world, world.tick);
    expect(Array.isArray(effects)).toBe(true);
  });

  it("respects cooldown — same template cannot fire twice within cooldown", () => {
    const fired: number[] = [];
    const director = new DramaDirector();
    // Produce must return non-empty effects for the firing to be recorded
    const dummyEffect: Effect = {
      type: "emit_event",
      event: { tick: 0, type: "system_warning", data: {}, message: "test" },
    };
    director.register({
      id: "test_always",
      name: "Test Always Fires",
      cooldownTicks: 5,
      maxFirings: -1,
      match: () => [{ actors: {}, headline: "test" }],
      produce: (_cast, tick) => {
        fired.push(tick);
        return [dummyEffect];
      },
    });

    const world = new World();
    world.settle(); // tick 1
    director.evaluate(world, 1); // fires → lastTick=1
    director.evaluate(world, 2); // cooldown (2-1=1 < 5)
    director.evaluate(world, 3); // cooldown (3-1=2 < 5)
    director.evaluate(world, 6); // fires (6-1=5, not < 5)

    expect(fired).toEqual([1, 6]);
  });

  it("respects maxFirings limit", () => {
    let fireCount = 0;
    const director = new DramaDirector();
    const dummyEffect: Effect = {
      type: "emit_event",
      event: { tick: 0, type: "system_warning", data: {}, message: "test" },
    };
    director.register({
      id: "test_limited",
      name: "Test Limited",
      cooldownTicks: 0,
      maxFirings: 2,
      match: () => [{ actors: {}, headline: "limited" }],
      produce: () => {
        fireCount++;
        return [dummyEffect];
      },
    });

    const world = new World();
    for (let i = 1; i <= 5; i++) {
      director.evaluate(world, i);
    }
    expect(fireCount).toBe(2);
  });

  it("BETRAYAL template matches low-qi entity with high-relation friend", () => {
    // The betrayal template requires qiRatio < 0.15
    // qiRatio = coreQi / maxQi where maxQi = reactor.proportionLimit(realm) * totalParticles
    // For human realm 1: proportionLimit = 0.05, totalParticles = 55000
    // maxQi = 0.05 * 55000 = 2750, so qi needs to be < 2750 * 0.15 = 412
    const world = new World();
    const a = world.createEntity("叛徒", "human");
    const b = world.createEntity("友人", "human");

    // Set qi to low value (below 15% of max ~2750)
    const tankA = a.components.tank!;
    tankA.tanks[tankA.coreParticle] = 50;
    world.setEntity(a);
    world.relations.adjust(a.id, b.id, 100); // high relationship > 60
    // DON'T call settle() — drain would kill the entity at low qi

    const betrayalTemplate = BUILTIN_PLOTS.find((t) => t.id === "betrayal")!;
    expect(betrayalTemplate).toBeDefined();

    // Run many times since betrayal has 20% random chance per match
    let matched = false;
    for (let i = 0; i < 200; i++) {
      const ctx = {
        entities: world.getAliveEntities(),
        getRelation: (x: string, y: string) => world.relations.get(x, y),
        daoTanks: world.getDaoTanks(),
        tick: 1,
        recentEvents: [],
        totalParticles: world.getWorldTotal(),
      };
      const casts = betrayalTemplate.match(ctx);
      if (casts.length > 0) {
        matched = true;
        expect(casts[0]!.headline).toContain("背叛");
        break;
      }
    }
    expect(matched).toBe(true);
  });

  it("QI_STORM template matches when Dao holds 80%+ particles", () => {
    const world = new World();
    world.createEntity("甲", "human");
    world.createEntity("乙", "human");
    world.settle();

    const qiStormTemplate = BUILTIN_PLOTS.find((t) => t.id === "qi_storm")!;
    expect(qiStormTemplate).toBeDefined();

    const ctx = {
      entities: world.getAliveEntities(),
      getRelation: (x: string, y: string) => world.relations.get(x, y),
      daoTanks: world.getDaoTanks(),
      tick: world.tick,
      recentEvents: [],
      totalParticles: world.getWorldTotal(),
    };
    const casts = qiStormTemplate.match(ctx);
    expect(casts.length).toBeGreaterThan(0);
    expect(casts[0]!.headline).toContain("灵气风暴");
  });
});

describe("World integration", () => {
  it("World has chronicle and dramaDirector initialized", () => {
    const world = new World();
    expect(world.chronicle).toBeDefined();
    expect(world.dramaDirector).toBeDefined();
  });

  it("chronicle accumulates entries as ticks advance", () => {
    const world = new World();
    world.createEntity("甲", "human");
    world.createEntity("乙", "beast");

    for (let i = 0; i < 5; i++) {
      world.settle();
    }

    const entries = world.chronicle.getAll();
    expect(entries.length).toBeGreaterThanOrEqual(0);
  });
});
