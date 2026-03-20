// ============================================================
// BreakthroughSystem — handler (物理逻辑)
//
// 境界突破: 使用 ParticleTransfer 模拟维度相变
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import type { ActionHandler } from "../types.js";

export const doBreakthrough: ActionHandler = (entity, _actionId, context) => {
  const { ambientPool, tick, events } = context;
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;

  if (!tankComp || !cultComp) {
    return { success: false, reason: "实体缺少必要组件(Tank, Cultivation)" };
  }

  const core = tankComp.coreParticle;

  const coreMax = tankComp.maxTanks[core] ?? 1;

  // 1. 发动代价已经在 World 中被统扣了

  const coreAvailableAfterCost = tankComp.tanks[core] ?? 0;

  // Breakthrough check (enough accumulated qi relative to max capacity)
  const bt = UNIVERSE.breakthrough;
  // 阈值拦截计算
  if (coreAvailableAfterCost / coreMax < bt.minQiRatio) {
    return { success: false, reason: `灵气未臻圆满(需${Math.round(bt.minQiRatio * 100)}%容量)` };
  }

  // 动态突破概率判定
  const qiRatio = coreAvailableAfterCost / coreMax;
  const progress = Math.min(1.0, (qiRatio - bt.minQiRatio) / (1 - bt.minQiRatio));
  const actualSuccessRate =
    bt.baseSuccessRate + progress * (bt.maxSuccessRate - bt.baseSuccessRate);

  if (Math.random() > actualSuccessRate) {
    return { success: false, reason: "突破失败，根基动摇" };
  }

  // ==========================================
  // 【升维烈焰】 消耗自身 90% 的燃料强行拔高核心约束场维度
  // ==========================================
  const upgradeCost = Math.floor(coreAvailableAfterCost * bt.burnRatio);

  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { success: false, reason: "无反应炉配置" };

  ParticleTransfer.transferWithConversion(
    tankComp.tanks,
    ambientPool.pools,
    { [core]: upgradeCost },
    ParticleTransfer.createBucket(reactorTemplate.oppositePolarity, upgradeCost),
  );

  cultComp.realm += 1;

  const newMaxTanks = reactorTemplate.baseTanks(cultComp.realm);
  for (const [pid, max] of Object.entries(newMaxTanks)) {
    tankComp.maxTanks[pid] = max;
  }

  events.emit({
    tick,
    type: "entity_breakthrough",
    data: {
      id: entity.id,
      name: entity.name,
      species: entity.species,
      newRealm: cultComp.realm,
    },
    message: Formatters.breakthrough(entity, upgradeCost, cultComp.realm),
  });

  return { success: true, newRealm: cultComp.realm };
};
