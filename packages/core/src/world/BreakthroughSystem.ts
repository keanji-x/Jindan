// ============================================================
// BreakthroughSystem — 境界突破 (相变)
// ============================================================

import type { EventBus } from "../EventBus.js";
import { SPECIES } from "../entity/index.js";
import type { Entity } from "../entity/types.js";
import type { ActionHandler } from "../entity/actions/types.js";
import { BREAKTHROUGH_CONFIG } from "./config.js";
import type { AmbientQi } from "./types.js";

export interface BreakthroughResult {
  success: boolean;
  newRealm?: number;
  reason?: string;
  expLost?: number;
}

export const doBreakthrough: ActionHandler = (entity, _actionId, context) => {
  const { actionCost, ambientQi, tick, events } = context;
  const qiComp = entity.components.qi;
  const cultComp = entity.components.cultivation;
  const combatComp = entity.components.combat;

  if (!qiComp || !cultComp || !combatComp) {
    return { success: false, reason: "实体缺少必要组件(Qi, Cultivation, Combat)" };
  }

  if (cultComp.realm >= 10) {
    return { success: false, reason: "已是最高境界" };
  }
  
  if (qiComp.current / qiComp.max < 0.9) {
    return { success: false, reason: "灵气未臻圆满(需90%容量)" };
  }

  const extraCost = BREAKTHROUGH_CONFIG.qiCost(cultComp.realm);
  const totalCost = actionCost + extraCost;

  if (qiComp.current <= totalCost) {
    return { success: false, reason: "灵气不足以尝试突破" };
  }

  // 消耗灵气 → 回归天地 (守恒)
  qiComp.current -= totalCost;
  ambientQi.current += totalCost;

  // 成功率
  const qiRatio = qiComp.current / qiComp.max;
  const successRate = Math.min(
    BREAKTHROUGH_CONFIG.baseSuccessRate + qiRatio * 0.3,
    BREAKTHROUGH_CONFIG.maxSuccessRate,
  );

  if (Math.random() > successRate) {
    const qiLoss = Math.floor(qiComp.current * BREAKTHROUGH_CONFIG.failQiLossRatio);
    qiComp.current = Math.max(0, qiComp.current - qiLoss);
    ambientQi.current += qiLoss; // 走火入魔，灵气散入天地
    return { success: false, reason: "突破失败，真气逆流", flux: totalCost + qiLoss };
  }

  // 成功: 相变
  cultComp.realm += 1;

  const template = SPECIES[entity.species]!;
  qiComp.max = template.baseMaxQi(cultComp.realm);
  combatComp.power = template.basePower(cultComp.realm) + Math.floor(Math.random() * cultComp.realm * 2);

  events.emit({
    tick,
    type: "entity_breakthrough",
    data: {
      id: entity.id,
      name: entity.name,
      species: entity.species,
      newRealm: cultComp.realm,
      power: combatComp.power,
    },
    message: `✨「${entity.name}」突破成功！境界提升至 ${cultComp.realm} 阶，战力 ${combatComp.power}`,
  });

  return { success: true, newRealm: cultComp.realm, flux: totalCost };
}
