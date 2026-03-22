import type { ReactorTemplate } from "../config/types.js";
import { CHAT, COURT, DEVOUR, MATE, TRAVEL, TREAT } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, MOONLIGHT, REST, SPAWN_OFFSPRING } from "../systems/SingleEntitySystem.js";

export const BeastReactor: ReactorTemplate = {
  id: "beast",
  name: "妖兽",
  coreParticle: "qs",
  proportionLimit: (realm) => 0.04 * realm,
  birthCost: 120,
  absorbSource: "dao",
  baseDrainRate: 10,
  ownPolarity: { qs: 1.0, ql: 0.0 },
  actions: [
    { ...MOONLIGHT, absorbRate: { base: 50, perRealm: 20 } },
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
  npcNames: ["灵狐", "天蟒", "金翅大鹏", "青牛", "九尾猫"],
  npcBrainId: "heuristic_optimizer",
};
