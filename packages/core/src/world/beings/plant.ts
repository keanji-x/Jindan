import type { ReactorTemplate } from "../config/types.js";
import {
  PHOTOSYNTH,
  BREAKTHROUGH,
  REST,
  SPAWN_OFFSPRING,
} from "../systems/SingleEntitySystem.js";
import { CHAT, COURT, MATE, TREAT, TRAVEL } from "../systems/InteractionSystem.js";

export const PlantReactor: ReactorTemplate = {
  id: "plant",
  name: "灵植",
  coreParticle: "ql",
  proportionLimit: (realm) => 0.04 * realm,
  birthCost: 100,
  absorbSource: "dao",
  baseDrainRate: 8,
  ownPolarity: { ql: 1.0, qs: 0.0 },
  actions: [
    { ...PHOTOSYNTH, absorbRate: { base: 45, perRealm: 15 } },
    BREAKTHROUGH,
    REST,
    CHAT,
    COURT,
    MATE,
    SPAWN_OFFSPRING,
    TREAT,
    TRAVEL,
  ],
  npcNames: ["万年灵芝", "血藤", "幽冥花", "碧玉竹", "九转莲"],
  npcBrainId: "heuristic_optimizer",
};
