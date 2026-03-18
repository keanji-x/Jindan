// ============================================================
// AbsorbSystem — 吸收灵气 (打坐 / 月华 / 光合)
// ============================================================

import type { EventBus } from "../EventBus.js";
import { ActionRegistry } from "../entity/actions/index.js";
import type { Entity } from "../entity/types.js";
import type { ActionHandler } from "../entity/actions/types.js";
import { ABSORB_CONFIG } from "./config.js";
import type { AmbientQi } from "./types.js";

export interface AbsorbResult {
  success: boolean;
  absorbed: number;
  expGained: number;
  actionCost: number;
  reason?: string;
}

export const doAbsorb: ActionHandler = (entity, actionId, context) => {
  const { actionCost, ambientQi, tick, events } = context;
  const action = actionId as "meditate" | "moonlight" | "photosynth";
  const qiComp = entity.components.qi;
  const cultComp = entity.components.cultivation;
  if (!qiComp || !cultComp) {
    return { success: false, reason: "实体缺少组件(Qi或Cultivation)", absorbed: 0, flux: 0, actionCost: 0 };
  }

  // Action 灵气消耗 → 回归天地
  if (qiComp.current <= actionCost) {
    return {
      success: false,
      absorbed: 0,
      actionCost: 0,
      flux: 0,
      reason: "灵气不足以执行此行动",
    };
  }
  qiComp.current -= actionCost;
  ambientQi.current += actionCost; // 守恒

  // 从天地吸收灵气
  const cfg = ABSORB_CONFIG[action];
  const maxAbsorb = cfg.base + cfg.perRealm * cultComp.realm;
  const canAbsorb = qiComp.max - qiComp.current;
  const available = ambientQi.current;
  const absorbed = Math.min(maxAbsorb, canAbsorb, available);

  ambientQi.current -= absorbed;
  qiComp.current += absorbed;

  const flux = actionCost + absorbed;

  events.emit({
    tick,
    type: "entity_absorbed",
    data: {
      id: entity.id,
      name: entity.name,
      species: entity.species,
      action,
      absorbed,
      qi: qiComp.current,
      maxQi: qiComp.max,
    },
    message: `「${entity.name}」${ActionRegistry.name(action)}，吸纳天地灵蕴 ${absorbed}，当前灵气饱满度 ${Math.floor((qiComp.current / qiComp.max) * 100)}%`,
  });

  return { success: true, absorbed, actionCost, flux };
}
