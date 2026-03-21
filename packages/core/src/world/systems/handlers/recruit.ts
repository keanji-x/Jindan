// ============================================================
// RecruitSystem — 招揽弟子 / 成员
//
// 将目标纳入麾下：添加 SectMember/SectLeader 标签。
// 需要目标好感度 >= 20，且不能已经是自己的成员。
// ============================================================

import { RelationTag } from "../../types.js";
import type { ActionResolver } from "../types.js";

export const doRecruit: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "招揽需要指定目标" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "目标不存在或已消亡" };
  }
  if (entity.id === context.target.id) {
    return { status: "aborted", reason: "不能招揽自己" };
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
        tag: RelationTag.SectLeader,
      },
      {
        type: "add_relation_tag",
        a: context.target.id,
        b: entity.id,
        tag: RelationTag.SectMember,
      },
      {
        type: "adjust_relation",
        a: entity.id,
        b: context.target.id,
        delta: 10,
      },
      {
        type: "emit_event",
        event: {
          tick: context.tick,
          type: "entity_recruited",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
          },
          message: `${entityName} 将 ${targetName} 收入门下`,
        },
      },
    ],
  };
};
