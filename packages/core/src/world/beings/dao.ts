import type { ReactorTemplate } from "../config/types.js";

/**
 * 天道 — 宇宙的核心实体，万物之源
 *
 * 天道的 tank 存储全部宇宙粒子（替代旧 QiPoolManager）。
 * 实体通过 absorb 从天道 tank 吸取粒子，通过 drain 归还粒子。
 * 极端占比由 DaoEventSystem 天劫处理。
 * 全服唯一（maxInstances: 1）。
 */
export const DaoReactor: ReactorTemplate = {
  id: "dao",
  name: "天道",
  coreParticle: "ql",
  proportionLimit: (_realm) => 1.0, // 天道无上限
  birthCost: 0, // 天道不需要灌注，它本身就是万物之源
  absorbSource: "all",
  baseDrainRate: 0, // 天道不 drain（它是终极 sink，不消耗自己）
  ownPolarity: { ql: 0.5, qs: 0.5 }, // 天道阴阳平衡
  actions: [], // 天道没有主动 action，靠被动 tick 结算
  maxInstances: 1,
};
