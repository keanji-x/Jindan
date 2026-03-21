import type { GameSystem } from "./GameSystem.js";
import { executeDrain } from "./handlers/drain.js";
import { executeSpawn } from "./handlers/spawn.js";

export const LifecycleSystem: GameSystem = {
  id: "lifecycle",
  name: "全局天道演化",
  actions: [], // 纯被动系统
  onTick: (context) => {
    executeSpawn(context);
    executeDrain(context.entities, context.ambientPool, context.tick, context.events);
  },
};
