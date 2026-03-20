// ============================================================
// @jindan/core — barrel export
// ============================================================

export { ApiServer } from "./ApiServer.js";
// Infrastructure
export { EventBus } from "./EventBus.js";
// Storage layer
export type { StorageBackend } from "./storage/index.js";
export { MemoryStorage, PgStorage } from "./storage/index.js";
// Config layer (universe physics)
export type * from "./world/config/index.js";
export { UNIVERSE } from "./world/config/index.js";
export { createEntity } from "./world/factory.js";
export {
  ABSORB_CONFIG,
  BREAKTHROUGH_CONFIG,
  World,
} from "./world/index.js";
// World layer (primary)
export { ActionRegistry } from "./world/systems/ActionRegistry.js";
export type { GameSystem } from "./world/systems/GameSystem.js";
export type { ActionDef } from "./world/systems/types.js";
export type {
  ActionId,
  AvailableAction,
  Entity,
  SpeciesType,
  WorldEvent,
} from "./world/types.js";
