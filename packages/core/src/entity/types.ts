// ============================================================
// Entity types — what a living being IS
//
// v3: Data-driven reactor model.
// An entity is a "reactor" — a set of particle tanks bound
// to chemical equations via a ReactorTemplate.
// ============================================================

import type { ParticleId } from "../engine/types.js";

// Re-export action types from actions/
export type { ActionDef, ActionId } from "./actions/types.js";

/** 物种类型 */
export type SpeciesType = "human" | "beast" | "plant";

/** 实体生命状态 */
export type LifeStatus = "alive" | "lingering" | "entombed";

/** 生灵的一生：article (前世/墓志铭总结) + events (今生事件 ID 列表) */
export interface Life {
  /** 累世聚合的文章（墓志铭），初始为空字符串 */
  article: string;
  /** 当前这一世的 LedgerEvent ID 列表 */
  events: string[];
}

/** 组件：粒子储罐 (replaces old QiComponent) */
export interface TankComponent {
  /** Current particle amounts keyed by particle id */
  tanks: Record<ParticleId, number>;
  /** Max capacity per particle */
  maxTanks: Record<ParticleId, number>;
  /** Which particle constitutes this being's physical body */
  coreParticle: ParticleId;
}

/** 组件：战斗 */
export interface CombatComponent {
  power: number;
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
    combat?: CombatComponent;
    cultivation?: CultivationComponent;
    brain?: { id: string };
  };
}

/** 物种模板: kept for backward compat with ActionRegistry species checks */
export interface SpeciesTemplate {
  type: SpeciesType;
  name: string;
  actions: string[]; // ActionId references
}
