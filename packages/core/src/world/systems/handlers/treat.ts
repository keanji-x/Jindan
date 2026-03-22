// ============================================================
// TreatSystem — 请客
//
// 以灵气为代价招待目标，大幅提升双方好感。
// ============================================================

import type { ActionResolver } from "../types.js";

export const doTreat: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return { status: "aborted", reason: "请客需要指定目标" };
  }
  if (context.target.status !== "alive") {
    return { status: "aborted", reason: "目标不存在或已消亡" };
  }

  const entityName = entity.name || entity.id;
  const targetName = context.target.name || context.target.id;

  // Transfer some qi to the target as a gift
  const tank = entity.components.tank;
  const targetTank = context.target.components.tank;
  const giftAmount = 5;

  const effects: import("../../effects/types.js").Effect[] = [
    {
      type: "adjust_relation",
      a: entity.id,
      b: context.target.id,
      delta: 20,
    },
    {
      type: "adjust_mood",
      entityId: entity.id,
      delta: 0.1,
    },
    {
      type: "adjust_mood",
      entityId: context.target!.id,
      delta: 0.08,
    },
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_courted",
        data: {
          entity: { id: entity.id, name: entityName },
          target: { id: context.target.id, name: targetName },
          action: "treat",
        },
        message: `${entityName} 设宴款待了 ${targetName}，双方好感倍增`,
      },
    },
  ];

  // If both have tanks, transfer some qi as a gift (conservation!)
  if (tank && targetTank) {
    const core = tank.coreParticle;
    const available = tank.tanks[core] ?? 0;
    const actual = Math.min(giftAmount, available);
    if (actual > 0) {
      effects.unshift({
        type: "transfer",
        from: entity.id,
        to: context.target.id,
        amounts: { [core]: actual },
      });
    }
  }

  return {
    status: "success",
    successEffects: effects,
  };
};
