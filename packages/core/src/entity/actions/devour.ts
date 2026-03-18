import type { ActionDef } from "./types.js";

export const DEVOUR: ActionDef = {
  id: "devour",
  name: "吞噬",
  description: "攻击其他生灵，胜者夺取败者灵气",
  cliCommand: "devour",
  cliHelp: "⚔️  吞噬 (攻击目标)",
  qiCost: 10,
  species: ["human", "beast"],
  needsTarget: true,
};
