// ============================================================
// AbsorbSystem — handler (物理逻辑)
//
// 吸收粒子: 打坐 / 月华 / 光合
// 双向流模型: 根据 absorbSource 从对手方吸取粒子，无上限。
// 吸收倍率在 1 附近随机扰动。
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Effect } from "../../effects/types.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import { Reactor } from "../../reactor/Reactor.js";
import type { ParticleBucket } from "../../reactor/types.js";
import type { ActionResolver } from "../types.js";

export const doAbsorb: ActionResolver = (entity, actionId, context) => {
  const { actionCost, ambientPool, tick } = context;
  const action = actionId as "meditate" | "moonlight" | "photosynth";
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;

  if (!tankComp || !cultComp) {
    return {
      status: "aborted",
      reason: "实体缺少组件(Tank或Cultivation)",
    };
  }

  const core = tankComp.coreParticle;

  // 1. 发动代价已经在 World 中被统扣了

  // 2. 算定吸纳的总游离量（无上限，倍率 ≈ 1 附近随机扰动）
  const reactorTemplate = UNIVERSE.reactors[entity.species];
  const actionDef = reactorTemplate?.actions.find((a) => a.id === action);
  const absorbRate = actionDef?.absorbRate;
  if (!absorbRate) {
    return { status: "aborted", reason: `无吸收参数: ${action}` };
  }
  const basePull = absorbRate.base + absorbRate.perRealm * cultComp.realm;
  // 吸收倍率在 0.8~1.2 之间随机，模拟天道不确定性
  const absorptionMultiplier = 0.8 + Math.random() * 0.4;
  const pullAmount = Math.floor(basePull * absorptionMultiplier);

  // 根据 absorbSource 决定从哪里拉粒子
  // 对于普通生物（absorbSource: "dao"），从 ambient pool 拉
  // TODO: "members" 模式需要从弟子身上拉（宗门用）
  const available = ambientPool.pools[core] ?? 0;

  const exactExtracted = Math.floor(Math.min(pullAmount, available));
  const effects: Effect[] = [];

  if (available < pullAmount / 2) {
    effects.push({
      type: "emit_event",
      event: {
        tick,
        type: "system_warning",
        data: { entityId: entity.id, action },
        message: `天地灵气稀薄，「${entity.name}」修行受阻。`,
      },
    });
  }

  // ==== Pure Execution Phase (Sandboxed Clones) ====
  const simTank = { ...tankComp.tanks };
  const simAmbient = { ...ambientPool.pools };
  const incomingBucket: ParticleBucket = {};

  if (exactExtracted > 0) {
    ParticleTransfer.transfer(simAmbient, incomingBucket, { [core]: exactExtracted });
  }

  const speciesReactor = UNIVERSE.reactors[entity.species];
  if (!speciesReactor) return { status: "aborted", reason: "无反应炉配置" };

  const startQi = tankComp.tanks[core] ?? 0;

  // 3. 将粒子打入自己的虚拟反应炉（无上限，不再有 overflow dump）
  const { alive, logs } = Reactor.processIncomingBeam(
    simTank,
    simAmbient,
    incomingBucket,
    UNIVERSE.ecology.ambientDensity,
    cultComp.realm,
    speciesReactor.ownPolarity,
  );

  // 不再有 Tank Overflow Dump — 天道裁决在 tick 结算时统一处理

  const finalQi = simTank[core] ?? 0;
  const actualNetGained = finalQi - startQi;

  effects.push({
    type: "sync_tank",
    entityId: entity.id,
    tanks: simTank,
  });

  effects.push({
    type: "sync_ambient",
    pools: simAmbient,
  });

  if (!alive) {
    effects.push({
      type: "set_status",
      entityId: entity.id,
      status: "lingering",
    });

    effects.push({
      type: "emit_event",
      event: {
        tick,
        type: "entity_died",
        data: { id: entity.id, species: entity.species, name: entity.name },
        message: Formatters.absorbBacklash(logs),
      },
    });

    return {
      status: "failure",
      reason: "突破反噬陨落",
      failureEffects: effects,
    };
  } else {
    effects.push({
      type: "emit_event",
      event: {
        tick,
        type: "entity_absorbed",
        data: {
          id: entity.id,
          species: entity.species,
          name: entity.name,
          absorbed: actualNetGained,
          newQi: finalQi,
        },
        message: Formatters.absorbSuccess(entity, exactExtracted, actualNetGained, 0),
      },
    });

    return {
      status: "success",
      successEffects: effects,
      absorbed: actualNetGained,
      actionCost,
    };
  }
};
