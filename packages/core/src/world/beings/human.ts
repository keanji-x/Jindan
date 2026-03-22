import type { ReactorTemplate } from "../config/types.js";
import {
  MEDITATE,
  BREAKTHROUGH,
  REST,
  FOUND_SECT,
  SPAWN_OFFSPRING,
} from "../systems/SingleEntitySystem.js";
import {
  DEVOUR,
  CHAT,
  COURT,
  ACQUIRE,
  ENSLAVE,
  MATE,
  RECRUIT,
  TREAT,
  TRAVEL,
} from "../systems/InteractionSystem.js";

export const HumanReactor: ReactorTemplate = {
  id: "human",
  name: "修士",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.05 * realm,
  birthCost: 200,
  absorbSource: "dao",
  baseDrainRate: 8,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [
    { ...MEDITATE, absorbRate: { base: 40, perRealm: 15 } },
    DEVOUR,
    BREAKTHROUGH,
    REST,
    CHAT,
    COURT,
    ACQUIRE,
    ENSLAVE,
    MATE,
    RECRUIT,
    SPAWN_OFFSPRING,
    FOUND_SECT,
    TREAT,
    TRAVEL,
  ],
  npcNames: ["散修", "游侠", "剑客", "道士", "术师"],
  npcBrainId: "heuristic_optimizer",
  brainDepth: 6,
};
