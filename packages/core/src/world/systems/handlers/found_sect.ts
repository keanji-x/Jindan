// ============================================================
// FoundSect — 建立宗门
//
// 创始人消耗 sect 的 birthCost 粒子，创建一个宗门实体。
// 创始人自动成为宗主 (SectLeader)。
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Effect } from "../../effects/types.js";
import type { ActionResolver } from "../types.js";

export const doFoundSect: ActionResolver = (entity, _actionId, context) => {
  const tankComp = entity.components.tank;
  if (!tankComp) {
    return { status: "aborted", reason: "实体缺少粒子储罐" };
  }

  const sectReactor = UNIVERSE.reactors.sect;
  if (!sectReactor) {
    return { status: "aborted", reason: "宗门配置不存在" };
  }

  const cost = sectReactor.birthCost;
  const core = tankComp.coreParticle;
  const qi = tankComp.tanks[core] ?? 0;

  if (qi < cost) {
    return {
      status: "aborted",
      reason: `灵气不足以建宗 (需要 ${cost}，当前 ${qi})`,
    };
  }

  const entityName = entity.name || entity.id;
  const sectName = `${entityName}宗`;

  const effects: Effect[] = [
    // Deduct particles from founder
    {
      type: "transfer",
      from: entity.id,
      to: "ambient",
      amounts: { [core]: cost },
    },
    // Create the sect entity
    {
      type: "create_entity",
      name: sectName,
      species: "sect",
    },
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_sect_founded",
        data: {
          entity: { id: entity.id, name: entityName },
          sectName,
        },
        message: `${entityName} 开山立派，创建了「${sectName}」`,
      },
    },
  ];

  // Note: SectLeader/SectMember tags will be linked after sect entity creation
  // via a post-creation hook or follow-up action. For now, the create_entity
  // effect handles the entity creation; founder-sect linkage is done by the
  // caller or a cascade.

  return {
    status: "success",
    successEffects: effects,
  };
};
