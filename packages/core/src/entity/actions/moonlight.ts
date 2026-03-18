import type { ActionDef } from "./types.js";

export const MOONLIGHT: ActionDef = {
  id: "moonlight",
  name: "吸纳月华",
  description: "吞吸天地精华，快速吸收大量灵气",
  cliCommand: "moonlight",
  cliHelp: "🌙 吸纳月华 (妖兽吸灵气)",
  qiCost: 8,
  species: ["beast"],
  needsTarget: false,
};
