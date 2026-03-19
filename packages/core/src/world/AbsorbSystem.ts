// ============================================================
// AbsorbSystem — 吸收灵气 (打坐 / 月华 / 光合)
//
// v3: Pulls core particles from ambient pool.
// ============================================================

import { UNIVERSE } from "../engine/index.js";
import { ActionRegistry } from "../entity/actions/index.js";
import type { ActionHandler } from "../entity/actions/types.js";

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
      flux: 0,
      actionCost: 0,
    };
  }

  const core = tankComp.coreParticle;

  // Action cost: core particle → ambient
  if ((tankComp.tanks[core] ?? 0) <= actionCost) {
    return {
      success: false,
      absorbed: 0,
      actionCost: 0,
      flux: 0,
      reason: "灵气不足以执行此行动",
    };
  }
  tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actionCost;
  ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + actionCost;

  // Pull core particles from ambient
  const cfg = UNIVERSE.absorb[action];
  if (!cfg) {
    return { success: false, reason: `未知吸收动作: ${action}`, absorbed: 0, flux: 0, actionCost };
  }
  const maxAbsorb = cfg.base + cfg.perRealm * cultComp.realm;
  const coreMax = tankComp.maxTanks[core] ?? 0;
  const canAbsorb = coreMax - (tankComp.tanks[core] ?? 0);
  const available = ambientPool.pools[core] ?? 0;
  const absorbed = Math.min(maxAbsorb, canAbsorb, available);

  ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) - absorbed;
  tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) + absorbed;

  const flux = actionCost + absorbed;

  const coreCurrent = tankComp.tanks[core] ?? 0;
  const coreMaxVal = tankComp.maxTanks[core] ?? 1;

  // Smart feedback: warn when ambient qi is scarce
  const ambientCap = UNIVERSE.ecology.baseAmbientCap || 200;
  if (available <= maxAbsorb * 0.3) {
    const density = Math.floor((available / ambientCap) * 100);
    events.emit({
      tick,
      type: "system_warning",
      data: { id: entity.id, particle: core, available, density },
      message: `⚠️ 天地${core === "ql" ? "灵" : "煞"}气稀薄（密度 ${density}%），「${entity.name}」仅吸收 ${absorbed}。建议等待灵植繁荣或吞噬补充。`,
    });
  }

  events.emit({
    tick,
    type: "entity_absorbed",
    data: {
      id: entity.id,
      name: entity.name,
      species: entity.species,
      action,
      absorbed,
      qi: coreCurrent,
      maxQi: coreMaxVal,
    },
    message: `「${entity.name}」${ActionRegistry.name(action)}，吸纳天地灵蕴 ${absorbed}，当前灵气饱满度 ${Math.floor((coreCurrent / coreMaxVal) * 100)}%`,
  });

  return { success: true, absorbed, actionCost, flux };
};
