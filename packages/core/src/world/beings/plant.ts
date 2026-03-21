import type { ReactorTemplate } from "../config/types.js";
import { CHAT } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, PHOTOSYNTH, REST, SPAWN_OFFSPRING } from "../systems/SingleEntitySystem.js";

/** 灵植 — 以灵气 (QL) 为核心的植物 */
export const PlantReactor: ReactorTemplate = {
  id: "plant",
  name: "灵植",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.04 * realm,
  birthCost: 30,
  absorbSource: "dao",
  baseDrainRate: 1,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [
    { ...PHOTOSYNTH, absorbRate: { base: 6, perRealm: 2 } },
    BREAKTHROUGH,
    REST,
    CHAT,
    SPAWN_OFFSPRING,
  ],
  ambientCapContribution: 100,
  npcNames: ["碧灵草", "矮壮碧灵草", "幽光碧灵草", "簇生碧草", "变异碧草"],
  npcBrainId: "heuristic_optimizer",
};
