// ============================================================
// @jindan/core — barrel export (v3 reactor engine)
// ============================================================

export { ApiServer } from "./ApiServer.js";
// Infrastructure
export { EventBus } from "./EventBus.js";
// Engine layer (NEW)
export type * from "./engine/index.js";
export { solve, solveDrain, UNIVERSE } from "./engine/index.js";
// Entity layer
export type * from "./entity/index.js";
export { ActionRegistry, createEntity, SPECIES } from "./entity/index.js";
// World layer
export type * from "./world/index.js";
export {
  ABSORB_CONFIG,
  BREAKTHROUGH_CONFIG,
  DEVOUR_CONFIG,
  QI_CONFIG,
  WORLD_CONFIG,
  World,
} from "./world/index.js";
