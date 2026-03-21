// ============================================================
// AcquireSystem — 获取 / 拥有
//
// 获取目标实体的所有权（如法宝、灵植等）。
// 通过 RelationTag 标记 Owner/Owned 关系。
// ============================================================

import { RelationTag } from "../../types.js";
import type { ActionResolver } from "../types.js";

export const doAcquire: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "获取需要指定目标" };
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
        type: "add_relation_tag",
        a: entity.id,
        b: context.target.id,
        tag: RelationTag.Owner,
      },
      {
        type: "add_relation_tag",
        a: context.target.id,
        b: entity.id,
        tag: RelationTag.Owned,
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
          type: "entity_acquired",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
          },
          message: `${entityName} 获得了 ${targetName} 的所有权`,
        },
      },
    ],
  };
};
