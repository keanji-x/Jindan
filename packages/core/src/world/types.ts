// ============================================================
// World types — world-level state and events
// ============================================================

import type { ActionId, Entity, SpeciesType } from "../entity/types.js";

/** 天地灵气 */
export interface AmbientQi {
  current: number;
  /** 世界灵气总量 (恒定: ambient + Σ entity qi) */
  total: number;
}

/** 世界状态 */
export interface WorldState {
  tick: number;
  qiFlux: number;
  ambientQi: AmbientQi;
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
  | "tick_complete";

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
