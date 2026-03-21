import type { ReactorTemplate } from "../config/types.js";
import { ACQUIRE, CHAT, DEVOUR, RECRUIT } from "../systems/InteractionSystem.js";
import { MEDITATE, REST } from "../systems/SingleEntitySystem.js";

/** 宗门 — 巨大的灵气汇聚之地，视作巨型的社会实体 */
export const SectReactor: ReactorTemplate = {
  id: "sect",
  name: "宗门",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.2 * realm,
  birthCost: 200,
  absorbSource: "members",
  baseDrainRate: 10,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [MEDITATE, DEVOUR, REST, CHAT, ACQUIRE, RECRUIT],
  ambientCapContribution: 5000,
};
