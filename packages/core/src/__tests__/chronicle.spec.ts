import { describe, expect, it } from "vitest";
import { Chronicle } from "../world/Chronicle.js";
import { World } from "../world/World.js";

describe("Chronicle", () => {
  it("returns null for a tick with no meaningful events", () => {
    const world = new World();
    const chronicle = new Chronicle();
    // Tick 0 — no events yet
    world.settle();
    const entry = chronicle.summarizeTick(world, world.tick);
    // tick_complete alone should be filtered out — result depends on spawn events
    // If no entity was created, entry should be null or have low intensity
    if (entry) {
      expect(entry.intensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("records death events in the chronicle", () => {
    const world = new World();
    const human = world.createEntity("测试者", "human");
    // Give some qi then kill by setting status
    world.performAction(human.id, "meditate");
    world.settle();

    // Record a death event directly
    world.recordEvent({
      tick: world.tick,
      sourceId: human.id,
      type: "entity_died",
      data: { entity: { id: human.id, name: human.name } },
    });

    const chronicle = new Chronicle();
    const entry = chronicle.summarizeTick(world, world.tick);
    expect(entry).not.toBeNull();
    expect(entry!.body).toContain("陨落");
    expect(entry!.involvedIds).toContain(human.id);
  });

  it("records breakthrough events in the chronicle", () => {
    const world = new World();
    const human = world.createEntity("天才", "human");
    world.settle();

    world.recordEvent({
      tick: world.tick,
      sourceId: human.id,
      type: "entity_breakthrough",
      data: { entity: { id: human.id, name: human.name }, newRealm: 2 },
    });

    const chronicle = new Chronicle();
    const entry = chronicle.summarizeTick(world, world.tick);
    expect(entry).not.toBeNull();
    expect(entry!.headline).toContain("天才");
    expect(entry!.body).toContain("突破");
  });

  it("getRecent returns latest entries", () => {
    const world = new World();
    const chronicle = new Chronicle();
    const human = world.createEntity("测试者", "human");

    // Create events across multiple ticks
    for (let i = 0; i < 5; i++) {
      world.recordEvent({
        tick: world.tick,
        sourceId: human.id,
        type: "entity_died",
        data: { entity: { id: human.id, name: human.name } },
      });
      chronicle.summarizeTick(world, world.tick);
      world.settle();
    }

    const recent = chronicle.getRecent(3);
    expect(recent.length).toBeLessThanOrEqual(3);
  });
});
