// ============================================================
// AbsorbSystem — 吐纳系统
//
// 1 System → 3 Actions: meditate, moonlight, photosynth
// ============================================================

import type { GameSystem } from "../GameSystem.js";
import { doAbsorb } from "./handler.js";

export const AbsorbSystem: GameSystem = {
  id: "absorb",
  name: "吐纳",
  actions: [
    {
      id: "meditate",
      name: "打坐",
      description: "吐纳天地灵气，缓缓吸收灵气到体内",
      qiCost: 3,
      species: ["human"],
      needsTarget: false,
    },
    {
      id: "moonlight",
      name: "吸纳月华",
      description: "吞吸天地精华，快速吸收大量灵气",
      qiCost: 8,
      species: ["beast"],
      needsTarget: false,
    },
    {
      id: "photosynth",
      name: "光合吐纳",
      description: "扎根大地，缓缓吸收天地灵气",
      qiCost: 1,
      species: ["plant"],
      needsTarget: false,
    },
  ],
  handler: doAbsorb,
};
