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
  name: string;
  species: SpeciesType;
  alive: boolean;
  components: {
    tank?: TankComponent;
    combat?: CombatComponent;
    cultivation?: CultivationComponent;
  };
}

/** 物种模板: kept for backward compat with ActionRegistry species checks */
export interface SpeciesTemplate {
  type: SpeciesType;
  name: string;
  actions: string[]; // ActionId references
}
