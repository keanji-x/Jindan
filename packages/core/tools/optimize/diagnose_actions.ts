import { World } from "../../src/world/World.js";
import { UNIVERSE } from "../../src/world/config/universe.config.js";
import { AiRegistry } from "../../src/world/brains/OptimizerRegistry.js";

// Use real config (10K particles, 50 maxEntities) — no overrides
const world = new World();
world.createEntity("评测者", "human");

const npcSpecies = Object.entries(UNIVERSE.reactors)
  .filter(([, r]) => r.npcNames && r.npcNames.length > 0)
  .map(([id, r]) => ({ id, names: r.npcNames! }));

const TARGET_ENTITIES = UNIVERSE.ecology.maxEntities - 1;
for (let i = 0; i < TARGET_ENTITIES; i++) {
  const sp = npcSpecies[i % npcSpecies.length]!;
  const name = sp.names[i % sp.names.length]! + (i < sp.names.length ? "" : `#${i}`);
  try { world.createEntity(name, sp.id as any); } catch { break; }
}

const actionCounts = new Map<string, number>();
const actionBlockReasons = new Map<string, Map<string, number>>();
const actionsPerTick: number[] = [];

const TICKS = 300; // Long-run test

for (let tick = 0; tick < TICKS; tick++) {
  const tickActions = new Set<string>();
  const npcs = world.getAliveEntities().filter((e) => e.components.brain);
  
  for (const npc of npcs) {
    if (npc.status !== "alive") continue;
    const actions = world.getAvailableActions(npc.id);
    
    for (const a of actions) {
      if (!a.possible) {
        if (!actionBlockReasons.has(a.action)) actionBlockReasons.set(a.action, new Map());
        const reasons = actionBlockReasons.get(a.action)!;
        const r = a.reason ?? "unknown";
        reasons.set(r, (reasons.get(r) ?? 0) + 1);
      }
    }

    const brain = AiRegistry.get(npc.components.brain!.id);
    if (!brain) continue;

    const tank = npc.components.tank;
    const core = tank?.coreParticle ?? "ql";
    const qiCurrent = tank ? (tank.tanks[core] ?? 0) : 0;
    const realm = npc.components.cultivation?.realm ?? 1;
    const reactor = UNIVERSE.reactors[npc.species];
    const qiMax = reactor ? Math.floor(reactor.proportionLimit(realm) * UNIVERSE.totalParticles) : 1;
    const qiRatio = qiMax > 0 ? qiCurrent / qiMax : 0;
    const brainCtx = { qiCurrent, qiMax, qiRatio, mood: npc.components.mood?.value ?? 0.5, brainDepth: reactor?.brainDepth };

    // Get multi-action plan (or fallback to single decide)
    const plan = brain.decidePlan
      ? brain.decidePlan(actions, brainCtx)
      : (() => { const d = brain.decide(actions, brainCtx); return d ? [d] : []; })();

    for (const decision of plan) {
      // Re-check entity is alive between actions
      const current = world.getEntity(npc.id);
      if (!current || current.status !== "alive") break;

      actionCounts.set(decision.action, (actionCounts.get(decision.action) ?? 0) + 1);
      tickActions.add(decision.action);
      world.performAction(npc.id, decision.action, decision.targetId);
    }
  }
  
  world.settle();
  actionsPerTick.push(tickActions.size);
}

console.log(`\n=== Action Distribution (${TICKS} ticks × ~100 entities, ppe=1000) ===`);
const sorted = [...actionCounts.entries()].sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((s, [, c]) => s + c, 0);
for (const [action, count] of sorted) {
  console.log(`  ${action.padEnd(20)} ${count.toString().padStart(5)} (${((count / total) * 100).toFixed(1)}%)`);
}
console.log(`  TOTAL              ${total.toString().padStart(5)}`);
console.log(`  Unique types: ${sorted.length}`);

const avgPerTick = actionsPerTick.reduce((a, b) => a + b, 0) / actionsPerTick.length;
console.log(`  Avg unique/tick: ${avgPerTick.toFixed(1)}`);

console.log("\n=== Blocked Actions ===");
for (const [action, reasons] of [...actionBlockReasons.entries()].sort()) {
  console.log(`  ${action}:`);
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    console.log(`    ${reason.substring(0, 50).padEnd(50)} ×${count}`);
  }
}

const aliveNow = world.getAliveEntities();
const avgMood = aliveNow.reduce((s, e) => s + (e.components.mood?.value ?? 0.5), 0) / aliveNow.length;
const maxRealm = Math.max(...aliveNow.map(e => e.components.cultivation?.realm ?? 1));
console.log(`\n=== World State (tick ${world.tick}) ===`);
console.log(`  Alive: ${aliveNow.length}/${TARGET_ENTITIES + 1}`);
console.log(`  Avg mood: ${avgMood.toFixed(3)}`);
console.log(`  Max realm: ${maxRealm}`);
console.log(`  Species: ${[...new Set(aliveNow.map(e => e.species))].join(", ")}`);
