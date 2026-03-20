// ============================================================
// AbsorbSystem — handler (物理逻辑)
//
// 吸收灵气: 打坐 / 月华 / 光合
// Uses ParticleTransfer and Reactor.processIncomingBeam.
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { Formatters } from "../../formatters.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import { Reactor } from "../../reactor/Reactor.js";
import type { ParticleBucket } from "../../reactor/types.js";
import type { ActionHandler } from "../types.js";

export const doAbsorb: ActionHandler = (entity, actionId, context) => {
  const { actionCost, ambientPool, tick, events } = context;
  const action = actionId as "meditate" | "moonlight" | "photosynth";
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;

  if (!tankComp || !cultComp) {
    return {
      success: false,
      reason: "实体缺少组件(Tank或Cultivation)",
      absorbed: 0,
      actionCost: 0,
    };
  }

  const core = tankComp.coreParticle;

  // 1. 发动代价已经在 World 中被统扣了

  // 2. 算定吸纳的总游离量 (从环境抽取1阶游离大补)
  const cfg = UNIVERSE.absorb[action];
  if (!cfg) {
    return { success: false, reason: `未知吸收动作: ${action}`, absorbed: 0, actionCost };
  }
  // 神念越强，单次能"搂"入体内的环境总量确实也会随境界提升而略微变大
  const pullAmount = cfg.base + cfg.perRealm * cultComp.realm;
  const available = ambientPool.pools[core] ?? 0;

  // 抽出物质装入 IncomingBeam 虚拟容器
  const exactExtracted = Math.floor(Math.min(pullAmount, available));

  if (available < pullAmount / 2) {
    events.emit({
      tick,
      type: "system_warning",
      data: { entityId: entity.id, action },
      message: `天地灵气稀薄，「${entity.name}」修行受阻。`,
    });
  }

  const incomingBucket: ParticleBucket = {};
  if (exactExtracted > 0) {
    ParticleTransfer.transfer(ambientPool.pools, incomingBucket, { [core]: exactExtracted });
  }

  const reactorTemplate = UNIVERSE.reactors[entity.species];
  if (!reactorTemplate) return { success: false, reason: "无反应炉配置", absorbed: 0, actionCost };

  const startQi = tankComp.tanks[core] ?? 0;

  // 3. 将天地灵气（永远是倍率 = 1）打入自己的反应炉
  const { alive, logs } = Reactor.processIncomingBeam(
    tankComp.tanks,
    ambientPool.pools,
    incomingBucket,
    UNIVERSE.ecology.ambientDensity,
    cultComp.realm,
    reactorTemplate.ownPolarity,
    reactorTemplate.oppositePolarity,
  );

  // 4. 超载判定 (Tank Overflow Dump)
  const coreMax = tankComp.maxTanks[core] ?? 0;
  const currentQi = tankComp.tanks[core] ?? 0;
  let overflow = 0;
  if (currentQi > coreMax) {
    overflow = currentQi - coreMax;
    ParticleTransfer.transferWithConversion(
      tankComp.tanks,
      ambientPool.pools,
      { [core]: overflow },
      ParticleTransfer.createBucket(reactorTemplate.oppositePolarity, overflow),
    );
  }

  const finalQi = tankComp.tanks[core] ?? 0;
  const actualNetGained = finalQi - startQi;

  if (!alive) {
    events.emit({
      tick,
      type: "entity_died",
      data: { id: entity.id, species: entity.species, name: entity.name },
      message: Formatters.absorbBacklash(logs),
    });
  } else {
    events.emit({
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
    });
  }

  return { success: true, absorbed: actualNetGained, actionCost };
};
