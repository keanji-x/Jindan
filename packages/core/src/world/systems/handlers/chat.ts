// ============================================================
// ChatSystem — 传音系统（信箱模式）
//
// 发起方传音 → 消息推入目标信箱 → brain 异步回复
// 一次 action 只产出一条 entity_chat 事件（发送方）
// ============================================================

import { nanoid } from "nanoid";
import type { Effect } from "../../effects/types.js";
import type { ChatMessage } from "../../types.js";
import type { ActionResolver } from "../types.js";

export const doChat: ActionResolver = (entity, _actionId, context) => {
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

  // 构建信箱消息
  const chatMsg: ChatMessage = {
    id: nanoid(),
    tick: context.tick,
    fromId: entity.id,
    fromName: entityName,
    message: messageStr,
    read: false,
  };

  const effects: Effect[] = [
    // 1. 推入目标信箱
    { type: "push_mailbox", targetId: context.target.id, message: chatMsg },
    // 2. 发起者的传音事件
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
    // 好感微调（发送时 +5，回复时再加）
    { type: "adjust_relation", a: entity.id, b: context.target.id, delta: 5 },
    // 发起方心境微调
    { type: "adjust_mood", entityId: entity.id, delta: 0.03 },
  ];

  return {
    status: "success",
    successEffects: effects,
    messageSent: true,
  };
};
