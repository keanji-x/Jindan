import type { ReactorTemplate } from "../config/types.js";
import { CHAT, COURT, DEVOUR, MATE, TRAVEL, TREAT } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, MOONLIGHT, REST, SPAWN_OFFSPRING } from "../systems/SingleEntitySystem.js";

/** 妖兽 — 以煞气 (QS) 为核心的野兽 */
export const BeastReactor: ReactorTemplate = {
  id: "beast",
  name: "妖兽",
  coreParticle: "qs",
  proportionLimit: (realm) => 0.04 * realm,
  birthCost: 30,
  absorbSource: "dao",
  baseDrainRate: 3,
  ownPolarity: { qs: 1.0, ql: 0.0 },
  actions: [
    { ...MOONLIGHT, absorbRate: { base: 6, perRealm: 2 } },
    DEVOUR,
    BREAKTHROUGH,
    REST,
    CHAT,
    COURT,
    MATE,
    SPAWN_OFFSPRING,
    TREAT,
    TRAVEL,
  ],
  ambientCapContribution: 150,
  npcNames: ["噬煞蝇", "变异黑蝇", "巨型噬煞蝇", "群居幼蝇", "煞气巡回蝇"],
  npcBrainId: "heuristic_optimizer",
};
