// ============================================================
// TestHarness — Fluent E2E test harness for @jindan/core
//
// Two modes:
//   1. Fluent assertions:  world().run(10).check(h => h.tickAtLeast(5))
//   2. Headless AI explore: const h = world(); h.run(); h.act(...)
// ============================================================

import { AiRegistry } from "../world/brains/OptimizerRegistry.js";
import { UNIVERSE } from "../world/config/universe.config.js";
import type {
  ActionId,
  ActionResult,
  AvailableAction,
  Entity,
  WorldEvent,
} from "../world/types.js";
import { World } from "../world/World.js";

// ── Types ────────────────────────────────────────────────────

export interface WorldSnapshot {
  tick: number;
  daoTanks: Record<string, number>;
  entities: Entity[];
}

export type CheckFn = (harness: TestHarness) => void;

/** Structured per-tick diagnostic report */
export interface TickReport {
  tick: number;
  alive: { total: number; human: number; beast: number; plant: number };
  ambient: Record<string, number>;
  eventCounts: Record<string, number>;
  /** Top entities by core qi */
  topEntities: Array<{
    id: string;
    name: string;
    species: string;
    qi: number;
    maxQi: number;
    realm: number;
  }>;
}

// ── TestHarness ──────────────────────────────────────────────

export class TestHarness {
  readonly world: World;
  readonly collectedEvents: WorldEvent[] = [];
  /** Timeline of tick reports, recorded during simulate() */
  readonly timeline: TickReport[] = [];
  private _unsubEvents: (() => void) | null = null;

  constructor() {
    this.world = new World();
    this._unsubEvents = this.world.events.onAny((e) => {
      this.collectedEvents.push(e);
    });
  }

  // ── Factory shortcuts ──────────────────────────────────────

  /** Create a human entity and return it */
  createHuman(name: string): Entity {
    return this.world.createEntity(name, "human");
  }

  /** Create a beast entity */
  createBeast(name: string): Entity {
    return this.world.createEntity(name, "beast");
  }

  /** Create a plant entity */
  createPlant(name: string): Entity {
    return this.world.createEntity(name, "plant");
  }

  // ── Action shortcuts ───────────────────────────────────────

  /** Perform an action (thin wrapper for world.performAction) */
  act(entityId: string, action: ActionId, targetId?: string): ActionResult {
    return this.world.performAction(entityId, action, targetId);
  }

  /** Get available actions for an entity */
  plan(entityId: string): AvailableAction[] {
    return this.world.getAvailableActions(entityId);
  }

  // ── Run — drive the world forward ──────────────────────────

  /**
   * Run the world for `ticks` ticks by having random entities
   * perform random valid actions, then settling each tick.
   *
   * Returns `this` for chaining: `world().run(10).check(...)`
   */
  run(ticks: number, _maxIterations = 50_000): this {
    for (let t = 0; t < ticks; t++) {
      const alive = this.world.getAliveEntities();

      // Each alive entity does one random valid action
      for (const actor of alive) {
        if (actor.status !== "alive") continue;
        const actions = this.world.getAvailableActions(actor.id);
        const valid = actions.filter((a) => a.possible);

        if (valid.length > 0) {
          const choice = valid[Math.floor(Math.random() * valid.length)]!;
          this.world.performAction(actor.id, choice.action, choice.targetId);
        } else {
          this.world.performAction(actor.id, "rest");
        }
      }

      // Settle: advance one tick
      this.world.settle();
    }

    return this;
  }

  /**
   * Simulate world using NPC AI brains.
   * Each tick: every alive NPC with a brain decides & acts, then settle.
   * Records a TickReport each time tick advances.
   */
  simulate(ticks: number, _maxIterations = 100_000): this {
    // Record initial state
    this.timeline.push(this.tickReport());

    for (let t = 0; t < ticks; t++) {
      const npcs = this.world.getAliveEntities().filter((e) => e.components.brain);
      if (npcs.length === 0) {
        // No NPCs — settle anyway (SpawnPool may generate life)
        this.world.settle();
        this.timeline.push(this.tickReport());
        continue;
      }

      for (const npc of npcs) {
        if (npc.status !== "alive") continue;
        const brain = AiRegistry.get(npc.components.brain!.id);
        if (!brain) continue;

        const actions = this.world.getAvailableActions(npc.id);
        if (actions.length === 0) continue;

        const tank = npc.components.tank;
        const core = tank?.coreParticle ?? "ql";
        const qiCurrent = tank ? (tank.tanks[core] ?? 0) : 0;
        const reactor = this.world.getEntity(npc.id) ? UNIVERSE.reactors[npc.species] : undefined;
        const realm = npc.components.cultivation?.realm ?? 1;
        const speciesLimit = reactor?.proportionLimit(realm) ?? 0.05;
        const qiMax = Math.floor(speciesLimit * UNIVERSE.totalParticles);
        const qiRatio = qiMax > 0 ? qiCurrent / qiMax : 0;
        const decision = brain.decide(actions, {
          qiCurrent,
          qiMax,
          qiRatio,
          mood: npc.components.mood?.value ?? 0.5,
        });
        if (decision) {
          this.world.performAction(npc.id, decision.action, decision.targetId);
        }
      }

      this.world.settle();
      this.timeline.push(this.tickReport());
    }

    return this;
  }

  /**
   * Run a specific sequence of actions, settling after each.
   * Useful for deterministic test scenarios.
   */
  runActions(actions: Array<{ entityId: string; action: ActionId; targetId?: string }>): this {
    for (const a of actions) {
      this.world.performAction(a.entityId, a.action, a.targetId);
    }
    // Settle once after all actions
    this.world.settle();
    return this;
  }

  // ── Check — fluent assertions ──────────────────────────────

  /**
   * Run assertion functions against this harness.
   * Returns `this` for further chaining.
   *
   * Usage: `h.run(10).check(h => h.tickAtLeast(5), h => h.aliveCountAtLeast(1))`
   */
  check(...fns: CheckFn[]): this {
    for (const fn of fns) {
      fn(this);
    }
    return this;
  }

  // ── Built-in assertion helpers ─────────────────────────────
  // These throw on failure (designed for use inside check())

  /** Assert tick is at least N */
  tickAtLeast(n: number): this {
    if (this.world.tick < n) {
      throw new Error(`Expected tick >= ${n}, got ${this.world.tick}`);
    }
    return this;
  }

  /** Assert tick equals exactly N */
  tickEquals(n: number): this {
    if (this.world.tick !== n) {
      throw new Error(`Expected tick === ${n}, got ${this.world.tick}`);
    }
    return this;
  }

  /** Assert there are at least N alive entities */
  aliveCountAtLeast(n: number): this {
    const count = this.world.getAliveEntities().length;
    if (count < n) {
      throw new Error(`Expected alive entities >= ${n}, got ${count}`);
    }
    return this;
  }

  /** Assert a specific entity is alive */
  assertAlive(entityId: string): Entity {
    const e = this.world.getEntity(entityId);
    if (!e || e.status !== "alive") {
      throw new Error(`Expected entity ${entityId} to be alive`);
    }
    return e;
  }

  /** Assert a specific entity is dead */
  assertDead(entityId: string): this {
    const e = this.world.getEntity(entityId);
    if (e?.status === "alive") {
      throw new Error(`Expected entity ${entityId} to be dead, but it's alive`);
    }
    return this;
  }

  /** Assert entity realm is at least N */
  assertRealmAtLeast(entityId: string, realm: number): this {
    const e = this.assertAlive(entityId);
    const r = e.components.cultivation?.realm ?? 0;
    if (r < realm) {
      throw new Error(`Expected entity ${entityId} realm >= ${realm}, got ${r}`);
    }
    return this;
  }

  /** Assert entity has at least N core qi */
  assertQiAtLeast(entityId: string, amount: number): this {
    const e = this.assertAlive(entityId);
    const tank = e.components.tank;
    if (!tank) throw new Error(`Entity ${entityId} has no tank component`);
    const qi = tank.tanks[tank.coreParticle] ?? 0;
    if (qi < amount) {
      throw new Error(`Expected entity ${entityId} qi >= ${amount}, got ${qi}`);
    }
    return this;
  }

  /** Assert that specific event types were emitted */
  assertEventEmitted(type: WorldEvent["type"]): this {
    if (!this.collectedEvents.some((e) => e.type === type)) {
      throw new Error(`Expected event of type "${type}" to be emitted`);
    }
    return this;
  }

  /** Assert that no entity has negative qi */
  assertNoNegativeQi(): this {
    for (const e of this.world.getAliveEntities()) {
      const tank = e.components.tank;
      if (!tank) continue;
      for (const [particleId, amount] of Object.entries(tank.tanks)) {
        if (amount < 0) {
          throw new Error(`Entity ${e.id} (${e.name}) has negative ${particleId}: ${amount}`);
        }
      }
    }
    return this;
  }

  /** Assert Dao tanks have no negative values */
  assertNoNegativeAmbient(): this {
    const snap = this.world.getSnapshot();
    for (const [particleId, amount] of Object.entries(snap.daoTanks)) {
      if (amount < 0) {
        throw new Error(`Dao tank ${particleId} is negative: ${amount}`);
      }
    }
    return this;
  }

  // ── Diagnostic / Observation helpers ───────────────────────

  /** Build a structured report of the current world state */
  tickReport(): TickReport {
    const alive = this.world.getAliveEntities();
    const snap = this.world.getSnapshot();

    // Count by species
    const speciesCounts = { human: 0, beast: 0, plant: 0 };
    for (const e of alive) {
      if (e.species in speciesCounts) {
        speciesCounts[e.species as keyof typeof speciesCounts]++;
      }
    }

    // Event distribution since last tick
    const currentTick = this.world.tick;
    const tickEvents = this.collectedEvents.filter((e) => e.tick === currentTick);
    const eventCounts: Record<string, number> = {};
    for (const e of tickEvents) {
      eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
    }

    // Top entities by core qi
    const topEntities = alive
      .map((e) => {
        const tank = e.components.tank;
        const core = tank?.coreParticle ?? "ql";
        return {
          id: e.id,
          name: e.name,
          species: e.species,
          qi: tank?.tanks[core] ?? 0,
          maxQi: 0, // Proportion-based: no static cap
          realm: e.components.cultivation?.realm ?? 0,
        };
      })
      .sort((a, b) => b.qi - a.qi)
      .slice(0, 10);

    return {
      tick: currentTick,
      alive: { total: alive.length, ...speciesCounts },
      ambient: { ...snap.daoTanks },
      eventCounts,
      topEntities,
    };
  }

  /** Count alive entities by species */
  countBySpecies(): { human: number; beast: number; plant: number; total: number } {
    const alive = this.world.getAliveEntities();
    const counts = { human: 0, beast: 0, plant: 0, total: alive.length };
    for (const e of alive) {
      if (e.species in counts) {
        counts[e.species as keyof typeof counts]++;
      }
    }
    return counts;
  }

  /** Get distribution of event types from collected events */
  eventDistribution(): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const e of this.collectedEvents) {
      dist[e.type] = (dist[e.type] ?? 0) + 1;
    }
    return dist;
  }

  /** Print a compact timeline summary to console */
  dumpTimeline(): this {
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║           WORLD TIMELINE REPORT                  ║");
    console.log("╚══════════════════════════════════════════════════╝\n");

    for (const report of this.timeline) {
      const { tick, alive, ambient, topEntities } = report;
      const ql = Math.floor(ambient.ql ?? 0);
      const qs = Math.floor(ambient.qs ?? 0);

      console.log(
        `  Tick ${String(tick).padStart(3)} │ ` +
          `alive: ${alive.total} (H:${alive.human} B:${alive.beast} P:${alive.plant}) │ ` +
          `ambient: ql=${ql} qs=${qs}`,
      );

      if (topEntities.length > 0 && tick % 5 === 0) {
        for (const e of topEntities.slice(0, 3)) {
          console.log(
            `           │   ${e.name} [${e.species}] realm=${e.realm} qi=${Math.floor(e.qi)}/${e.maxQi}`,
          );
        }
      }
    }

    // Summary
    console.log("\n── Event Distribution ──");
    const dist = this.eventDistribution();
    for (const [type, count] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type.padEnd(22)} ${count}`);
    }

    console.log(`\n  Final tick: ${this.world.tick}`);
    console.log(`  Total events: ${this.collectedEvents.length}\n`);
    return this;
  }

  // ── Query helpers ──────────────────────────────────────────

  /** Get current world snapshot */
  snapshot(): WorldSnapshot {
    return this.world.getSnapshot();
  }

  /** Filter collected events by type */
  eventsOfType(type: WorldEvent["type"]): WorldEvent[] {
    return this.collectedEvents.filter((e) => e.type === type);
  }

  /** Get total number of ticks that completed */
  get tickCount(): number {
    return this.world.tick;
  }

  /** Clear collected events */
  clearEvents(): this {
    this.collectedEvents.length = 0;
    return this;
  }

  /** Cleanup */
  dispose(): void {
    if (this._unsubEvents) {
      this._unsubEvents();
      this._unsubEvents = null;
    }
  }
}

// ── Factory function ─────────────────────────────────────────

/** Create a fresh TestHarness (the `world()` entry point) */
export function world(): TestHarness {
  return new TestHarness();
}
