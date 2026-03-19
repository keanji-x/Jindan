import type { ActionDef } from "./types.js";

export const BREAKTHROUGH: ActionDef = {
  id: "breakthrough",
  name: "突破",
  description: "冲击更高境界，消耗大量灵气",
  cliCommand: "breakthrough",
  cliHelp: "✨ 突破 (冲击更高境界)",
  qiCost: 30,
  species: ["human", "beast", "plant"],
  needsTarget: false,
};
