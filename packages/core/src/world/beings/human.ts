import type { ReactorTemplate } from "../config/types.js";

/** 修士 — 以灵气 (QL) 为核心的修行者 */
export const HumanReactor: ReactorTemplate = {
  id: "human",
  name: "修士",
  coreParticle: "ql",
  baseTanks: (realm) => ({ ql: 200 * realm, qs: 0 }),
  baseDrainRate: 1,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  oppositePolarity: { ql: 0.0, qs: 1.0 },
  actions: ["meditate", "devour", "breakthrough", "rest"],
  ambientCapContribution: 200,
};
