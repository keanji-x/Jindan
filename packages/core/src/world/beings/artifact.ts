import type { ReactorTemplate } from "../config/types.js";

/** 法宝 — 蕴藏庞大能量的静默实体 */
export const ArtifactReactor: ReactorTemplate = {
  id: "artifact",
  name: "法宝",
  coreParticle: "ql", // 默认以灵气为核心，后续可以再细分煞气法宝
  baseTanks: (realm) => ({ ql: 500 * realm, qs: 0 }),
  baseDrainRate: 0.1, // 法宝流失极慢
  ownPolarity: { ql: 1.0, qs: 0.0 },
  oppositePolarity: { ql: 0.0, qs: 1.0 },
  actions: ["rest"], // 只能蕴借或被炼化，作为测试先使用 rest
  ambientCapContribution: 500, // 庞大的能量载体
};
