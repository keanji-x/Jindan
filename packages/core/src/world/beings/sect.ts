import type { ReactorTemplate } from "../config/types.js";

/** 宗门 — 巨大的灵气汇聚之地，视作巨型的社会实体 */
export const SectReactor: ReactorTemplate = {
  id: "sect",
  name: "宗门",
  coreParticle: "ql",
  baseTanks: (realm) => ({ ql: 10000 * realm, qs: 0 }),
  baseDrainRate: 10, // 宗门有日常消耗
  ownPolarity: { ql: 1.0, qs: 0.0 },
  oppositePolarity: { ql: 0.0, qs: 1.0 },
  actions: ["meditate", "devour", "rest", "chat"], // 能够吞吐天地灵气、甚至吞并其他宗门
  ambientCapContribution: 5000,
};
