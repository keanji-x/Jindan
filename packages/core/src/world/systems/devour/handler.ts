// ============================================================
// DevourSystem — handler (物理逻辑)
//
// 吞噬: PvE / PvP
// Uses ParticleTransfer and Reactor.processIncomingBeam
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import { Reactor } from "../../reactor/Reactor.js";
import type { ParticleBucket } from "../../reactor/types.js";
import type { ActionHandler } from "../types.js";

export const doDevour: ActionHandler = (entity, _actionId, context) => {
  const { ambientPool, tick, events, target } = context;
  if (!target) return { success: false, reason: "必须指定要吞噬的目标" };
  if (target.status !== "alive") return { success: false, reason: "目标不存在或已消亡" };

  const attackerTank = entity.components.tank;
  const attackerCult = entity.components.cultivation;
  const targetTank = target.components.tank;
  const targetCult = target.components.cultivation;

  if (!attackerTank || !attackerCult || !targetTank || !targetCult) {
    return { success: false, reason: "实体缺失必要组件(Tank, Cultivation)" };
  }

  // 1. 发动代价已经在 World 中被统扣了
  const core = attackerTank.coreParticle;

  // 2. 剥夺目标的所有粒子进入游离态 (Rip from target)
  const incomingBucket: ParticleBucket = {};
  for (const [pid, amt] of Object.entries(targetTank.tanks)) {
    if ((amt as number) > 0) {
      ParticleTransfer.transfer(targetTank.tanks, incomingBucket, { [pid]: amt as number });
    }
  }

  // 3. 目标被完全抽干，宣告寂灭
  events.emit({
    tick,
    type: "entity_died",
    data: { id: target.id, species: target.species, name: target.name },
    message: Formatters.devourTargetDeath(entity),
  });

  // 4. 将剥夺的游离粒子强行打入攻击者的反应炉
  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { success: false, reason: "无反应炉配置" };

  const { alive, logs } = Reactor.processIncomingBeam(
    attackerTank.tanks,
    ambientPool.pools,
    incomingBucket,
    targetCult.realm,
    attackerCult.realm,
    reactorTemplate.ownPolarity,
    reactorTemplate.oppositePolarity,
  );

  // 5. 结算吞噬者存活情况
  if (!alive) {
    events.emit({
      tick,
      type: "entity_died",
      data: { id: entity.id, species: entity.species, name: entity.name },
      message: Formatters.devourBacklash(target, logs),
    });
  }

  // 事件上报
  events.emit({
    tick,
    type: "entity_devoured",
    data: {
      loser: { id: target.id, species: target.species, name: target.name },
      winner: { id: entity.id, species: entity.species, name: entity.name, survived: alive },
    },
    message: Formatters.devourSuccess(entity, target, logs),
  });

  return { success: true, newQi: attackerTank.tanks[core] };
};
