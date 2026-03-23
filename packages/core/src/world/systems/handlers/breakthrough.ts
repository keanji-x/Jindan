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

  // 占比判定突破概率: P(success) = ratio^k
  const bt = UNIVERSE.breakthrough;
  const worldTotal = ambientPool.total;
  const currentProportion = worldTotal > 0 ? coreQi / worldTotal : 0;
  const speciesLimit = reactorTemplate.proportionLimit(cultComp.realm);
  const ratio = speciesLimit > 0 ? Math.min(currentProportion / speciesLimit, 1) : 0;
  const successRate = ratio ** bt.successExponent;

  if (Math.random() > successRate) {
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
      failureEffects: [
        failEvent,
        {
          type: "adjust_mood" as const,
          entityId: entity.id,
          delta: -0.15,
        },
      ],
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

  // 突破大喜
  effects.push({
    type: "adjust_mood",
    entityId: entity.id,
    delta: 0.2,
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
