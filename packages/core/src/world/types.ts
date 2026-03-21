// ============================================================
// World types — all core domain types
//
// Entities, components, world state, events, event records
// ============================================================

import type { Life } from "../memory/types.js";
import type { ParticleId } from "./config/types.js";
import type { ActiveGraph } from "./effects/types.js";

// ── Entity Types ──────────────────────────────────────────────

/** Action 唯一标识 (开放 string，便于扩展新 System) */
export type ActionId = string;

/** 物种类型 — 开放 string，由 UNIVERSE.reactors 注册表驱动 */
export type SpeciesType = string;

/** 实体生命状态 */
export type LifeStatus = "alive" | "lingering" | "entombed";

/** 组件：粒子储罐 */
export interface TankComponent {
  /** Current particle amounts keyed by particle id */
  tanks: Record<ParticleId, number>;
  /** Max capacity per particle */
  maxTanks: Record<ParticleId, number>;
  /** Which particle constitutes this being's physical body */
  coreParticle: ParticleId;
}

/** 组件：修为 */
export interface CultivationComponent {
  realm: number;
}

/** 世界中的一个生灵 (reactor) */
export interface Entity {
  id: string;
  /** 灵魂唯一标识符 — 跨转生保持不变，用于聚合前世墓碑 */
  soulId: string;
  name: string;
  species: SpeciesType;
  status: LifeStatus;
  life: Life;
  /** 是否有灵智 (AI 扮演的生物 = true, 后台自动生成的 = false) */
  sentient: boolean;
  components: {
    tank?: TankComponent;
    cultivation?: CultivationComponent;
    brain?: { id: string };
    actionGraph?: ActiveGraph;
  };
}

// ── Relation Types ───────────────────────────────────────────

/** 两个实体之间的关系键 — 无序对，字典序较小的 ID 在前 */
export type RelationKey = `${string}:${string}`;

/** 构造标准化的关系键（保证 get(a,b) === get(b,a)） */
export function makeRelationKey(a: string, b: string): RelationKey {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ── World State Types ────────────────────────────────────────

/** 灵气池状态 */
export interface QiPoolState {
  /** 环境中各粒子的数量 */
  pools: Record<ParticleId, number>;
  /** 系统内固定总粒子数（宇宙常数） */
  total: number;
}

/** 天地环境粒子池 */
export interface AmbientPool {
  /** Current particle amounts in the environment */
  pools: Record<ParticleId, number>;
  /** Total particle count across entire universe (conserved constant) */
  total: number;
}

/** 世界状态 */
export interface WorldState {
  tick: number;
  ambientPool: AmbientPool;
  entities: Map<string, Entity>;
}

// ── Event Record Types (structured, in-world facts) ──────────

/** 事件记录类型 */
export type WorldEventRecordType =
  | ActionId
  | "system_created"
  | "system_died"
  | "tick_advance"
  | "report";

/** 结构化事件记录：记录实体交互或系统事件的有向边 */
export interface WorldEventRecord {
  id: string; // 唯一事件ID
  tick: number; // 发生时间
  sourceId: string; // 发起者ID，环境事件可用 "WORLD" 或 "SYSTEM"
  targetId?: string; // 受击者/目标ID
  type: WorldEventRecordType; // 事件类型/边类型
  data?: Record<string, unknown>; // 事件附带的复式记账数据（如 qiCost, absorbed）
}

/** 供外部查询的实体历史视图 */
export interface EntityHistory {
  entityId: string;
  // 作为发起人的行为
  actionsInitiated: WorldEventRecord[];
  // 作为目标/受害人的行为
  actionsReceived: WorldEventRecord[];
}

// ── World Event Types (runtime bus events) ───────────────────

/** 世界事件类型 */
export type WorldEventType =
  | "entity_created"
  | "entity_absorbed"
  | "entity_drained"
  | "entity_devoured"
  | "entity_breakthrough"
  | "entity_died"
  | "entity_chat"
  | "entity_tomb"
  | "entity_reincarnated"
  | "tick_complete"
  | "system_warning"
  | "report";

/** 世界事件 */
export interface WorldEvent {
  index: number; // 全局单调自增的事件序列号
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
  recentEvents: WorldEventRecord[];
  availableActions: AvailableAction[];
  error?: string;
}
