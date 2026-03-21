import type { ReactorTemplate } from "../config/types.js";

/** 妖兽 — 以煞气 (QS) 为核心的野兽 */
export const BeastReactor: ReactorTemplate = {
  id: "beast",
  name: "妖兽",
  coreParticle: "qs",
  baseTanks: (realm) => ({ qs: 80 * realm, ql: 0 }),
  baseDrainRate: 3,
  ownPolarity: { qs: 1.0, ql: 0.0 },
  oppositePolarity: { qs: 0.0, ql: 1.0 },
  actions: ["moonlight", "devour", "breakthrough", "rest", "chat"],
  ambientCapContribution: 150,
  npcNames: ["噬煞蝇", "变异黑蝇", "巨型噬煞蝇", "群居幼蝇", "煞气巡回蝇"],
  npcBrainId: "heuristic_optimizer",
};
