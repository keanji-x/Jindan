// ============================================================
// BreakthroughSystem — 境界突破 (相变)
//
// v3: Uses ReactorTemplate for realm-based recalculation.
// ============================================================

import { UNIVERSE } from "../engine/index.js";
import type { ActionHandler } from "../entity/actions/types.js";

export const doBreakthrough: ActionHandler = (entity, _actionId, context) => {
  const { actionCost, ambientPool, tick, events } = context;
  const tankComp = entity.components.tank;
  const cultComp = entity.components.cultivation;
  const combatComp = entity.components.combat;

  if (!tankComp || !cultComp || !combatComp) {
    return { success: false, reason: "实体缺少必要组件(Tank, Cultivation, Combat)" };
  }

  if (cultComp.realm >= 10) {
    return { success: false, reason: "已是最高境界" };
  }

  const core = tankComp.coreParticle;
  const coreCurrent = tankComp.tanks[core] ?? 0;
  const coreMax = tankComp.maxTanks[core] ?? 1;

  if (coreCurrent / coreMax < 0.9) {
    return { success: false, reason: "灵气未臻圆满(需90%容量)" };
  }

  const bt = UNIVERSE.breakthrough;
  const extraCost = bt.qiCostPerRealm * cultComp.realm;
  const totalCost = actionCost + extraCost;

  if (coreCurrent <= totalCost) {
    return { success: false, reason: "灵气不足以尝试突破" };
  }

  // Consume core particles → ambient (conservation)
  tankComp.tanks[core] = coreCurrent - totalCost;
  ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + totalCost;

  // Success rate
  const qiRatio = (tankComp.tanks[core] ?? 0) / coreMax;
  const successRate = Math.min(bt.baseSuccessRate + qiRatio * 0.3, bt.maxSuccessRate);

  if (Math.random() > successRate) {
    const qiLoss = Math.floor((tankComp.tanks[core] ?? 0) * bt.failLossRatio);
    tankComp.tanks[core] = Math.max(0, (tankComp.tanks[core] ?? 0) - qiLoss);
    ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + qiLoss;
    return { success: false, reason: "突破失败，真气逆流", flux: totalCost + qiLoss };
  }

  // Success: phase transition (相变)
  cultComp.realm += 1;

  const reactor = UNIVERSE.reactors[entity.species]!;
  const newMaxTanks = reactor.baseTanks(cultComp.realm);
  for (const [pid, max] of Object.entries(newMaxTanks)) {
    tankComp.maxTanks[pid] = max;
  }
  combatComp.power =
    reactor.basePower(cultComp.realm) + Math.floor(Math.random() * cultComp.realm * 2);

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
};
