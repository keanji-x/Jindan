import { PlantReactor } from "../beings/plant.js";
import type { SpeciesGenerator } from "../config/types.js";

export const PlantGenerator: SpeciesGenerator = {
  id: "plant",
  baseName: "灵草",
  canDerive: (ambient, _total) => {
    // 灵草需要基础的灵气或者煞气作为土壤
    return (ambient.ql ?? 0) > 5 || (ambient.qs ?? 0) > 5;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;
    const qs = ambient.qs ?? 0;

    // 如果煞气远剩于灵气，派生出「煞魔藤」等变异品种，解锁吞噬能力
    if (qs > ql * 1.5 && qs > 50) {
      return {
        ...PlantReactor,
        id: "plant_qs_mutated",
        name: "煞魔藤",
        coreParticle: "qs",
        baseTanks: (realm) => ({ qs: 150 * realm, ql: 0 }),
        ownPolarity: { qs: 1.0, ql: 0.0 },
        oppositePolarity: { qs: 0.0, ql: 1.0 },
        actions: ["photosynth", "devour", "breakthrough", "rest"], // 解锁 devour
        npcNames: ["嗜血藤", "枯骨草", "煞毒花"],
      };
    }

    return PlantReactor;
  },
};
