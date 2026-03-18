import type { ActionDef } from "./types.js";

export const MEDITATE: ActionDef = {
  id: "meditate",
  name: "打坐",
  description: "吐纳天地灵气，缓缓吸收灵气到体内",
  cliCommand: "meditate",
  cliHelp: "🧘 打坐 (修士吸灵气)",
  qiCost: 3,
  species: ["human"],
  needsTarget: false,
};
