// ============================================================
// ActionRegistry — global singleton for all action definitions
//
// Usage:
//   import { ActionRegistry } from "@jindan/core";
//   ActionRegistry.get("meditate")       → ActionDef
//   ActionRegistry.getAll()              → ActionDef[]
//   ActionRegistry.forSpecies("human")   → ActionDef[]
//   ActionRegistry.cost("devour")        → number
// ============================================================

import type { SpeciesType } from "../types.js";
import { BREAKTHROUGH } from "./breakthrough.js";
import { CHAT } from "./chat.js";
import { DEVOUR } from "./devour.js";
import { MEDITATE } from "./meditate.js";
import { MOONLIGHT } from "./moonlight.js";
import { PHOTOSYNTH } from "./photosynth.js";
import { REST } from "./rest.js";
import type { ActionDef, ActionHandler, ActionId } from "./types.js";

/** All registered actions */
const ALL_ACTIONS: ActionDef[] = [
  MEDITATE,
  MOONLIGHT,
  PHOTOSYNTH,
  DEVOUR,
  BREAKTHROUGH,
  REST,
  CHAT,
];

const byId = new Map<string, ActionDef>(ALL_ACTIONS.map((a) => [a.id, a]));
const handlers = new Map<string, ActionHandler>();

/** Global action registry (singleton) */
export const ActionRegistry = {
  /** Get action by ID */
  get(id: ActionId | string): ActionDef | undefined {
    return byId.get(id);
  },

  /** Register an execution handler for an action */
  registerHandler(id: ActionId | string, handler: ActionHandler) {
    handlers.set(id, handler);
  },

  /** Get registered execution handler for an action */
  getHandler(id: ActionId | string): ActionHandler | undefined {
    return handlers.get(id);
  },

  /** Get all actions */
  getAll(): ActionDef[] {
    return ALL_ACTIONS;
  },

  /** Get actions available to a species */
  forSpecies(species: SpeciesType): ActionDef[] {
    return ALL_ACTIONS.filter((a) => a.species.includes(species));
  },

  /** Get qi cost of an action (0 if unknown) */
  cost(id: ActionId | string): number {
    return byId.get(id)?.qiCost ?? 0;
  },

  /** Get display name of an action */
  name(id: ActionId | string): string {
    return byId.get(id)?.name ?? id;
  },

  /** Get description of an action */
  desc(id: ActionId | string): string {
    return byId.get(id)?.description ?? "";
  },

  /** Whether action needs a target */
  needsTarget(id: ActionId | string): boolean {
    return byId.get(id)?.needsTarget ?? false;
  },
} as const;

export { BREAKTHROUGH } from "./breakthrough.js";
export { CHAT } from "./chat.js";
export { DEVOUR } from "./devour.js";
export { MEDITATE } from "./meditate.js";
export { MOONLIGHT } from "./moonlight.js";
export { PHOTOSYNTH } from "./photosynth.js";
export { REST } from "./rest.js";
// Re-exports
export type { ActionDef, ActionId } from "./types.js";
