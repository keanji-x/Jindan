#!/usr/bin/env tsx
/**
 * Action Profiler — 统计每种 action 的触发频率
 *
 * 运行: npx tsx tools/optimize/profile_actions.ts
 */
import { AiRegistry } from "../../src/world/brains/OptimizerRegistry.js";
import { ActionRegistry } from "../../src/world/systems/ActionRegistry.js";
import { UNIVERSE } from "../../src/world/config/universe.config.js";
import { applyParams, DEFAULT_PARAMS } from "../../src/world/config/TunableParams.js";
import { World } from "../../src/world/World.js";

applyParams(DEFAULT_PARAMS);

const ENTITIES = 20;
const TICKS = 200;
const PPE = 200;

UNIVERSE.totalParticles = ENTITIES * PPE;
UNIVERSE.ecology.maxEntities = ENTITIES + 10;

const world = new World();
world.createEntity("评测者", "human");

// Pre-populate
const npcSpecies = Object.entries(UNIVERSE.reactors)
  .filter(([, r]) => r.npcNames && r.npcNames.length > 0)
  .map(([id, r]) => ({ id, names: r.npcNames! }));

for (let i = 0; i < ENTITIES - 1; i++) {
  const sp = npcSpecies[i % npcSpecies.length]!;
  const name = sp.names[i % sp.names.length]! + (i < sp.names.length ? "" : `#${i}`);
  try { world.createEntity(name, sp.id as any); } catch { break; }
}

// Counters
const actionCounts: Record<string, number> = {};
const actionSuccess: Record<string, number> = {};
let totalActions = 0;
let totalTicks = 0;

// Track results from performAction
const origPerform = world.performAction.bind(world);
(world as any).performAction = (entityId: string, action: string, targetId?: string) => {
  const result = origPerform(entityId, action, targetId);
  actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  // biome-ignore lint/suspicious/noExplicitAny: profiler accesses internal result
  if ((result as any)?.status === "success") {
    actionSuccess[action] = (actionSuccess[action] ?? 0) + 1;
  }
  totalActions++;
  return result;
};

console.log(`\n🔬 行动分布分析 (${ENTITIES} entities × ${TICKS} ticks)\n`);

let maxIter = TICKS * 20;
let iters = 0;

while (world.tick < TICKS && iters < maxIter) {
  iters++;
  const npcs = world.getAliveEntities().filter((e) => e.components.brain);

  for (const npc of npcs) {
    if (npc.status !== "alive") continue;
    const brain = AiRegistry.get(npc.components.brain!.id);
    if (!brain) continue;

    const actions = world.getAvailableActions(npc.id);
    if (actions.length === 0) continue;

    const tank = npc.components.tank;
    const core = tank?.coreParticle ?? "ql";
    const qiCurrent = tank ? (tank.tanks[core] ?? 0) : 0;
    const realm = npc.components.cultivation?.realm ?? 1;
    const reactor = UNIVERSE.reactors[npc.species];
    const qiMax = reactor ? Math.floor(reactor.proportionLimit(realm) * UNIVERSE.totalParticles) : 1;
    const qiRatio = qiMax > 0 ? qiCurrent / qiMax : 0;
    const rels = world.relations.getAll(npc.id);
    const avgRelation = rels.length > 0 ? rels.reduce((s, r) => s + r.data.score, 0) / rels.length : 0;
    const brainCtx = {
      qiCurrent, qiMax, qiRatio,
      mood: npc.components.mood?.value ?? 0.5,
      brainDepth: reactor?.brainDepth,
      personality: npc.components.personality,
      avgRelation,
    };

    const plan = brain.decidePlan
      ? brain.decidePlan(actions, brainCtx)
      : (() => { const d = brain.decide(actions, brainCtx); return d ? [d] : []; })();

    for (const decision of plan) {
      const current = world.getEntity(npc.id);
      if (!current || current.status !== "alive") break;
      (world as any).performAction(npc.id, decision.action, decision.targetId);
    }
  }

  world.settle();
  if (world.tick > totalTicks) totalTicks = world.tick;
}

// Get all registered action IDs for reference
const allActions = ActionRegistry.getAll().map((a) => a.id);

// Print results
console.log(`总 tick: ${totalTicks}  总 action 执行: ${totalActions}  生存实体: ${world.getAliveEntities().length}/${ENTITIES}\n`);
console.log(`${"action".padEnd(20)} ${"次数".padStart(6)} ${"占比".padStart(7)} ${"成功率".padStart(7)}  状态`);
console.log("─".repeat(55));

const sorted = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
for (const [action, count] of sorted) {
  const pct = (count / totalActions * 100).toFixed(1);
  const successRate = actionSuccess[action]
    ? ((actionSuccess[action] / count) * 100).toFixed(0) + "%"
    : "n/a";
  const bar = "█".repeat(Math.min(Math.round(count / totalActions * 30), 30));
  console.log(`${action.padEnd(20)} ${String(count).padStart(6)} ${(pct + "%").padStart(7)} ${successRate.padStart(7)}  ${bar}`);
}

// Show actions that never fired
const neverFired = allActions.filter((id) => !actionCounts[id]);
if (neverFired.length > 0) {
  console.log(`\n❌ 从未触发的 action (${neverFired.length}个):`);
  for (const id of neverFired) {
    console.log(`  - ${id}`);
  }
}

const rarely = Object.entries(actionCounts)
  .filter(([, c]) => c / totalActions < 0.01)
  .map(([id]) => id);
if (rarely.length > 0) {
  console.log(`\n⚠️  触发率 < 1% 的 action:`);
  for (const id of rarely) {
    const c = actionCounts[id];
    console.log(`  - ${id}: ${c}次 (${(c / totalActions * 100).toFixed(2)}%)`);
  }
}
