import { HumanReactor } from "../beings/human.js";
import type { SpeciesGenerator } from "../config/types.js";
import { DEVOUR } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, MOONLIGHT, REST } from "../systems/SingleEntitySystem.js";

export const HumanGenerator: SpeciesGenerator = {
  id: "human",
  baseName: "人族",
  canDerive: (ambient, _total) => {
    return (ambient.ql ?? 0) > 100;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    // 如果在极度混乱煞气环境中诞生，可能会派生出"魔修"体质
    if (qs > ql * 2 && qs > 80) {
      return {
        ...HumanReactor,
        id: "human_qs_cultivator",
        name: "魔道修士",
        coreParticle: "qs",
        proportionLimit: (realm: number) => 0.05 * realm,
        birthCost: 50,
        ownPolarity: { qs: 1.0, ql: 0.0 },
        actions: [
          { ...MOONLIGHT, absorbRate: { base: 10, perRealm: 5 } },
          DEVOUR,
          BREAKTHROUGH,
          REST,
        ],
        npcNames: ["落魄道人", "嗜血狂修", "神秘魔影"],
      };
    }

    return HumanReactor;
  },
};
