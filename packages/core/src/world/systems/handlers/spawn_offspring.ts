// ============================================================
// SpawnOffspring — 无性繁衍
//
// 自身消耗 birthCost 粒子，分裂产生同种子实体。
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Effect } from "../../effects/types.js";
import type { ActionResolver } from "../types.js";

export const doSpawnOffspring: ActionResolver = (entity, _actionId, context) => {
  const tankComp = entity.components.tank;
  if (!tankComp) {
    return { status: "aborted", reason: "实体缺少粒子储罐" };
  }

  const reactor = UNIVERSE.reactors[entity.species];
  if (!reactor) {
    return { status: "aborted", reason: "无反应炉配置" };
  }

  const cost = reactor.birthCost;
  const core = tankComp.coreParticle;
  const qi = tankComp.tanks[core] ?? 0;

  if (qi < cost) {
    return { status: "aborted", reason: "灵气不足以分裂繁衍" };
  }

  const entityName = entity.name || entity.id;
  const childName =
    reactor.npcNames?.length
      ? reactor.npcNames[Math.floor(Math.random() * reactor.npcNames.length)]!
      : entityName;

  const effects: Effect[] = [
    // Deduct particles from parent
    {
      type: "transfer",
      from: entity.id,
      to: "ambient",
      amounts: { [core]: cost },
    },
    // Create child entity (will pull birthCost from ambient)
    {
      type: "create_entity",
      name: childName,
      species: entity.species,
      parentIds: [entity.id],
    },
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_spawned_offspring",
        data: {
          entity: { id: entity.id, name: entityName },
          childName,
        },
        message: `${entityName} 分裂繁衍，诞下了 ${childName}`,
      },
    },
  ];

  return {
    status: "success",
    successEffects: effects,
  };
};
