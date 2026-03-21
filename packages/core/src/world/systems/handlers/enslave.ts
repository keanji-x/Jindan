// ============================================================
// EnslaveSystem — 奴役
//
// 以力服人：境界差 >= 2 才能奴役。
// 通过 RelationTag 标记 Enslaver/Enslaved 关系。
// ============================================================

import { RelationTag } from "../../types.js";
import type { ActionResolver } from "../types.js";

export const doEnslave: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "奴役需要指定目标" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "目标不存在或已消亡" };
  }

  const entityCult = entity.components.cultivation;
  const targetCult = context.target.components.cultivation;

  if (!entityCult || !targetCult) {
    return { status: "aborted", reason: "实体缺少修为组件" };
  }

  const realmDiff = entityCult.realm - targetCult.realm;
  if (realmDiff < 2) {
    return {
      status: "aborted",
      reason: `境界差不足，需高出目标至少2个小境界 (当前差距: ${realmDiff})`,
    };
  }

  const entityName = entity.name || entity.id;
  const targetName = context.target.name || context.target.id;

  return {
    status: "success",
    successEffects: [
      {
        type: "add_relation_tag",
        a: entity.id,
        b: context.target.id,
        tag: RelationTag.Enslaver,
      },
      {
        type: "add_relation_tag",
        a: context.target.id,
        b: entity.id,
        tag: RelationTag.Enslaved,
      },
      {
        type: "adjust_relation",
        a: entity.id,
        b: context.target.id,
        delta: -20,
      },
      {
        type: "emit_event",
        event: {
          tick: context.tick,
          type: "entity_enslaved",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
            realmDiff,
          },
          message: `${entityName} 以绝对力量奴役了 ${targetName}`,
        },
      },
    ],
  };
};
