import type { ReactorTemplate } from "../config/types.js";

/** 灵植 — 以灵气 (QL) 为核心的植物 */
export const PlantReactor: ReactorTemplate = {
  id: "plant",
  name: "灵植",
  coreParticle: "ql",
  baseTanks: (realm) => ({ ql: 150 * realm, qs: 0 }),
  baseDrainRate: 1,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  oppositePolarity: { ql: 0.0, qs: 1.0 },
  actions: ["photosynth", "breakthrough", "rest"],
  ambientCapContribution: 100,
  npcNames: ["碧灵草", "矮壮碧灵草", "幽光碧灵草", "簇生碧草", "变异碧草"],
  npcBrainId: "weed_brain",
};
