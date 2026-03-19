import type { ActionDef, ActionHandler } from "./types.js";

export const CHAT: ActionDef = {
  id: "chat",
  name: "传音",
  description: "向其他生灵发送神念",
  cliCommand: "jindan chat",
  cliHelp: "jindan chat <targetName> <message>",
  qiCost: 0,
  species: ["human", "beast", "plant"], // All species can send telepathic messages
  needsTarget: true,
};

export const doChat: ActionHandler = (entity, _actionId, context) => {
  if (!context.target) {
    return { success: false, reason: "传音需要指定目标" };
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

  context.events.emit({
    tick: context.tick,
    type: "entity_chat",
    data: {
      entity: { id: entity.id, name: entityName },
      target: { id: context.target.id, name: targetName },
      message: messageStr,
    },
    message: `${entityName} 向 ${targetName} 传音：「${messageStr}」`,
  });

  return { success: true, messageSent: true, flux: 10 };
};
