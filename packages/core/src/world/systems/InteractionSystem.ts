import type { GameSystem } from "./GameSystem.js";
import { doChat } from "./handlers/chat.js";
import { doDevour } from "./handlers/devour.js";
import type { ActionResolver } from "./types.js";

const interactionResolver: ActionResolver = (entity, actionId, context) => {
  switch (actionId) {
    case "devour":
      return doDevour(entity, actionId, context);
    case "chat":
      return doChat(entity, actionId, context);
    default:
      return { status: "aborted", reason: `Unknown action: ${actionId}` };
  }
};

export const InteractionSystem: GameSystem = {
  id: "interaction",
  name: "双边交互系统",
  actions: [
    {
      id: "devour",
      name: "吞噬",
      description: "攻击其他生灵，胜者夺取败者灵气",
      qiCost: 10,
      needsTarget: true,
      npcTargetFilter: "npc-only",
      relationRange: [-100, 50],
      canExecute: (entity, ctx) => {
        const hasTargets = ctx.getAliveEntities().some((e) => e.id !== entity.id);
        return hasTargets ? { ok: true } : { ok: false, reason: "没有可吞噬的目标" };
      },
    },
    {
      id: "chat",
      name: "传音",
      description: "向其他生灵发送神念",
      qiCost: 0,
      needsTarget: true,
      relationRange: [-80, 100],
    },
  ],
  handler: interactionResolver,
};
