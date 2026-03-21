// ============================================================
// AbsorbSystem — handler (物理逻辑)
//
// 吸收灵气: 打坐 / 月华 / 光合
// Uses ParticleTransfer and Reactor.processIncomingBeam.
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

  // 1. 发动代价已经在 World 中被统扣了 (如果失败或 aborted 会退还)

  // 2. 算定吸纳的总游离量
  const cfg = UNIVERSE.absorb[action];
  if (!cfg) {
    return { status: "aborted", reason: `未知吸收动作: ${action}` };
  }
  const pullAmount = cfg.base + cfg.perRealm * cultComp.realm;
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

  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { status: "aborted", reason: "无反应炉配置" };

  const startQi = tankComp.tanks[core] ?? 0;

  // 3. 将天地灵气打入自己的虚拟反应炉
  const { alive, logs } = Reactor.processIncomingBeam(
    simTank,
    simAmbient,
    incomingBucket,
    UNIVERSE.ecology.ambientDensity,
    cultComp.realm,
    reactorTemplate.ownPolarity,
    reactorTemplate.oppositePolarity,
  );

  // 4. 超载判定 (Tank Overflow Dump)
  const coreMax = tankComp.maxTanks[core] ?? 0;
  const currentQi = simTank[core] ?? 0;
  let overflow = 0;
  if (currentQi > coreMax) {
    overflow = currentQi - coreMax;
    ParticleTransfer.transferWithConversion(
      simTank,
      simAmbient,
      { [core]: overflow },
      ParticleTransfer.createBucket(reactorTemplate.oppositePolarity, overflow),
    );
  }

  const finalQi = simTank[core] ?? 0;
  const actualNetGained = finalQi - startQi;

  // We only sync tank and ambient if there was any mutation or if the entity is actually interacting
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
    // Note: status here dictates whether action sequence "succeeds"
    // Usually death is a catastrophic failure, but the Action has been successfully *processed*.
    // However, the node failed its real purpose.
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
        message: Formatters.absorbSuccess(entity, exactExtracted, actualNetGained, overflow),
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
