import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../EventBus.js";
import { UNIVERSE } from "../world/config/universe.config.js";
import { executeDrain } from "../world/systems/handlers/drain.js";
import { DAO_ENTITY_ID } from "../world/World.js";

describe("DrainSystem", () => {
  let events: EventBus;

  beforeEach(() => {
    events = new EventBus();
    vi.spyOn(events, "emit");
    UNIVERSE.reactors["human"] = {
      id: "human",
      baseDrainRate: 10,
      name: "Human",
      coreParticle: "ql",
      ownPolarity: { ql: 1.0, qs: 0.0 },
      proportionLimit: (_realm: number) => 0.05,
      birthCost: 50,
      absorbSource: "dao" as const,
      actions: ["meditate"],
    } as any;
    UNIVERSE.drainBase = 1.0;
    UNIVERSE.drainScale = 1.0;
    UNIVERSE.totalParticles = 10000;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Create a Dao entity for drain tests */
  const makeDaoEntity = (ql = 5000, qs = 500) => ({
    id: DAO_ENTITY_ID,
    name: "天道",
    species: "dao",
    status: "alive" as const,
    components: { tank: { tanks: { ql, qs }, coreParticle: "ql" } },
  });

  const runDrain = (entities: any[], ambientPool: any) => {
    executeDrain(entities, ambientPool, 1, events);
  };

  it("should skip non-alive entities", () => {
    const dao = makeDaoEntity();
    const entity = { status: "lingering", components: { tank: {} } };
    runDrain([dao, entity], { pools: { ql: 0, qs: 0 }, total: 10000 });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("should drain core particle to Dao with linear dissipation", () => {
    const dao = makeDaoEntity(100, 0);
    const entity = {
      id: "e1",
      name: "Tester",
      species: "human",
      status: "alive",
      components: { tank: { tanks: { ql: 5000, qs: 0 }, coreParticle: "ql" } },
    };

    runDrain([dao, entity], { pools: dao.components.tank.tanks, total: 10000 });

    // Linear dissipation: floor(baseDrain(10) × realmScale(1)) = 10
    expect(entity.components.tank.tanks.ql).toBe(4990);
    // Dissipated qi goes to Dao's tanks
    expect(dao.components.tank.tanks.ql).toBe(110); // was 100, + 10
    expect(events.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "entity_drained" }));
  });

  it("should collapse entity and dump remaining particles to Dao if core reaches 0", () => {
    const dao = makeDaoEntity(0, 0);
    const entity = {
      id: "e1",
      name: "Tester",
      species: "human",
      status: "alive",
      components: { tank: { tanks: { ql: 5, qs: 3 }, coreParticle: "ql" } },
    };

    runDrain([dao, entity], { pools: dao.components.tank.tanks, total: 10000 });

    // dissipation = floor(10 * 1) = 10, but capped at coreQi = 5
    // After dissipation: ql = 0 → collapse!
    expect(entity.status).toBe("lingering");
    expect(entity.components.tank.tanks.ql).toBe(0);
    expect(entity.components.tank.tanks.qs).toBe(0); // dumped to Dao
    // Dao should have received: 5 (dissipated ql) + 3 (collapsed qs)
    expect(dao.components.tank.tanks.ql).toBe(5);
    expect(dao.components.tank.tanks.qs).toBe(3);
    expect(events.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "entity_died" }));
  });

  it("should skip Dao entity itself (Dao doesn't drain to itself)", () => {
    const dao = makeDaoEntity(5000, 500);
    const daoQlBefore = dao.components.tank.tanks.ql;

    runDrain([dao], { pools: dao.components.tank.tanks, total: 10000 });

    // Dao should NOT be drained
    expect(dao.components.tank.tanks.ql).toBe(daoQlBefore);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
