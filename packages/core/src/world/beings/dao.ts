import type { ReactorTemplate } from "../config/types.js";

/**
 * 天道 — 宇宙的核心实体，万物之源
 *
 * 天道的 tank 由 QiPoolManager 支撑（ambient pool）。
 * 天道吸收所有非Dao实体的超标粒子（天罚），
 * 当自身占比过高时向众生释放粒子（天恩）。
 * 全服唯一（maxInstances: 1）。
 */
export const DaoReactor: ReactorTemplate = {
  id: "dao",
  name: "天道",
  coreParticle: "ql",
  proportionLimit: (_realm) => 1.0, // 天道无上限
  birthCost: 0, // 天道不需要灌注，它本身就是万物之源
  absorbSource: "all",
  baseDrainRate: 0,
  ownPolarity: { ql: 0.5, qs: 0.5 }, // 天道阴阳平衡
  actions: [], // 天道没有主动 action，靠被动 tick 结算
  ambientCapContribution: 0,
  maxInstances: 1,
};
