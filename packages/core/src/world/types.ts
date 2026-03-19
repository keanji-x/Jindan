// ============================================================
// World types — world-level state and events
//
// v3: AmbientQi → AmbientPool (multi-particle)
// ============================================================

import type { ParticleId } from "../engine/types.js";
import type { ActionId, Entity, SpeciesType } from "../entity/types.js";

/** 天地环境粒子池 (replaces old AmbientQi) */
export interface AmbientPool {
  /** Current particle amounts in the environment */
  pools: Record<ParticleId, number>;
  /** Total particle count across entire universe (conserved constant) */
  total: number;
}

/** 世界状态 */
export interface WorldState {
  tick: number;
  qiFlux: number;
  ambientPool: AmbientPool;
  entities: Map<string, Entity>;
}

/** 世界事件类型 */
export type WorldEventType =
  | "entity_created"
  | "entity_absorbed"
  | "entity_drained"
  | "entity_devoured"
  | "entity_breakthrough"
  | "entity_died"
  | "tick_complete"
  | "report";

/** 世界事件 */
export interface WorldEvent {
  tick: number;
  type: WorldEventType;
  data: Record<string, unknown>;
  message: string;
}

/** 吞噬结果 */
export interface DevourResult {
  winner: { id: string; name: string; species: SpeciesType };
  loser: { id: string; name: string; species: SpeciesType };
  qiGained: number;
  qiReturned: number;
  crossSpecies: boolean;
}

/** 可用动作 */
export interface AvailableAction {
  action: ActionId;
  targetId?: string;
  description: string;
  possible: boolean;
  reason?: string;
}

/** API 响应通用结构 */
export interface ActionResult<T = unknown> {
  success: boolean;
  tick: number;
  result?: T;
  events: WorldEvent[];
  availableActions: AvailableAction[];
  error?: string;
}
