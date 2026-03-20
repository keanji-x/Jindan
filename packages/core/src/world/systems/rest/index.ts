// ============================================================
// RestSystem — 休息系统
//
// 1 System → 1 Action: rest
// ============================================================

import type { GameSystem } from "../GameSystem.js";
import type { ActionHandler } from "../types.js";

const doRest: ActionHandler = (entity, _actionId, ctx) => {
  const { actionCost } = ctx;
  const tankComp = entity.components.tank;
  if (!tankComp) return { success: false, reason: "实体没有粒子储罐" };

  // Cost is already deducted by World.performAction
  return { success: true, rested: true, actionCost };
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
      species: ["human", "beast", "plant"],
      needsTarget: false,
    },
  ],
  handler: doRest,
};
