// ============================================================
// DevourSystem — 吞噬系统
//
// 1 System → 1 Action: devour
// ============================================================

import type { GameSystem } from "../GameSystem.js";
import { doDevour } from "./handler.js";

export const DevourSystem: GameSystem = {
  id: "devour",
  name: "吞噬",
  actions: [
    {
      id: "devour",
      name: "吞噬",
      description: "攻击其他生灵，胜者夺取败者灵气",
      qiCost: 10,
      species: ["human", "beast"],
      needsTarget: true,
      npcTargetFilter: "npc-only",
      canExecute: (entity, ctx) => {
        const hasTargets = ctx.getAliveEntities().some((e) => e.id !== entity.id);
        return hasTargets ? { ok: true } : { ok: false, reason: "没有可吞噬的目标" };
      },
    },
  ],
  handler: doDevour,
};
