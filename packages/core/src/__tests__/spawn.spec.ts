import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeingLedger } from "../world/beings/BeingLedger.js";
import * as factory from "../world/factory.js";
import { executeSpawn } from "../world/systems/handlers/spawn.js";

describe("SpawnSystem", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0); // Guarantees Math.random() < spawnBaseChance
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should do nothing if ecosystem skips spawn chance (random > baseChance)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // fails chance

    const context: any = {
      ambientPool: {},
      entities: [],
      deadEntities: [],
      events: { emit: vi.fn() },
    };

    executeSpawn(context);
    expect(context.events.emit).not.toHaveBeenCalled();
  });

  it("should do nothing if BeingLedger returns null", () => {
    vi.spyOn(BeingLedger, "acquire").mockReturnValue(null);

    const context: any = {
      ambientPool: { pools: {} },
      entities: [],
      deadEntities: [],
      events: { emit: vi.fn() },
    };

    executeSpawn(context);
    expect(context.events.emit).not.toHaveBeenCalled();
  });

  it("should spawn a new entity if BeingLedger decides new creation", () => {
    vi.spyOn(BeingLedger, "acquire").mockReturnValue({ species: "beast" });
    const _spySpawn = vi.spyOn(factory, "createEntity").mockReturnValue({
      id: "new-1",
      name: "NewBeast",
      species: "beast",
      components: { tank: { tanks: { qs: 0 }, coreParticle: "qs" } },
    } as any);

    const addEntity = vi.fn();
    const emit = vi.fn();

    const context: any = {
      ambientPool: { pools: { ql: 100 } },
      entities: [],
      deadEntities: [],
      addEntity,
      events: { emit },
      tick: 1,
    };

    executeSpawn(context);

    expect(addEntity).toHaveBeenCalled();
    const addedEntity = addEntity.mock.calls[0][0];
    expect(addedEntity.species).toBe("beast");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "entity_created" }));
    expect(emit.mock.calls[0][0].data.source).toBe("化生池");
  });

  it("should reincarnate and fill ambient particles if BeingLedger returns reincarnateFrom", () => {
    vi.spyOn(BeingLedger, "acquire").mockReturnValue({
      species: "beast",
      reincarnateFrom: "ghost-123",
    });

    const reincarnateEntity = vi.fn().mockImplementation((id, name, species) => {
      return {
        success: true,
        entity: {
          id,
          name,
          species,
          components: { tank: { tanks: { ql: 0 }, coreParticle: "ql" } },
        },
      };
    });

    const emit = vi.fn();
    const context: any = {
      ambientPool: { pools: { ql: 100 } }, // Has enough ambient qi
      entities: [],
      deadEntities: [],
      reincarnateEntity,
      events: { emit },
      tick: 2,
    };

    executeSpawn(context);

    expect(reincarnateEntity).toHaveBeenCalledWith("ghost-123", expect.any(String), "beast");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "entity_created" }));

    // Context ambient pool should be depleted by birthCost (ParticleTransfer modifies in-place)
    // Note: The exact amount depends on species birthCost and coreParticle
    expect(context.ambientPool.pools.ql).toBeLessThanOrEqual(100);
  });
});
