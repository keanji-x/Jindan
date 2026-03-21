// ============================================================
// RestSystem — 休息系统
//
// 1 System → 1 Action: rest
// ============================================================

import type { GameSystem } from "../GameSystem.js";
import type { ActionResolver } from "../types.js";

export const doRest: ActionResolver = (entity, actionId, ctx) => {
  const { actionCost, tick } = ctx;
  const tankComp = entity.components.tank;
  if (!tankComp) {
    return {
      status: "aborted",
      reason: "实体没有粒子储罐",
    };
  }

  return {
    status: "success",
    successEffects: [
      {
        type: "emit_event",
        event: {
          tick,
          type: "report",
          data: { actionCost, actionId },
          message: `${entity.name} 休息了一个回合`,
        },
      },
    ],
    rested: true,
  };
};

export const RestSystem: GameSystem = {
  id: "rest",
  name: "休息",
  actions: [
    {
      id: "rest",
      name: "休息",
      description: "无所事事 (仍会被动流失灵气)",
      qiCost: 0,
      needsTarget: false,
    },
  ],
  handler: doRest,
};
