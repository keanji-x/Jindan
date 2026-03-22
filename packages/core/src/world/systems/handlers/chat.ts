// ============================================================
// ChatSystem — 传音系统（含即时回复）
//
// 发起方传音 → 目标立刻回复（模板池 + 上下文权重）
// 一次 action 产出两条 entity_chat 事件
// ============================================================

import type { Effect } from "../../effects/types.js";
import type { Entity } from "../../types.js";
import type { ActionResolver } from "../types.js";

/**
 * 基于目标状态生成情景化回复。
 * seed = tick + id → 同一时刻同一实体回复稳定但不单调。
 */
function generateReply(
  target: Entity,
  entity: Entity,
  relation: number,
  _incomingMessage: string,
  tick: number,
): string {
  const seed = (target.id.charCodeAt(2) ?? 0) + tick;
  const pick = <T>(arr: T[]): T => arr[seed % arr.length];
  const tName = target.name || target.id;
  const eName = entity.name || entity.id;
  const tank = target.components.tank;
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
      `${tName}在此，道友请讲。`,
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
      `${tName}见过道友。`,
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
    `${tName}在此，说吧。`,
    "嗯……（沉吟片刻）",
    "今日天地平静，你找我何事？",
    "我正在修炼，有话快说。",
    "随你。",
  ]);
}

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

  // ── 目标即时回复 ────────────────────────────────────
  const relation = context.getRelation(entity.id, context.target.id);
  const replyStr = generateReply(context.target, entity, relation, messageStr, context.tick);

  const effects: Effect[] = [
    // 1. 发起者的传音
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
    // 2. 目标的即时回复
    {
      type: "emit_event",
      event: {
        tick: context.tick,
        type: "entity_chat",
        data: {
          entity: { id: context.target.id, name: targetName },
          target: { id: entity.id, name: entityName },
          message: replyStr,
        },
        message: `${targetName} 回复 ${entityName}：「${replyStr}」`,
      },
    },
    // 双方好感提升
    { type: "adjust_relation", a: entity.id, b: context.target.id, delta: 15 },
    // 双方心境微调
    { type: "adjust_mood", entityId: entity.id, delta: 0.05 },
    { type: "adjust_mood", entityId: context.target.id, delta: 0.03 },
  ];

  return {
    status: "success",
    successEffects: effects,
    messageSent: true,
  };
};
