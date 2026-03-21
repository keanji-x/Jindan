import { UNIVERSE } from "../config/universe.config.js";
import type { Entity } from "../types.js";
import type { GameSystem } from "./GameSystem.js";
import { doAbsorb } from "./handlers/absorb.js";
import { doBreakthrough } from "./handlers/breakthrough.js";
import { doFoundSect } from "./handlers/found_sect.js";
import { doRest } from "./handlers/rest.js";
import { doSpawnOffspring } from "./handlers/spawn_offspring.js";
import type { ActionDef, ActionResolver } from "./types.js";

// ── Shared base action constants ─────────────────────────────
// Beings spread these and may add species-specific params (e.g. absorbRate)

export const MEDITATE: ActionDef = {
  id: "meditate",
  name: "打坐",
  description: "吐纳天地灵气，缓缓吸收灵气到体内",
  qiCost: 3,
  needsTarget: false,
};

export const MOONLIGHT: ActionDef = {
  id: "moonlight",
  name: "吸纳月华",
  description: "吞吸天地精华，快速吸收大量灵气",
  qiCost: 8,
  needsTarget: false,
};

export const PHOTOSYNTH: ActionDef = {
  id: "photosynth",
  name: "光合吐纳",
  description: "扎根大地，缓缓吸收天地灵气",
  qiCost: 1,
  needsTarget: false,
};

export const REST: ActionDef = {
  id: "rest",
  name: "休息",
  description: "无所事事 (仍会被动流失灵气)",
  qiCost: 0,
  needsTarget: false,
};

export const BREAKTHROUGH: ActionDef = {
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
    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) return undefined;
    const qi = tankComp.tanks[core] ?? 0;
    const limit = reactor.proportionLimit(cultComp.realm);
    const proportion = UNIVERSE.totalParticles > 0 ? qi / UNIVERSE.totalParticles : 0;
    const maxRealm = UNIVERSE.breakthrough.maxRealm ?? 10;
    if (cultComp.realm >= maxRealm) return "已是最高境界";
    return `${Math.floor((proportion / (limit || 0.01)) * 100)}%`;
  },
  canExecute: (entity) => {
    const cultComp = entity.components.cultivation;
    if (!cultComp) return { ok: false, reason: "没有修为系统" };
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const bt = UNIVERSE.breakthrough;
    const core = tankComp.coreParticle;
    const qi = tankComp.tanks[core] ?? 0;
    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) return { ok: false, reason: "无反应炉配置" };
    const limit = reactor.proportionLimit(cultComp.realm);
    const proportion = UNIVERSE.totalParticles > 0 ? qi / UNIVERSE.totalParticles : 0;
    if (proportion < limit * bt.minQiRatio) return { ok: false, reason: "灵气占比未臻圆满" };
    const maxRealm = bt.maxRealm ?? 10;
    if (cultComp.realm >= maxRealm) return { ok: false, reason: "已是最高境界" };
    return { ok: true };
  },
};

export const SPAWN_OFFSPRING: ActionDef = {
  id: "spawn_offspring",
  name: "分裂繁衍",
  description: "消耗自身灵气，分裂产生同种子实体",
  qiCost: 20,
  needsTarget: false,
  canExecute: (entity) => {
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) return { ok: false, reason: "无反应炉配置" };
    const core = tankComp.coreParticle;
    const qi = tankComp.tanks[core] ?? 0;
    if (qi < reactor.birthCost + 20) return { ok: false, reason: "灵气不足以分裂繁衍" };
    return { ok: true };
  },
};

export const FOUND_SECT: ActionDef = {
  id: "found_sect",
  name: "开山立派",
  description: "消耗大量灵气创建宗门",
  qiCost: 30,
  needsTarget: false,
  canExecute: (entity) => {
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const cultComp = entity.components.cultivation;
    if (!cultComp) return { ok: false, reason: "无修为系统" };
    if (cultComp.realm < 3) return { ok: false, reason: "境界不足，需至少3重" };
    const sectReactor = UNIVERSE.reactors.sect;
    if (!sectReactor) return { ok: false, reason: "宗门配置不存在" };
    const core = tankComp.coreParticle;
    const qi = tankComp.tanks[core] ?? 0;
    if (qi < sectReactor.birthCost + 30) return { ok: false, reason: "灵气不足以建宗" };
    return { ok: true };
  },
};

// ── Resolver ─────────────────────────────────────────────────

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
    case "spawn_offspring":
      return doSpawnOffspring(entity, actionId, context);
    case "found_sect":
      return doFoundSect(entity, actionId, context);
    default:
      return { status: "aborted", reason: `Unknown action: ${actionId}` };
  }
};

export const SingleEntitySystem: GameSystem = {
  id: "single_entity",
  name: "单体状态机制",
  actions: [MEDITATE, MOONLIGHT, PHOTOSYNTH, REST, BREAKTHROUGH, SPAWN_OFFSPRING, FOUND_SECT],
  handler: singleEntityResolver,
};
