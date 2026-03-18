import type { ActionDef } from "./types.js";

export const REST: ActionDef = {
  id: "rest",
  name: "休息",
  description: "无所事事 (仍会被动流失灵气)",
  cliCommand: "rest",
  cliHelp: "💤 休息 (跳过回合)",
  qiCost: 0,
  species: ["human", "beast", "plant"],
  needsTarget: false,
};
