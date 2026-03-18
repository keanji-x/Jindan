// ============================================================
// Type definitions for the cultivation world
// ============================================================

/** 修士 (Cultivator) */
export interface Cultivator {
  id: string;
  name: string;
  realm: number; // 1-10
  exp: number;
  expToNext: number;
  power: number;
  qi: number; // 体内灵力
  maxQi: number;
  spiritStones: number;
  alive: boolean;
  age: number; // ticks lived
  lifespan: number;
}

/** 妖兽 (Beast) */
export interface Beast {
  id: string;
  name: string;
  rank: number; // 1-10
  power: number;
  qi: number;
  coreSpiritStones: number;
  alive: boolean;
  age: number;
  lifespan: number;
}

/** 灵脉 (Spirit Vein) */
export interface SpiritVein {
  grade: number;
  outputPerTick: number;
  maxCapacity: number;
  remaining: number;
}

/** 区域灵气 (Ambient Qi) */
export interface AmbientQi {
  current: number;
  capacity: number;
}

/** 世界资源 */
export interface WorldResources {
  spiritVein: SpiritVein;
  ambientQi: AmbientQi;
  unclaimedStones: number;
}

/** 世界状态 */
export interface WorldState {
  tick: number;
  resources: WorldResources;
  cultivators: Map<string, Cultivator>;
  beasts: Map<string, Beast>;
}

/** 世界事件类型 */
export type WorldEventType =
  | "vein_output"
  | "qi_overflow"
  | "cultivator_created"
  | "cultivator_cultivated"
  | "cultivator_breakthrough"
  | "cultivator_died"
  | "beast_spawned"
  | "beast_died"
  | "beast_starved"
  | "combat_result"
  | "pickup_stones"
  | "tick_complete"
  | "vein_depleted";

/** 世界事件 */
export interface WorldEvent {
  tick: number;
  type: WorldEventType;
  data: Record<string, unknown>;
  message: string;
}

/** 战斗结果 */
export interface CombatResult {
  winner: { id: string; name: string; type: "cultivator" | "beast" };
  loser: { id: string; name: string; type: "cultivator" | "beast" };
  spoils: number; // 灵石
}

/** 动作类型 */
export type ActionType =
  | "cultivate"
  | "combat_beast"
  | "combat_pvp"
  | "pickup_stones"
  | "rest"
  | "breakthrough";

/** API 响应：可用动作 */
export interface AvailableAction {
  action: ActionType;
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
