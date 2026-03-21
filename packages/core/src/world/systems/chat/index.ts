// ============================================================
// ChatSystem — 传音系统
//
// 1 System → 1 Action: chat
// ============================================================

import type { GameSystem } from "../GameSystem.js";
import type { ActionResolver } from "../types.js";

const doChat: ActionResolver = (entity, _actionId, context) => {
  if (!context.target) {
    return {
      status: "aborted",
      reason: "传音需要指定目标",
    };
  }

  const payload = context.payload as Record<string, unknown> | string | undefined;
  const messageStr =
    typeof payload === "string"
      ? payload
      : typeof payload?.message === "string"
        ? payload.message
        : "（无声的神念）";
  const entityName = entity.name || entity.id;
  const targetName = context.target.name || context.target.id;

  return {
    status: "success",
    successEffects: [
      {
        type: "emit_event",
        event: {
          tick: context.tick,
          type: "entity_chat",
          data: {
            entity: { id: entity.id, name: entityName },
            target: { id: context.target.id, name: targetName },
            message: messageStr,
          },
          message: `${entityName} 向 ${targetName} 传音：「${messageStr}」`,
        },
      },
      {
        type: "adjust_relation",
        a: entity.id,
        b: context.target.id,
        delta: 5,
      },
    ],
    messageSent: true,
  };
};

export const ChatSystem: GameSystem = {
  id: "chat",
  name: "传音",
  actions: [
    {
      id: "chat",
      name: "传音",
      description: "向其他生灵发送神念",
      qiCost: 0,
      species: ["human", "beast", "plant"],
      needsTarget: true,
      relationRange: [-80, 100],
    },
  ],
  handler: doChat,
};
