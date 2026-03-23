// ============================================================
// World types — all core domain types
//
// Entities, components, world state, events, event records
// ============================================================

import type { Life } from "../memory/types.js";
import type { Personality } from "./brains/optimizer/PersonalityObjective.js";
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
  /** Which particle constitutes this being's physical body */
  coreParticle: ParticleId;
}

/** 组件：修为 */
export interface CultivationComponent {
  realm: number;
}

/** 组件：心境 (情绪影响吸收效率) */
export interface MoodComponent {
  /** 0.0 (心如死灰) ~ 1.0 (道心通明)，默认 0.5 */
  value: number;
}

/** 信箱消息 */
export interface ChatMessage {
  id: string;
  tick: number;
  fromId: string;
  fromName: string;
  message: string;
  read: boolean;
  /** 是否为回复消息（回复不触发自动回复，防止无限 ping-pong） */
  isReply?: boolean;
}

/** 组件：信箱 (异步传音队列) */
export interface MailboxComponent {
  messages: ChatMessage[];
}

/** 组件：大脑 */
export interface BrainComponent {
  id: string; // "template" | "llm" | "external_llm"
  replyMode: "auto" | "manual"; // auto = brain自动回复, manual = 等待外部
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
    mood?: MoodComponent;
    brain?: BrainComponent;
    mailbox?: MailboxComponent;
    actionGraph?: ActiveGraph;
    /** LLM-generated emotion (瞬时情绪, 每轮更新) */
    emotion?: { tag: string };
    /** LLM-generated short-term goal (短期目标, 每轮更新) */
    shortTermGoal?: { text: string };
    /** 性格向量 — 驱动 NPC 多目标优化决策 */
    personality?: Personality;
  };
}

// ── Relation Types ───────────────────────────────────────────

/** 两个实体之间的关系键 — 无序对，字典序较小的 ID 在前 */
export type RelationKey = `${string}:${string}`;

/** 构造标准化的关系键（保证 get(a,b) === get(b,a)） */
export function makeRelationKey(a: string, b: string): RelationKey {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** 实体关系标签 */
export enum RelationTag {
  DaoPartner = "dao_partner",
  MasterDisciple = "master_disciple",
  SwornSibling = "sworn_sibling",
  BloodFeud = "blood_feud",
  Friend = "friend",
  Enemy = "enemy",
  Parent = "parent",
  Child = "child",
  Owner = "owner",
  Owned = "owned",
  Enslaver = "enslaver",
  Enslaved = "enslaved",
  SectMember = "sect_member",
  SectLeader = "sect_leader",
}

/** 实体关系数据 */
export interface RelationData {
  score: number;
  tags: RelationTag[];
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
  /** 是否为重大事件（长期记忆：突破/战斗/死亡/转世等） */
  isMajor?: boolean;
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
  | "entity_courted"
  | "entity_acquired"
  | "entity_enslaved"
  | "entity_mated"
  | "entity_spawned_offspring"
  | "entity_sect_founded"
  | "entity_recruited"
  | "entity_released"
  | "tick_complete"
  | "system_warning"
  | "report"
  // ── 剧情导演事件 ──
  | "drama_rescue"
  | "drama_heavenly_jealousy"
  | "drama_betrayal"
  | "drama_qi_storm"
  | "drama_sect_crisis";

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
