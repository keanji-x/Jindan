// ============================================================
// normalizeEntity — 数据迁移：补全缺失的 component 字段
//
// 从 PG 加载的旧实体可能缺少后来新增的字段（如 brain.replyMode）。
// 在加载时统一补全，确保运行时不需要做防御性检查。
// ============================================================

import type { Entity } from "../world/types.js";

/**
 * 就地修复实体缺失的字段。
 * 每次新增 component 字段时，在此追加一条迁移规则。
 */
export function normalizeEntity(entity: Entity): Entity {
  // brain.replyMode — 2026-03-23 新增
  // 旧实体只有 { id: "heuristic_optimizer" }，缺 replyMode
  // 默认 "auto"（NPC 自动回复），只有被 Agent 接管时才是 "manual"
  if (entity.components.brain && !entity.components.brain.replyMode) {
    entity.components.brain.replyMode = "auto";
  }

  return entity;
}
