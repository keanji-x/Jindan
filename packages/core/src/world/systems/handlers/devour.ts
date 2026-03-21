// ============================================================
// DevourSystem — handler (物理逻辑)
//
// 吞噬: PvE / PvP
// Uses ParticleTransfer and Reactor.processIncomingBeam
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Effect } from "../../effects/types.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import { Reactor } from "../../reactor/Reactor.js";
import type { ParticleBucket } from "../../reactor/types.js";
import type { ActionResolver } from "../types.js";

export const doDevour: ActionResolver = (entity, _actionId, context) => {
  const { ambientPool, tick, target } = context;
  if (!target) return { status: "aborted", reason: "必须指定要吞噬的目标" };
  if (target.status !== "alive") return { status: "aborted", reason: "目标不存在或已消亡" };

  const attackerTank = entity.components.tank;
  const attackerCult = entity.components.cultivation;
  const targetTank = target.components.tank;
  const targetCult = target.components.cultivation;

  if (!attackerTank || !attackerCult || !targetTank || !targetCult) {
    return { status: "aborted", reason: "实体缺失必要组件(Tank, Cultivation)" };
  }

  const effects: Effect[] = [];

  // ==========================================
  // Pure Simulation Phase (sandbox state)
  // ==========================================
  const simAttackerTank = { ...attackerTank.tanks };
  const simTargetTank = { ...targetTank.tanks };
  const simAmbient = { ...ambientPool.pools };

  // 1. 剥夺目标的所有粒子进入游离态 (Rip from target)
  const incomingBucket: ParticleBucket = {};
  for (const [pid, amt] of Object.entries(simTargetTank)) {
    if ((amt as number) > 0) {
      ParticleTransfer.transfer(simTargetTank, incomingBucket, { [pid]: amt as number });
    }
  }

  // 2. 目标被完全抽干，宣告寂灭
  effects.push({
    type: "set_status",
    entityId: target.id,
    status: "lingering",
  });

  effects.push({
    type: "emit_event",
    event: {
      tick,
      type: "entity_died",
      data: { id: target.id, species: target.species, name: target.name },
      message: Formatters.devourTargetDeath(entity),
    },
  });

  // 3. 将剥夺的游离粒子强行打入攻击者的反应炉
  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { status: "aborted", reason: "无反应炉配置" };

  const { alive, logs } = Reactor.processIncomingBeam(
    simAttackerTank,
    simAmbient,
    incomingBucket,
    targetCult.realm,
    attackerCult.realm,
    reactorTemplate.ownPolarity,
  );

  // Sync state back to the world declaratively
  effects.push({ type: "sync_tank", entityId: target.id, tanks: simTargetTank });
  effects.push({ type: "sync_tank", entityId: entity.id, tanks: simAttackerTank });
  effects.push({ type: "sync_ambient", pools: simAmbient });

  // 4. 吞噬降低双方关系
  effects.push({
    type: "adjust_relation",
    a: entity.id,
    b: target.id,
    delta: -30,
  });

  // 5. 结算吞噬者存活情况
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
        message: Formatters.devourBacklash(target, logs),
      },
    });

    return {
      status: "failure",
      reason: "吞噬反噬陨落",
      failureEffects: effects,
    };
  } else {
    // 事件上报
    effects.push({
      type: "emit_event",
      event: {
        tick,
        type: "entity_devoured",
        data: {
          loser: { id: target.id, species: target.species, name: target.name },
          winner: { id: entity.id, species: entity.species, name: entity.name, survived: alive },
        },
        message: Formatters.devourSuccess(entity, target, logs),
      },
    });

    const core = attackerTank.coreParticle;
    return {
      status: "success",
      successEffects: effects,
      newQi: simAttackerTank[core],
    };
  }
};
