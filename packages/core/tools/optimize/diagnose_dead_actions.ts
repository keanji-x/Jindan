#!/usr/bin/env tsx
/**
 * Dead Action Diagnostic — 为每个从未触发的 action 分析原因
 *
 * 运行: npx tsx tools/optimize/diagnose_dead_actions.ts
 */
import { UNIVERSE } from "../../src/world/config/universe.config.js";
import { applyParams, DEFAULT_PARAMS } from "../../src/world/config/TunableParams.js";
import { World } from "../../src/world/World.js";

applyParams(DEFAULT_PARAMS);

const ENTITIES = 20;
const PPE = 200;

UNIVERSE.totalParticles = ENTITIES * PPE;
UNIVERSE.ecology.maxEntities = ENTITIES + 10;

const world = new World();
world.createEntity("评测者", "human");

const npcSpecies = Object.entries(UNIVERSE.reactors)
  .filter(([, r]) => r.npcNames && r.npcNames.length > 0)
  .map(([id, r]) => ({ id, names: r.npcNames! }));

for (let i = 0; i < ENTITIES - 1; i++) {
  const sp = npcSpecies[i % npcSpecies.length]!;
  const name = sp.names[i % sp.names.length]! + (i < sp.names.length ? "" : `#${i}`);
  try { world.createEntity(name, sp.id as any); } catch { break; }
}

// Simulate 50 ticks
for (let i = 0; i < 1000 && world.tick < 50; i++) world.settle();

const entities = world.getAliveEntities();
console.log(`\n🔬 死亡 Action 诊断 (${entities.length} 存活实体, tick ${world.tick})\n`);

// ── MATE (relation >= 70) ──────────────────────────────────────
console.log("═══ mate (合欢) — relationRange [70, 100] ═══");
{
  let maxRel = -200;
  let pairsAbove70 = 0;
  for (const a of entities) {
    for (const b of entities) {
      if (a.id >= b.id) continue;
      const rel = world.relations.get(a.id, b.id);
      if (rel > maxRel) maxRel = rel;
      if (rel >= 70) pairsAbove70++;
    }
  }
  const relDist: Record<string, number> = { "[-100,-1]": 0, "[0,9]": 0, "[10,29]": 0, "[30,69]": 0, "[70,100]": 0 };
  for (const a of entities) {
    for (const b of entities) {
      if (a.id >= b.id) continue;
      const rel = world.relations.get(a.id, b.id);
      if (rel < 0) relDist["[-100,-1]"]++;
      else if (rel < 10) relDist["[0,9]"]++;
      else if (rel < 30) relDist["[10,29]"]++;
      else if (rel < 70) relDist["[30,69]"]++;
      else relDist["[70,100]"]++;
    }
  }
  console.log(`  最高关系值: ${maxRel}  (需要 >= 70 才能选择)`);
  console.log(`  关系值分布:`);
  for (const [range, count] of Object.entries(relDist)) {
    const bar = "█".repeat(count);
    console.log(`    ${range.padEnd(12)} ${String(count).padStart(4)} 对  ${bar}`);
  }
  console.log(`  结论: ${maxRel < 70 ? `❌ 最高关系值 ${maxRel}，无法触发 mate — 关系积累太慢` : `⚠️  有 ${pairsAbove70} 对满足条件`}`);
}

// ── ENSLAVE (realm >= 2, relation <= 30) ──────────────────────
console.log("\n═══ enslave (奴役) — realm >= 2, relationRange [-100, 30] ═══");
{
  const realm2plus = entities.filter(e => (e.components.cultivation?.realm ?? 0) >= 2);
  const realmDist: Record<number, number> = {};
  for (const e of entities) {
    const r = e.components.cultivation?.realm ?? 0;
    realmDist[r] = (realmDist[r] ?? 0) + 1;
  }
  console.log(`  realm >= 2 的实体: ${realm2plus.length}/${entities.length}`);
  console.log(`  境界分布:`);
  for (const [r, cnt] of Object.entries(realmDist).sort()) {
    console.log(`    realm ${r}: ${cnt} 个 ${Number(r) >= 2 ? "✓ 可奴役" : "✗ 太低"}`);
  }

  // Check if those with realm >= 2 have valid targets (weaker entities with relation <= 30)
  let validCombos = 0;
  for (const enslaver of realm2plus) {
    for (const target of entities) {
      if (enslaver.id === target.id) continue;
      const targetRealm = target.components.cultivation?.realm ?? 0;
      if (enslaver.components.cultivation!.realm < targetRealm + 2) continue; // needs 2 realm diff
      const rel = world.relations.get(enslaver.id, target.id);
      if (rel <= 30) validCombos++;
    }
  }
  console.log(`  realm 差 >= 2 且 relation <= 30 的有效组合: ${validCombos}`);
  console.log(`  结论: ${realm2plus.length === 0 ? "❌ 无 realm >= 2 实体 — 200 ticks 内无法突破" : validCombos === 0 ? "⚠️  有高境界实体但无合适目标" : `✓ 有 ${validCombos} 个有效组合`}`);
}

// ── ACQUIRE (no canExecute, just needs target) ──────────────────
console.log("\n═══ acquire (获取) — 无特殊条件，需要目标 ═══");
{
  // Check if acquire appears in getAvailableActions for any entity
  let acquireVisible = 0;
  let acquirePossible = 0;
  for (const e of entities.slice(0, 5)) {
    const available = world.getAvailableActions(e.id);
    const acq = available.filter(a => a.action === "acquire");
    if (acq.length > 0) acquireVisible++;
    if (acq.some(a => a.possible)) acquirePossible++;
  }
  console.log(`  (检查前5个实体) acquire 可见: ${acquireVisible}/5  可执行: ${acquirePossible}/5`);
  console.log(`  结论: ${acquirePossible === 0 ? "❌ acquire 无法执行 — 可能没有可获取的artifact/物品目标" : "✓ 应该能触发"}`);
}

// ── FOUND_SECT (realm >= 3, high qi) ──────────────────────────
console.log("\n═══ found_sect (开山立派) — realm >= 3, 高灵气 ═══");
{
  const realm3plus = entities.filter(e => (e.components.cultivation?.realm ?? 0) >= 3);
  console.log(`  realm >= 3 的实体: ${realm3plus.length}/${entities.length}`);

  const sectReactor = UNIVERSE.reactors.sect;
  const birthCost = sectReactor?.birthCost ?? 100;
  console.log(`  宗门建立所需灵气 (birthCost + 30): ${birthCost + 30}`);

  for (const e of realm3plus) {
    const tank = e.components.tank;
    const qi = tank ? (tank.tanks[tank.coreParticle] ?? 0) : 0;
    console.log(`    ${e.name} realm=${e.components.cultivation?.realm} qi=${qi}/${birthCost + 30} ${qi >= birthCost + 30 ? "✓" : "✗ qi不足"}`);
  }

  console.log(`  结论: ${realm3plus.length === 0 ? "❌ 无 realm >= 3 实体 — 需要大约 2-3 次突破 (200+ ticks)" : `有 ${realm3plus.length} 个满足境界要求`}`);
}

// ── OVERALL RELATION DYNAMICS ─────────────────────────────────
console.log("\n═══ 关系增长动态分析 ═══");
{
  const allRels: number[] = [];
  for (const a of entities) {
    for (const b of entities) {
      if (a.id >= b.id) continue;
      allRels.push(world.relations.get(a.id, b.id));
    }
  }
  const nonZero = allRels.filter(r => r !== 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((s, r) => s + r, 0) / nonZero.length : 0;
  const max = Math.max(...allRels, -Infinity);
  console.log(`  总关系对数: ${allRels.length}  非零: ${nonZero.length} (${(nonZero.length / allRels.length * 100).toFixed(1)}%)`);
  console.log(`  平均关系值: ${avg.toFixed(1)}  最高: ${max}`);
  console.log(`  chat 每次 +15，到 mate 需要 70/15 ≈ 5 次 chat 同一对象`);
  console.log(`  问题: NPC 不会 consistently chat 同一人 → 关系永远积累不到 70`);
}
