// ============================================================
// BreakthroughSystem — 突破系统
//
// 1 System → 1 Action: breakthrough
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import type { Entity } from "../../types.js";
import type { GameSystem } from "../GameSystem.js";
import { doBreakthrough } from "./handler.js";

export const BreakthroughSystem: GameSystem = {
  id: "breakthrough",
  name: "突破",
  actions: [
    {
      id: "breakthrough",
      name: "突破",
      description: "冲击更高境界，消耗大量灵气",
      qiCost: 30,
      species: ["human", "beast", "plant"],
      needsTarget: false,
      showProgress: (entity: Entity) => {
        const tankComp = entity.components.tank;
        const cultComp = entity.components.cultivation;
        if (!tankComp || !cultComp) return undefined;
        const core = tankComp.coreParticle;
        const ratio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
        const maxRealm = UNIVERSE.breakthrough.maxRealm ?? 10;
        if (cultComp.realm >= maxRealm) return "已是最高境界";
        return `${Math.floor(ratio * 100)}%`;
      },
      canExecute: (entity) => {
        const cultComp = entity.components.cultivation;
        if (!cultComp) return { ok: false, reason: "没有修为系统" };
        const tankComp = entity.components.tank;
        if (!tankComp) return { ok: false, reason: "无粒子储罐" };
        const bt = UNIVERSE.breakthrough;
        const core = tankComp.coreParticle;
        const coreRatio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
        if (coreRatio < bt.minQiRatio) return { ok: false, reason: "灵气未臻圆满" };
        const maxRealm = bt.maxRealm ?? 10;
        if (cultComp.realm >= maxRealm) return { ok: false, reason: "已是最高境界" };
        return { ok: true };
      },
    },
  ],
  handler: doBreakthrough,
};
