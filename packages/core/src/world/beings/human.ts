import type { ReactorTemplate } from "../config/types.js";
import {
  ACQUIRE,
  CHAT,
  COURT,
  DEVOUR,
  ENSLAVE,
  MATE,
  RECRUIT,
  TRAVEL,
  TREAT,
} from "../systems/InteractionSystem.js";
import {
  BREAKTHROUGH,
  FOUND_SECT,
  MEDITATE,
  REST,
  SPAWN_OFFSPRING,
} from "../systems/SingleEntitySystem.js";

/** 修士 — 以灵气 (QL) 为核心的修行者 */
export const HumanReactor: ReactorTemplate = {
  id: "human",
  name: "修士",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.05 * realm,
  birthCost: 50,
  absorbSource: "dao",
  baseDrainRate: 1,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [
    { ...MEDITATE, absorbRate: { base: 10, perRealm: 5 } },
    DEVOUR,
    BREAKTHROUGH,
    REST,
    CHAT,
    COURT,
    MATE,
    ACQUIRE,
    ENSLAVE,
    SPAWN_OFFSPRING,
    FOUND_SECT,
    RECRUIT,
    TREAT,
    TRAVEL,
  ],
  ambientCapContribution: 200,
};
