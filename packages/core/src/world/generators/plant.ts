import { PlantReactor } from "../beings/plant.js";
import type { SpeciesGenerator } from "../config/types.js";
import { DEVOUR } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, PHOTOSYNTH, REST } from "../systems/SingleEntitySystem.js";

export const PlantGenerator: SpeciesGenerator = {
  id: "plant",
  baseName: "灵草",
  canDerive: (ambient, _total) => {
    return (ambient.ql ?? 0) > 5 || (ambient.qs ?? 0) > 5;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    if (qs > ql * 1.5 && qs > 50) {
      return {
        ...PlantReactor,
        id: "plant_qs_mutated",
        name: "煞魔藤",
        coreParticle: "qs",
        proportionLimit: (realm: number) => 0.04 * realm,
        birthCost: 30,
        ownPolarity: { qs: 1.0, ql: 0.0 },
        actions: [
          { ...PHOTOSYNTH, absorbRate: { base: 6, perRealm: 2 } },
          DEVOUR,
          BREAKTHROUGH,
          REST,
        ],
        npcNames: ["嗜血藤", "枯骨草", "煞毒花"],
      };
    }

    return PlantReactor;
  },
};
