import { UNIVERSE } from "../config/universe.config.js";
import type { Entity } from "../types.js";
import type { GameSystem } from "./GameSystem.js";
import { doAbsorb } from "./handlers/absorb.js";
import { doBreakthrough } from "./handlers/breakthrough.js";
import { doRest } from "./handlers/rest.js";
import type { ActionResolver } from "./types.js";

const singleEntityResolver: ActionResolver = (entity, actionId, context) => {
  switch (actionId) {
    case "meditate":
    case "moonlight":
    case "photosynth":
      return doAbsorb(entity, actionId, context);
    case "rest":
      return doRest(entity, actionId, context);
    case "breakthrough":
      return doBreakthrough(entity, actionId, context);
    default:
      return { status: "aborted", reason: `Unknown action: ${actionId}` };
  }
};

export const SingleEntitySystem: GameSystem = {
  id: "single_entity",
  name: "单体状态机制",
  actions: [
    {
      id: "meditate",
      name: "打坐",
      description: "吐纳天地灵气，缓缓吸收灵气到体内",
      qiCost: 3,
      needsTarget: false,
    },
    {
      id: "moonlight",
      name: "吸纳月华",
      description: "吞吸天地精华，快速吸收大量灵气",
      qiCost: 8,
      needsTarget: false,
    },
    {
      id: "photosynth",
      name: "光合吐纳",
      description: "扎根大地，缓缓吸收天地灵气",
      qiCost: 1,
      needsTarget: false,
    },
    {
      id: "rest",
      name: "休息",
      description: "无所事事 (仍会被动流失灵气)",
      qiCost: 0,
      needsTarget: false,
    },
    {
      id: "breakthrough",
      name: "突破",
      description: "冲击更高境界，消耗大量灵气",
      qiCost: 30,
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
  handler: singleEntityResolver,
};
