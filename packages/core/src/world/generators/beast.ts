import { BeastReactor } from "../beings/beast.js";
import type { SpeciesGenerator } from "../config/types.js";

export const BeastGenerator: SpeciesGenerator = {
  id: "beast",
  baseName: "妖兽",
  canDerive: (ambient, _total) => {
    // 妖兽诞生需要强烈的煞气刺激或者灵气极度充沛
    return (ambient.qs ?? 0) > 20 || (ambient.ql ?? 0) > 200;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    // 如果灵气极度纯净而煞气极低，妖兽会被“净化”派生出灵兽（瑞兽）
    if (ql > qs * 3 && ql > 100) {
      return {
        ...BeastReactor,
        id: "beast_ql_purified",
        name: "瑞兽",
        coreParticle: "ql",
        baseTanks: (realm) => ({ ql: 120 * realm, qs: 0 }),
        ownPolarity: { ql: 1.0, qs: 0.0 },
        oppositePolarity: { ql: 0.0, qs: 1.0 },
        actions: ["meditate", "devour", "breakthrough", "rest"], // 吐纳而不吸月华
        npcNames: ["青玉鹿", "白云鹤", "寻灵鼠"],
      };
    }

    return BeastReactor;
  },
};
