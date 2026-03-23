// ============================================================
// ChatReplySystem — 回信系统
//
// brain 从自身信箱取未读消息，生成模板回复，推入发送方信箱
// ============================================================

import { nanoid } from "nanoid";
import type { Effect } from "../../effects/types.js";
import type { ChatMessage, Entity } from "../../types.js";
import type { ActionResolver } from "../types.js";

/**
 * 基于目标状态生成情景化回复。
 * seed = tick + id → 同一时刻同一实体回复稳定但不单调。
 */
function generateReply(
  replier: Entity,
  senderId: string,
  senderName: string,
  relation: number,
  _incomingMessage: string,
  tick: number,
): string {
  // 安全取第 3 个字符（id 可能很短）；防止 NaN 导致 arr[NaN]=undefined
  const charCode = replier.id.length >= 3 ? replier.id.charCodeAt(2) : replier.id.charCodeAt(0);
  const seed = (Number.isFinite(charCode) ? charCode : 0) + tick;
  const pick = <T>(arr: T[]): T => arr[Math.abs(seed) % arr.length] ?? arr[0];
  const rName = replier.name || replier.id;
  const eName = senderName;
  const tank = replier.components.tank;
  const coreQi = tank?.tanks[tank.coreParticle] ?? 0;
  const isLowQi = coreQi < 200;

  // ── 敌意 → 鄙视（最高优先级）──────────────────────
  if (relation < -40) {
    return pick([
      "你是什么东西，也配与我说话？",
      "滚。",
      `哼，${eName}？本座不认识你。`,
      "……（冷冷瞥了一眼，不作回应）",
      "识趣的话，离我远点。",
      "别浪费我的时间。",
    ]);
  }

  // ── 高好感 → 友好（先于低灵气：朋友不会因为缺气就不理你）
  if (relation > 50) {
    return pick([
      `${eName}道友！今天天气真好，适合出来走走。`,
      "嗯，好啊。你有什么事？",
      "来得正好，我正想找人聊聊。",
      `哈，${eName}！你找我？说吧。`,
      "今日灵气充盈，心情甚好。",
      `${rName}在此，道友请讲。`,
    ]);
  }

  // ── 极低灵气 → 无暇应答（关系一般时才触发）─────────
  if (isLowQi) {
    return pick([
      "灵气将尽……恕不奉陪。",
      "……（闭目凝神，显然无暇应答）",
      "先让我运功……",
      "等我缓过来再说。",
    ]);
  }

  // ── 中等好感 → 客气 ──────────────────────────────
  if (relation > 0) {
    return pick([
      "嗯？找我何事。",
      `${rName}见过道友。`,
      "有何贵干？",
      "你好。说吧。",
      "嗯……（点了点头）",
    ]);
  }

  // ── 微敌意 → 冷淡 ────────────────────────────────
  if (relation < -10) {
    return pick(["……有事？", "（皱眉）说。", "我很忙。", "什么事，长话短说。"]);
  }

  // ── 默认 → 随缘 ──────────────────────────────────
  return pick([
    "嗯。",
    "……好。",
    `${rName}在此，说吧。`,
    "嗯……（沉吟片刻）",
    "今日天地平静，你找我何事？",
    "我正在修炼，有话快说。",
    "随你。",
  ]);
}

export const doChatReply: ActionResolver = (entity, _actionId, context) => {
  const mailbox = entity.components.mailbox;
  if (!mailbox) {
    return { status: "aborted", reason: "无信箱" };
  }

  // 取所有未读的「原始」消息（过滤掉 isReply，避免把 LLM 回复当作新消息再处理）
  const unread = mailbox.messages.filter((m) => !m.read && !m.isReply);
  if (unread.length === 0) {
    return { status: "aborted", reason: "无未读消息" };
  }

  // mailbox.messages 是 unshift 插入的（最新在前），所以最旧的未读在数组末尾
  const msg = unread[unread.length - 1]!
  msg.read = true;

  const entityName = entity.name || entity.id;
  const relation = context.getRelation(entity.id, msg.fromId);
  const replyStr = generateReply(
    entity,
    msg.fromId,
    msg.fromName,
    relation,
    msg.message,
    context.tick,
  );

  // 构建回复信箱消息
  const replyMsg: ChatMessage = {
    id: nanoid(),
    tick: context.tick,
    fromId: entity.id,
    fromName: entityName,
    message: replyStr,
    read: false,
    isReply: true,
  };

  const effects: Effect[] = [
    // 推入发送方信箱
    { type: "push_mailbox", targetId: msg.fromId, message: replyMsg },
    // 回复事件
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_chat",
        data: {
          entity: { id: entity.id, name: entityName },
          target: { id: msg.fromId, name: msg.fromName },
          message: replyStr,
        },
        message: `${entityName} 回复 ${msg.fromName}：「${replyStr}」`,
      },
    },
    // 回复方好感提升
    { type: "adjust_relation", a: entity.id, b: msg.fromId, delta: 10 },
    // 回复方心境微调
    { type: "adjust_mood", entityId: entity.id, delta: 0.03 },
  ];

  return {
    status: "success",
    successEffects: effects,
  };
};
