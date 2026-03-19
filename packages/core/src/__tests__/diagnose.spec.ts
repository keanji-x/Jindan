// ============================================================
// Diagnostic Test — observe world state to understand collapse
//
// Run with: npx vitest run src/__tests__/diagnose.spec.ts
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { type TestHarness, world } from "./TestHarness.js";

let harness: TestHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

describe("World Diagnostics", () => {
  // ── 1. NPC-Only world baseline (BEFORE tuning) ────────────

  it("observe: NPC-only world for 20 ticks (simulate via AI brains)", () => {
    harness = world();
    harness.simulate(20).dumpTimeline();

    const report = harness.tickReport();
    console.log("\n── Final State ──");
    console.log(
      `  Alive: ${report.alive.total} (H:${report.alive.human} B:${report.alive.beast} P:${report.alive.plant})`,
    );
    console.log(
      `  Ambient: ql=${Math.floor(report.ambient.ql ?? 0)} qs=${Math.floor(report.ambient.qs ?? 0)}`,
    );

    // Don't assert — this is purely observational
    expect(true).toBe(true);
  });

  // ── 2. Ecosystem health check ─────────────────────────────

  it("check: species diversity survives 20 ticks", () => {
    harness = world();
    harness.simulate(20);

    const counts = harness.countBySpecies();
    const dist = harness.eventDistribution();
    const eventTypes = Object.keys(dist);

    console.log("\n── Diversity Check ──");
    console.log(`  Species alive: beast=${counts.beast} plant=${counts.plant}`);
    console.log(`  Event types seen: ${eventTypes.length} (${eventTypes.join(", ")})`);

    // Diversity goals (these may fail with current params — that's the diagnostic!)
    // We want to see:
    //   - At least 2 species still alive
    //   - At least 4 different event types
    //   - Not all entities dead
    const speciesAlive = (counts.beast > 0 ? 1 : 0) + (counts.plant > 0 ? 1 : 0);
    console.log(`  Species diversity: ${speciesAlive}/2`);
    console.log(`  Event diversity: ${eventTypes.length}`);
    console.log(`  Total alive: ${counts.total}`);

    // Soft assertions (log but don't fail)
    if (speciesAlive < 2) console.warn("  ⚠️ COLLAPSE: fewer than 2 species survived!");
    if (eventTypes.length < 4) console.warn("  ⚠️ COLLAPSE: fewer than 4 event types seen!");
    if (counts.total < 3) console.warn("  ⚠️ COLLAPSE: fewer than 3 entities alive!");

    expect(true).toBe(true);
  });

  // ── 3. Drain-vs-absorb balance analysis ───────────────────

  it("observe: drain vs absorb rates per tick", () => {
    harness = world();
    harness.simulate(10);

    const drains = harness.eventsOfType("entity_drained");
    const absorbs = harness.eventsOfType("entity_absorbed");
    const deaths = harness.eventsOfType("entity_died");

    let totalDrained = 0;
    let totalAbsorbed = 0;
    for (const d of drains) totalDrained += (d.data.drained as number) ?? 0;
    for (const a of absorbs) totalAbsorbed += (a.data.absorbed as number) ?? 0;

    console.log("\n── Drain vs Absorb ──");
    console.log(`  Total drained: ${totalDrained} across ${drains.length} events`);
    console.log(`  Total absorbed: ${totalAbsorbed} across ${absorbs.length} events`);
    console.log(`  Net qi flow: ${totalAbsorbed - totalDrained} (positive = entities gaining)`);
    console.log(`  Deaths: ${deaths.length}`);

    if (totalDrained > totalAbsorbed * 2) {
      console.warn("  ⚠️ Drain is 2x+ absorb — entities can't survive!");
    }

    expect(true).toBe(true);
  });

  // ── 4. Devour frequency analysis ──────────────────────────

  it("observe: devour frequency and impact", () => {
    harness = world();
    harness.simulate(15);

    const devours = harness.eventsOfType("entity_devoured");
    const deaths = harness.eventsOfType("entity_died");

    console.log("\n── Devour Analysis ──");
    console.log(`  Total devours: ${devours.length} over ${harness.tickCount} ticks`);
    console.log(`  Total deaths: ${deaths.length}`);
    if (devours.length > 0) {
      console.log(
        `  Devour rate: ${(devours.length / Math.max(harness.tickCount, 1)).toFixed(2)} per tick`,
      );
    }

    // Show who devoured whom
    for (const d of devours.slice(0, 5)) {
      const w = d.data.winner as { name: string; species: string };
      const l = d.data.loser as { name: string; species: string };
      console.log(
        `    ${w.name}[${w.species}] ate ${l.name}[${l.species}], gained ${d.data.qiGained}`,
      );
    }

    expect(true).toBe(true);
  });

  // ── 5. With player entity — observe difference ────────────

  it("observe: world with 1 player for 20 ticks", () => {
    harness = world();
    const player = harness.createHuman("观测者");
    harness.simulate(20).dumpTimeline();

    const _report = harness.tickReport();
    console.log(`\n  Player ${player.name} alive: ${harness.world.getEntity(player.id)?.alive}`);

    expect(true).toBe(true);
  });
});
