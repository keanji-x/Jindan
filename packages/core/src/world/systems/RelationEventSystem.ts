// ============================================================
// RelationEventSystem — 关系驱动自动事件链
//
// 纯被动 System: 每 tick 扫描关系状态，越过阈值时自动触发
// 戏剧性事件。所有事件均通过声明式 Effect 执行，守恒安全。
//
// 阈值触发:
//   ≥ 80  → fall_in_love (结为道侣)
//   ≥ 90  → sworn_sibling (结为金兰)
//   ≤ -80 → blood_feud (结下血仇，可能触发复仇链)
//   ≤ -60 → hatred (积怨成恨)
// ============================================================

import { RelationTag } from "../types.js";
import type { GameSystem, WorldTickContext } from "./GameSystem.js";

/** Prevent firing the same event repeatedly for the same pair */
const firedCache = new Set<string>();

function cacheKey(a: string, b: string, event: string): string {
  const sorted = a < b ? `${a}:${b}` : `${b}:${a}`;
  return `${sorted}:${event}`;
}

function hasFired(a: string, b: string, event: string): boolean {
  return firedCache.has(cacheKey(a, b, event));
}

function markFired(a: string, b: string, event: string): void {
  firedCache.add(cacheKey(a, b, event));
}

/** Reset cache between worlds (for testing) */
export function resetRelationEventCache(): void {
  firedCache.clear();
}

export const RelationEventSystem: GameSystem = {
  id: "relation_events",
  name: "关系事件链",
  actions: [], // 纯被动系统

  onTick: (context: WorldTickContext) => {
    const { entities, events, tick } = context;
    const relations = context.world.relations;

    // Only scan non-dao alive entities
    const aliveEntities = entities.filter((e) => e.status === "alive" && e.species !== "dao");

    for (let i = 0; i < aliveEntities.length; i++) {
      for (let j = i + 1; j < aliveEntities.length; j++) {
        const a = aliveEntities[i]!;
        const b = aliveEntities[j]!;
        const score = relations.get(a.id, b.id);

        // ── 结为道侣 (≥ 80, 同种) ─────────────────────────
        if (
          score >= 80 &&
          a.species === b.species &&
          !hasFired(a.id, b.id, "fall_in_love") &&
          !relations.hasTag(a.id, b.id, RelationTag.DaoPartner)
        ) {
          markFired(a.id, b.id, "fall_in_love");
          relations.addTag(a.id, b.id, RelationTag.DaoPartner);
          relations.addTag(b.id, a.id, RelationTag.DaoPartner);
          events.emit({
            tick,
            type: "entity_courted",
            data: {
              event: "fall_in_love",
              a: { id: a.id, name: a.name },
              b: { id: b.id, name: b.name },
            },
            message: `💕「${a.name}」与「${b.name}」情投意合，结为道侣`,
          });
        }

        // ── 结为金兰 (≥ 90) ────────────────────────────────
        if (
          score >= 90 &&
          !hasFired(a.id, b.id, "sworn_sibling") &&
          !relations.hasTag(a.id, b.id, RelationTag.SwornSibling)
        ) {
          markFired(a.id, b.id, "sworn_sibling");
          relations.addTag(a.id, b.id, RelationTag.SwornSibling);
          relations.addTag(b.id, a.id, RelationTag.SwornSibling);
          events.emit({
            tick,
            type: "entity_courted",
            data: {
              event: "sworn_sibling",
              a: { id: a.id, name: a.name },
              b: { id: b.id, name: b.name },
            },
            message: `🤝「${a.name}」与「${b.name}」义气相投，结为金兰之交`,
          });
        }

        // ── 积怨成恨 (≤ -60) ───────────────────────────────
        if (
          score <= -60 &&
          !hasFired(a.id, b.id, "hatred") &&
          !relations.hasTag(a.id, b.id, RelationTag.Enemy)
        ) {
          markFired(a.id, b.id, "hatred");
          relations.addTag(a.id, b.id, RelationTag.Enemy);
          relations.addTag(b.id, a.id, RelationTag.Enemy);
          events.emit({
            tick,
            type: "system_warning",
            data: {
              event: "hatred",
              a: { id: a.id, name: a.name },
              b: { id: b.id, name: b.name },
            },
            message: `😤「${a.name}」与「${b.name}」积怨成恨，成为宿敌`,
          });
        }

        // ── 血仇 (≤ -80) + 复仇冲动 ───────────────────────
        if (
          score <= -80 &&
          !hasFired(a.id, b.id, "blood_feud") &&
          !relations.hasTag(a.id, b.id, RelationTag.BloodFeud)
        ) {
          markFired(a.id, b.id, "blood_feud");
          relations.addTag(a.id, b.id, RelationTag.BloodFeud);
          relations.addTag(b.id, a.id, RelationTag.BloodFeud);

          events.emit({
            tick,
            type: "system_warning",
            data: {
              event: "blood_feud",
              a: { id: a.id, name: a.name },
              b: { id: b.id, name: b.name },
            },
            message: `🩸「${a.name}」与「${b.name}」结下血海深仇！不死不休！`,
          });

          // Auto-insert revenge: stronger party devours the weaker
          const aQi = a.components.tank?.tanks[a.components.tank.coreParticle] ?? 0;
          const bQi = b.components.tank?.tanks[b.components.tank!.coreParticle] ?? 0;

          if (aQi > bQi && aQi > 0) {
            // a is stronger → a devours b
            context.world.performAction(a.id, "devour", b.id);
            events.emit({
              tick,
              type: "system_warning",
              data: { event: "revenge", attacker: a.name, victim: b.name },
              message: `⚔️「${a.name}」怒不可遏，发动了对「${b.name}」的复仇！`,
            });
          } else if (bQi > aQi && bQi > 0) {
            // b is stronger → b devours a
            context.world.performAction(b.id, "devour", a.id);
            events.emit({
              tick,
              type: "system_warning",
              data: { event: "revenge", attacker: b.name, victim: a.name },
              message: `⚔️「${b.name}」怒不可遏，发动了对「${a.name}」的复仇！`,
            });
          }
        }
      }
    }
  },
};
