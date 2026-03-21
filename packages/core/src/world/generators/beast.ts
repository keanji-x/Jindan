import { BeastReactor } from "../beings/beast.js";
import type { SpeciesGenerator } from "../config/types.js";
import { DEVOUR } from "../systems/InteractionSystem.js";
import { BREAKTHROUGH, MEDITATE, REST } from "../systems/SingleEntitySystem.js";

export const BeastGenerator: SpeciesGenerator = {
  id: "beast",
  baseName: "妖兽",
  canDerive: (ambient, _total) => {
    return (ambient.qs ?? 0) > 20 || (ambient.ql ?? 0) > 200;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    // 如果灵气极度纯净而煞气极低，妖兽会被"净化"派生出灵兽（瑞兽）
    if (ql > qs * 3 && ql > 100) {
      return {
        ...BeastReactor,
        id: "beast_ql_purified",
        name: "瑞兽",
        coreParticle: "ql",
        proportionLimit: (realm: number) => 0.04 * realm,
        birthCost: 30,
        ownPolarity: { ql: 1.0, qs: 0.0 },
        actions: [
          { ...MEDITATE, absorbRate: { base: 6, perRealm: 2 } },
          DEVOUR,
          BREAKTHROUGH,
          REST,
        ],
        npcNames: ["青玉鹿", "白云鹤", "寻灵鼠"],
      };
    }

    return BeastReactor;
  },
};
