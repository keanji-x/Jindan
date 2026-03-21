import { SectReactor } from "../beings/sect.js";
import type { SpeciesGenerator } from "../config/types.js";

export const SectGenerator: SpeciesGenerator = {
  id: "sect",
  baseName: "宗门",
  canDerive: (ambient, _total) => {
    // 灵气相对充沛的世界才有可能自发诞生宗门
    return (ambient.ql ?? 0) > 1000;
  },
  derive: (ambient, _total) => {
    const qs = ambient.qs ?? 0;
    const ql = ambient.ql ?? 0;

    // 煞气过重时衍生出魔宗
    if (qs > ql && qs > 500) {
      return {
        ...SectReactor,
        id: "sect_qs",
        name: "魔道邪宗",
        coreParticle: "qs",
        ownPolarity: { qs: 1.0, ql: 0.0 },
        oppositePolarity: { qs: 0.0, ql: 1.0 },
        npcNames: ["血煞宗", "黄泉殿", "万魔窟"],
        baseTanks: (realm) => ({ qs: 10000 * realm, ql: 0 }),
      };
    }

    return {
      ...SectReactor,
      npcNames: ["青云门", "灵剑山", "星辰阁"],
    };
  },
};
