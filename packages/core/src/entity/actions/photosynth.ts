import type { ActionDef } from "./types.js";

export const PHOTOSYNTH: ActionDef = {
  id: "photosynth",
  name: "光合吐纳",
  description: "扎根大地，缓缓吸收天地灵气",
  cliCommand: "photosynth",
  cliHelp: "🌿 光合吐纳 (灵植吸灵气)",
  qiCost: 1,
  species: ["plant"],
  needsTarget: false,
};
