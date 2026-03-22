// ============================================================
// CourtSystem — 求爱
//
// 向目标表达爱意，提升双方关系值。
// 需要关系值 >= 30 才能发动。
// ============================================================

import type { ActionResolver } from "../types.js";

export const doCourt: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "求爱需要指定目标" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "目标不存在或已消亡" };
  }

  const entityName = entity.name || entity.id;
  const targetName = context.target.name || context.target.id;

  return {
    status: "success",
    successEffects: [
      {
        type: "adjust_relation",
        a: entity.id,
        b: context.target.id,
        delta: 15,
      },
      {
        type: "adjust_mood",
        entityId: entity.id,
        delta: 0.08,
      },
      {
        type: "adjust_mood",
        entityId: context.target!.id,
        delta: 0.05,
      },
      {
        type: "emit_event",
        event: {
          tick: context.tick,
          type: "entity_courted",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
          },
          message: `${entityName} 向 ${targetName} 表达了爱意`,
        },
      },
    ],
  };
};
