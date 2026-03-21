import { HumanReactor } from "../beings/human.js";
import type { SpeciesGenerator } from "../config/types.js";

export const HumanGenerator: SpeciesGenerator = {
  id: "human",
  baseName: "人族",
  canDerive: (ambient, _total) => {
    // 人类主要靠繁衍，但在高生态局也可以自然涌现（被灵气吸引）
    return (ambient.ql ?? 0) > 100;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    // 如果在极度混乱煞气环境中诞生，可能会派生出“魔修”体质
    if (qs > ql * 2 && qs > 80) {
      return {
        ...HumanReactor,
        id: "human_qs_cultivator",
        name: "魔道修士",
        coreParticle: "qs",
        baseTanks: (realm) => ({ qs: 200 * realm, ql: 0 }),
        ownPolarity: { qs: 1.0, ql: 0.0 },
        oppositePolarity: { qs: 0.0, ql: 1.0 },
        actions: ["moonlight", "devour", "breakthrough", "rest"], // 靠吸取月华和吞噬修炼
        npcNames: ["落魄道人", "嗜血狂修", "神秘魔影"], // 允许地府自动化生 NPCs
      };
    }

    return HumanReactor;
  },
};
