// ============================================================
// BreakthroughSystem — handler (物理逻辑)
//
// 境界突破: 占比接近物种容忍上限时可突破
// 突破后 proportionLimit 随 realm 提高
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { GraphRegistry } from "../../effects/GraphRegistry.js";
import type { Effect } from "../../effects/types.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import type { ActionResolver } from "../types.js";
import { TribulationGenerator } from "./tribulation/generator.js";

export const doBreakthrough: ActionResolver = (entity, _actionId, context) => {
  const { ambientPool, tick } = context;
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;

  if (!tankComp || !cultComp) {
    return { status: "aborted", reason: "实体缺少必要组件(Tank, Cultivation)" };
  }

  const core = tankComp.coreParticle;
  const coreQi = tankComp.tanks[core] ?? 0;
  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { status: "aborted", reason: "无反应炉配置" };

  // 占比判定突破条件
  const bt = UNIVERSE.breakthrough;
  const worldTotal = ambientPool.total;
  const currentProportion = worldTotal > 0 ? coreQi / worldTotal : 0;
  const speciesLimit = reactorTemplate.proportionLimit(cultComp.realm);

  // 需要占比达到物种容忍比例的 minQiRatio 才能尝试突破
  // 例: limit=0.05, minQiRatio=0.9 → 需占比达到 0.045
  if (currentProportion < speciesLimit * bt.minQiRatio) {
    return {
      status: "aborted",
      reason: `灵气占比不足(需${Math.round(speciesLimit * bt.minQiRatio * 100)}%世界总量)`,
    };
  }

  // 动态突破概率判定
  const progress = Math.min(
    1.0,
    (currentProportion - speciesLimit * bt.minQiRatio) /
      (speciesLimit * (1 - bt.minQiRatio) || 0.01),
  );
  const actualSuccessRate =
    bt.baseSuccessRate + progress * (bt.maxSuccessRate - bt.baseSuccessRate);

  if (Math.random() > actualSuccessRate) {
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
  // 【升维烈焰】 消耗自身大量燃料强行拔高核心约束场维度
  // ==========================================
  const upgradeCost = Math.floor(coreQi * bt.burnRatio);

  const simTank = { ...tankComp.tanks };
  const simAmbient = { ...ambientPool.pools };

  ParticleTransfer.transferWithConversion(
    simTank,
    simAmbient,
    { [core]: upgradeCost },
    ParticleTransfer.createBucket(
      ParticleTransfer.invertPolarity(reactorTemplate.ownPolarity),
      upgradeCost,
    ),
  );

  const newRealm = cultComp.realm + 1;
  const newProportionLimit = reactorTemplate.proportionLimit(newRealm);

  const effects: Effect[] = [];

  effects.push({ type: "sync_tank", entityId: entity.id, tanks: simTank });
  effects.push({ type: "sync_ambient", pools: simAmbient });
  effects.push({
    type: "set_realm",
    entityId: entity.id,
    realm: newRealm,
    newProportionLimit,
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
