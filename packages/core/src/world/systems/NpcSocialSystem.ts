// ============================================================
// NpcSocialSystem — NPC 随机社交行为
//
// 纯被动 System: 每 tick 所有 NPC 有概率主动发起社交行为。
// 根据当前关系状态选择合适的行动和目标，让世界更加生动。
//
// 行为池 (按关系分层):
//   好感 ≥ 30 → 求爱 (court)
//   好感 ≥ 20 → 招揽 (recruit)
//   好感 ≥ 10 → 共游 (travel)
//   好感 ≥ -50 → 请客 (treat)   — 最容易触发
//   任意      → 闲聊 (chat)
// ============================================================

import type { Entity } from "../types.js";
import type { GameSystem, WorldTickContext } from "./GameSystem.js";

/** 每个 NPC 每 tick 发起社交行为的概率 */
const SOCIAL_CHANCE_PER_ENTITY = 0.15;

interface SocialOption {
  actionId: string;
  name: string;
  minRelation: number;
  weight: number;
}

/** 社交行为池 — 低门槛行为权重更高 */
const socialOptions: SocialOption[] = [
  { actionId: "treat", name: "请客", minRelation: -50, weight: 4 },
  { actionId: "chat", name: "闲聊", minRelation: -100, weight: 5 },
  { actionId: "travel", name: "共游", minRelation: 10, weight: 3 },
  { actionId: "recruit", name: "招揽", minRelation: 20, weight: 2 },
  { actionId: "court", name: "求爱", minRelation: 30, weight: 2 },
];

function pickWeightedOption(options: SocialOption[]): SocialOption {
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[0]!;
}

function pickRandomTarget(
  actor: Entity,
  entities: Entity[],
  minRelation: number,
  relations: { get: (a: string, b: string) => number },
  sameSpeciesOnly: boolean = false,
): Entity | null {
  const candidates = entities.filter((e) => {
    if (e.id === actor.id) return false;
    if (e.status !== "alive") return false;
    if (e.species === "dao") return false;
    if (sameSpeciesOnly && e.species !== actor.species) return false;
    const score = relations.get(actor.id, e.id);
    return score >= minRelation;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export const NpcSocialSystem: GameSystem = {
  id: "npc_social",
  name: "NPC 社交行为",
  actions: [], // 纯被动系统

  onTick: (context: WorldTickContext) => {
    const { entities, events, tick } = context;
    const relations = context.world.relations;

    const aliveNpcs = entities.filter((e) => e.status === "alive" && e.species !== "dao");

    for (const npc of aliveNpcs) {
      // Probability gate per entity
      if (Math.random() > SOCIAL_CHANCE_PER_ENTITY) continue;

      // Check qi — need at least some qi to socialize
      const tank = npc.components.tank;
      if (!tank) continue;
      const core = tank.coreParticle;
      const qi = tank.tanks[core] ?? 0;
      if (qi < 5) continue; // Too weak to socialize

      // Filter available actions based on current relations with any target
      const availableOptions = socialOptions.filter((opt) => {
        // Check if there's at least one valid target for this action
        const sameSpecies = opt.actionId === "court";
        return aliveNpcs.some((target) => {
          if (target.id === npc.id) return false;
          if (sameSpecies && target.species !== npc.species) return false;
          const score = relations.get(npc.id, target.id);
          return score >= opt.minRelation;
        });
      });

      if (availableOptions.length === 0) continue;

      // Pick a random action
      const chosen = pickWeightedOption(availableOptions);

      // Find a compatible target
      const sameSpecies = chosen.actionId === "court";
      const target = pickRandomTarget(npc, aliveNpcs, chosen.minRelation, relations, sameSpecies);
      if (!target) continue;

      // Execute the action via World.performAction
      const result = context.world.performAction(npc.id, chosen.actionId, target.id);

      if (result.success) {
        events.emit({
          tick,
          type: "system_warning",
          data: {
            event: "npc_social",
            actor: { id: npc.id, name: npc.name },
            target: { id: target.id, name: target.name },
            action: chosen.actionId,
          },
          message: `🎭「${npc.name}」主动向「${target.name}」发起了${chosen.name}`,
        });
      }
    }
  },
};
