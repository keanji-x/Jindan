// ============================================================
// ActionRegistry — global singleton for all action definitions
//
// Uses GameSystem self-registration pattern.
//
// Usage:
//   import { ActionRegistry } from "@jindan/core";
//   ActionRegistry.registerSystem(AbsorbSystem);
//   ActionRegistry.get("meditate")       → ActionDef
//   ActionRegistry.getAll()              → ActionDef[]
//   ActionRegistry.forSpecies("human")   → ActionDef[]
// ============================================================

import { UNIVERSE } from "../config/universe.config.js";
import type { GameSystem } from "./GameSystem.js";
import type { ActionDef, ActionHandler, ActionResolver } from "./types.js";

const allActions: ActionDef[] = [];
const byId = new Map<string, ActionDef>();
const handlers = new Map<string, ActionHandler | ActionResolver>();
const registeredSystems: GameSystem[] = [];

/** Global action registry (singleton) */
export const ActionRegistry = {
  /** Register a complete GameSystem (all its actions + shared handler) */
  registerSystem(system: GameSystem) {
    registeredSystems.push(system);
    for (const action of system.actions) {
      action.systemId = system.id;
      allActions.push(action);
      byId.set(action.id, action);
      if (system.handler) {
        handlers.set(action.id, system.handler);
      } else {
        throw new Error(`System ${system.name} provides actions but no handler`);
      }
    }
  },

  /** Get action by ID */
  get(id: string): ActionDef | undefined {
    return byId.get(id);
  },

  /** Get registered execution handler for an action */
  getHandler(id: string): ActionHandler | ActionResolver | undefined {
    return handlers.get(id);
  },

  /** Get all actions */
  getAll(): ActionDef[] {
    return allActions;
  },

  /** Get all registered systems */
  getSystems(): GameSystem[] {
    return registeredSystems;
  },

  /** Get actions available to a species */
  forSpecies(species: string): ActionDef[] {
    const reactor = UNIVERSE.reactors[species];
    if (!reactor) return [];
    return reactor.actions;
  },

  /** Get qi cost of an action (0 if unknown) */
  cost(id: string): number {
    return byId.get(id)?.qiCost ?? 0;
  },

  /** Get display name of an action */
  name(id: string): string {
    return byId.get(id)?.name ?? id;
  },

  /** Get description of an action */
  desc(id: string): string {
    return byId.get(id)?.description ?? "";
  },

  /** Whether action needs a target */
  needsTarget(id: string): boolean {
    return byId.get(id)?.needsTarget ?? false;
  },

  /** Reset registry (for testing) */
  _reset() {
    allActions.length = 0;
    byId.clear();
    handlers.clear();
    registeredSystems.length = 0;
  },
} as const;
