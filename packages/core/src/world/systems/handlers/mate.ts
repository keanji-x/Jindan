// ============================================================
// MateSystem — 有性繁衍
//
// 双方各出 birthCost/2 粒子，创建同种子实体。
// 需要高好感 (>= 70)，双方都带 DaoPartner tag 后加成。
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Effect } from "../../effects/types.js";
import type { ActionResolver } from "../types.js";

export const doMate: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "繁衍需要指定伴侣" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "伴侣不存在或已消亡" };
  }
  if (entity.species !== context.target.species) {
    return { status: "aborted", reason: "只能与同种族繁衍" };
  }

  const entityTank = entity.components.tank;
  const targetTank = context.target.components.tank;
  if (!entityTank || !targetTank) {
    return { status: "aborted", reason: "实体缺少粒子储罐" };
  }

  const reactor = UNIVERSE.reactors[entity.species];
  if (!reactor) {
    return { status: "aborted", reason: "无反应炉配置" };
  }

  const halfCost = Math.ceil(reactor.birthCost / 2);
  const entityCore = entityTank.coreParticle;
  const entityQi = entityTank.tanks[entityCore] ?? 0;
  const targetQi = targetTank.tanks[targetTank.coreParticle] ?? 0;

  if (entityQi < halfCost) {
    return { status: "aborted", reason: "自身灵气不足以繁衍" };
  }
  if (targetQi < halfCost) {
    return { status: "aborted", reason: "伴侣灵气不足以繁衍" };
  }

  const entityName = entity.name || entity.id;
  const targetName = context.target.name || context.target.id;
  const childName = `${entityName}之裔`;

  const effects: Effect[] = [
    // Deduct particles from both parents
    {
      type: "transfer",
      from: entity.id,
      to: "ambient",
      amounts: { [entityCore]: halfCost },
    },
    {
      type: "transfer",
      from: context.target.id,
      to: "ambient",
      amounts: { [entityCore]: halfCost },
    },
    // Create child entity (will pull birthCost from ambient)
    {
      type: "create_entity",
      name: childName,
      species: entity.species,
      parentIds: [entity.id, context.target.id],
    },
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_mated",
        data: {
          entity: { id: entity.id, name: entityName },
          target: { id: context.target.id, name: targetName },
          childName,
        },
        message: `${entityName} 与 ${targetName} 结合，诞下了 ${childName}`,
      },
    },
  ];

  return {
    status: "success",
    successEffects: effects,
  };
};
