import type { ReactorTemplate } from "../config/types.js";
import { REST } from "../systems/SingleEntitySystem.js";

/** 法宝 — 蕴藏庞大能量的静默实体 */
export const ArtifactReactor: ReactorTemplate = {
  id: "artifact",
  name: "法宝",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.1 * realm,
  birthCost: 100,
  absorbSource: "dao",
  baseDrainRate: 0.1,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [REST],
  ambientCapContribution: 500,
};
