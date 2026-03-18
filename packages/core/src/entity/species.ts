// ============================================================
// Species templates — defines racial traits
// ============================================================

import type { SpeciesTemplate } from "./types.js";

export const SPECIES: Record<string, SpeciesTemplate> = {
  human: {
    type: "human",
    name: "修士",
    baseQiDrain: 5,
    baseMaxQi: (realm) => 100 * realm,
    basePower: (realm) => 10 * realm,
    actions: ["meditate", "devour", "breakthrough", "rest"],
  },
  beast: {
    type: "beast",
    name: "妖兽",
    baseQiDrain: 10,
    baseMaxQi: (realm) => 80 * realm,
    basePower: (realm) => 12 * realm,
    actions: ["moonlight", "devour", "breakthrough", "rest"],
  },
  plant: {
    type: "plant",
    name: "灵植",
    baseQiDrain: 2,
    baseMaxQi: (realm) => 150 * realm,
    basePower: (realm) => 4 * realm,
    actions: ["photosynth", "rest"],
  },
};
