// ============================================================
// Engine types — data-driven reactor engine primitives
//
// Every concept in the universe (particles, equations, life)
// is defined as pure data. The engine code never hard-codes
// game rules — it only interprets these definitions.
// ============================================================

import type { ActionDef } from "../systems/types.js";

/** Unique identifier for a particle type (e.g. "ql", "qs") */
export type ParticleId = string;

// ── Particle Schema ──────────────────────────────────────────

/** Definition of a single particle type */
export interface ParticleDef {
  id: ParticleId;
  /** Display name (e.g. "灵", "煞") */
  name: string;
  /** Hex color for UI rendering */
  color: string;
}

// ── Reactor Templates ────────────────────────────────────────

/** Absorb source: who this entity pulls particles from */
export type AbsorbSource = "dao" | "members" | "all";

/**
 * A life-form is a reactor: a set of particle tanks + polarity rules.
 *
 * The reactor template defines:
 *  - Which particle is the "core" (QL for cultivators, QS for beasts)
 *  - Proportion limit per realm (天道容忍占比)
 *  - Bidirectional flow counterparty (absorbSource)
 */
export interface ReactorTemplate {
  /** Species key (e.g. "human", "beast", "plant", "dao") */
  id: string;
  /** Display name (e.g. "修士") */
  name: string;
  /** The particle that constitutes this being's physical body */
  coreParticle: ParticleId;
  /**
   * 天道容忍占比 — 该物种在给定 realm 可占据世界总粒子的比例。
   * S = entity_qi / world_total > proportionLimit → 触发失衡释放
   */
  proportionLimit: (realm: number) => number;
  /** 初生粒子灌注量（从对手方转移的固定数量） */
  birthCost: number;
  /** 双向流对手方："dao" = 天道, "members" = 宗门弟子, "all" = 所有非Dao实体 */
  absorbSource: AbsorbSource;
  /** Passive drain rate (particles leaked per tick via metabolism) */
  baseDrainRate: number;
  /** 自身拥有的极性配释（粒子理想比例，总和应为 1.0） */
  ownPolarity: Record<ParticleId, number>;
  /** Available actions for this species (ActionDef instances, may carry absorbRate etc.) */
  actions: ActionDef[];
  /**
   * 全局实例上限。undefined = 无限制。
   * 例如 maxInstances: 1 = 全服唯一（先天灵宝、混沌神器等）
   * 检查范围：存活实体（entombed 不占名额，神器可重新降世）
   */
  maxInstances?: number;
  /**
   * NPC 随机名字表。有此字段的物种才会被 SpawnSystem 自动化生。
   * 没有此字段的物种（如 human、item）只能通过 API 手动创建。
   */
  npcNames?: string[];
  /** NPC 脑类型 ID（AI 策略标识，对应 AiRegistry 里的 brain） */
  npcBrainId?: string;
  /** Brain lookahead depth (higher = smarter). Defaults to ACTIONS_PER_TICK. */
  brainDepth?: number;
}

// ── Species Generators ───────────────────────────────────────

/**
 * 派生器：定义了一类生命的基础蓝图与变异法则。
 * 基于当前环境（如灵气稀薄、煞气浓郁），派生出具体的 ReactorTemplate (物种物性)。
 */
export interface SpeciesGenerator {
  /** 派生器纲目 ID (如 "plant_gen") */
  id: string;
  /** 基础分类名称 (如 "草木类") */
  baseName: string;
  /** 判断该派生器是否满足激活条件 */
  canDerive: (ambient: Record<ParticleId, number>, totalParticles: number) => boolean;
  /** 根据环境动态派生出全新的 (或已存在的) 具体的物种 ReactorTemplate */
  derive: (ambient: Record<ParticleId, number>, totalParticles: number) => ReactorTemplate;
}

// ── Universe Config ──────────────────────────────────────────

/** Complete universe configuration — all physics in one object */
export interface UniverseConfig {
  /** All particle types in this universe */
  particles: ParticleDef[];
  /** All reactor (life-form) templates (static + dynamic) */
  reactors: Record<string, ReactorTemplate>;
  /** All species generators (the blueprints that derive reactors) */
  generators: Record<string, SpeciesGenerator>;
  /** Total particle count in the world (initial ambient qi pool) */
  totalParticles: number;
  /** Real-time interval between ticks in milliseconds */
  tickIntervalMs: number;
  /** Maximum events retained in the EventGraph forgetting window */
  ledgerWindowSize: number;
  /** Breakthrough parameters */
  breakthrough: {
    qiCostPerRealm: number;
    minQiRatio: number;
    baseSuccessRate: number;
    maxSuccessRate: number;
    failLossRatio: number;
    burnRatio: number;
    /** Maximum realm achievable */
    maxRealm?: number;
  };
  /** Drain exponential base: drain = baseDrain × drainBase^(realm-1) */
  drainBase: number;
  /** Global absorb multiplier applied to all species' absorbRate */
  absorbScale: number;
  /** Global drain multiplier applied to all species' baseDrainRate */
  drainScale: number;
  /** Proportion multiplier for 天劫 deterministic trigger (e.g. 2.0 = fires at 2× proportionLimit) */
  tribulationThreshold: number;
  /** Ecology auto-regulation parameters */
  ecology: {
    /** SpawnPool: base chance per tick for entity generation */
    spawnBaseChance: number;
    /** SpawnPool: max entities in world (controls emptiness factor) */
    maxEntities: number;
  };
}
