// ============================================================
// @jindan/core — barrel export (v2 refactored)
// ============================================================

export { ApiServer } from "./ApiServer.js";
// Infrastructure
export { EventBus } from "./EventBus.js";
// Entity layer
export type * from "./entity/index.js";
export { ActionRegistry, createEntity, SPECIES } from "./entity/index.js";
// World layer
export type * from "./world/index.js";
export { WORLD_CONFIG, QI_CONFIG, ABSORB_CONFIG, DEVOUR_CONFIG, BREAKTHROUGH_CONFIG, World } from "./world/index.js";
