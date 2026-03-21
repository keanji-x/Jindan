// ============================================================
// TravelSystem — 一起游历
//
// 与同伴共同游历天地间，消耗少量灵气，提升好感。
// 需要一定基础好感（≥ 10）才会一同出行。
// ============================================================

import type { ActionResolver } from "../types.js";

export const doTravel: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "游历需要指定同伴" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "同伴不存在或已消亡" };
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
        delta: 8,
      },
      {
        type: "emit_event",
        event: {
          tick: context.tick,
          type: "entity_courted",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
            action: "travel",
          },
          message: `${entityName} 与 ${targetName} 结伴游历山水间，好感渐增`,
        },
      },
    ],
  };
};
