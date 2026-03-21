// ============================================================
// BreakthroughSystem — handler (物理逻辑)
//
// 境界突破: 使用 ParticleTransfer 模拟维度相变
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { GraphRegistry } from "../../effects/GraphRegistry.js";
import type { Effect } from "../../effects/types.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import { TribulationGenerator } from "../tribulation/generator.js";
import type { ActionResolver } from "../types.js";

export const doBreakthrough: ActionResolver = (entity, _actionId, context) => {
  const { ambientPool, tick } = context;
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;

  if (!tankComp || !cultComp) {
    return { status: "aborted", reason: "实体缺少必要组件(Tank, Cultivation)" };
  }

  const core = tankComp.coreParticle;
  const coreMax = tankComp.maxTanks[core] ?? 1;
  const coreAvailableAfterCost = tankComp.tanks[core] ?? 0;

  // Breakthrough check (enough accumulated qi relative to max capacity)
  const bt = UNIVERSE.breakthrough;
  // 阈值拦截计算 (这里算 aborted)
  if (coreAvailableAfterCost / coreMax < bt.minQiRatio) {
    return { status: "aborted", reason: `灵气未臻圆满(需${Math.round(bt.minQiRatio * 100)}%容量)` };
  }

  // 动态突破概率判定
  const qiRatio = coreAvailableAfterCost / coreMax;
  const progress = Math.min(1.0, (qiRatio - bt.minQiRatio) / (1 - bt.minQiRatio));
  const actualSuccessRate =
    bt.baseSuccessRate + progress * (bt.maxSuccessRate - bt.baseSuccessRate);

  if (Math.random() > actualSuccessRate) {
    // 突破失败，走 failure 分支并且 emit 警告事件
    const failEvent: Effect = {
      type: "emit_event",
      event: {
        tick,
        type: "system_warning",
        data: { entityId: entity.id, action: "breakthrough" },
        message: `「${entity.name}」尝试突破，但根基不稳，功亏一篑。`,
      },
    };
    return {
      status: "failure",
      reason: "突破失败，根基动摇",
      failureEffects: [failEvent],
    };
  }

  // ==========================================
  // 【升维烈焰】 消耗自身 90% 的燃料强行拔高核心约束场维度
  // Pure Simulation Phase
  // ==========================================
  const upgradeCost = Math.floor(coreAvailableAfterCost * bt.burnRatio);
  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { status: "aborted", reason: "无反应炉配置" };

  const simTank = { ...tankComp.tanks };
  const simAmbient = { ...ambientPool.pools };

  ParticleTransfer.transferWithConversion(
    simTank,
    simAmbient,
    { [core]: upgradeCost },
    ParticleTransfer.createBucket(reactorTemplate.oppositePolarity, upgradeCost),
  );

  const newRealm = cultComp.realm + 1;
  const newMaxTanks = reactorTemplate.baseTanks(newRealm);

  const effects: Effect[] = [];

  effects.push({ type: "sync_tank", entityId: entity.id, tanks: simTank });
  effects.push({ type: "sync_ambient", pools: simAmbient });
  effects.push({
    type: "set_realm",
    entityId: entity.id,
    realm: newRealm,
    newMaxTanks,
  });

  effects.push({
    type: "emit_event",
    event: {
      tick,
      type: "entity_breakthrough",
      data: {
        id: entity.id,
        name: entity.name,
        species: entity.species,
        newRealm,
      },
      message: Formatters.breakthrough(entity, upgradeCost, newRealm),
    },
  });

  // ========== Phase 3: Dynamic Tribulation Generation ==========
  // Only trigger tribulation if the realm is significant (e.g. realm 2 and 3 and above)
  const tribGraph = TribulationGenerator.generate(entity, newRealm);
  GraphRegistry.register(tribGraph);

  effects.push({
    type: "cascade",
    entityId: entity.id,
    actionId: tribGraph.id,
  });

  return {
    status: "success",
    successEffects: effects,
    newRealm,
  };
};
