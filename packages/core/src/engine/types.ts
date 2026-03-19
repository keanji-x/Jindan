// ============================================================
// Engine types — data-driven reactor engine primitives
//
// Every concept in the universe (particles, equations, life)
// is defined as pure data. The engine code never hard-codes
// game rules — it only interprets these definitions.
// ============================================================

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

// ── Equation Definitions ─────────────────────────────────────

/**
 * A chemical equation: maps input particles to output particles.
 *
 * Conservation law: Σ values(input) ≡ Σ values(output)
 *
 * Example — detox:
 *   { input: { ql: 1, qs: 1 }, output: { qs: 2 } }
 *   reads as: 1 QL + 1 QS → 2 QS
 */
export interface EquationDef {
  /** Unique name (e.g. "detox", "digest_cross") */
  id: string;
  /** Display name */
  name: string;
  /** Reactants: particle amounts consumed */
  input: Record<ParticleId, number>;
  /** Products: particle amounts produced */
  output: Record<ParticleId, number>;
}

// ── Reactor Templates ────────────────────────────────────────

/**
 * A life-form is a reactor: a set of particle tanks + bound equations.
 *
 * The reactor template defines:
 *  - Which particle is the "core" (QL for cultivators, QS for beasts)
 *  - Initial tank capacities per realm
 *  - Which equations fire for each life event
 */
export interface ReactorTemplate {
  /** Species key (e.g. "human", "beast", "plant") */
  id: string;
  /** Display name (e.g. "修士") */
  name: string;
  /** The particle that constitutes this being's physical body */
  coreParticle: ParticleId;
  /** Base tank capacity per realm for each particle */
  baseTanks: (realm: number) => Record<ParticleId, number>;
  /** Base combat power per realm */
  basePower: (realm: number) => number;
  /** Passive drain rate (particles leaked to ambient per tick) */
  baseDrainRate: number;
  /** Equation used when this reactor devours a CROSS-species target */
  devourCrossEq: string;
  /** Equation used when this reactor devours a SAME-species target */
  devourSameEq: string;
  /** Equation used for passive metabolism / drain */
  metabolismEq: string;
  /** Available action IDs for this species */
  actions: string[];
}

// ── Universe Config ──────────────────────────────────────────

/** Complete universe configuration — all physics in one object */
export interface UniverseConfig {
  /** All particle types in this universe */
  particles: ParticleDef[];
  /** All chemical equations */
  equations: Record<string, EquationDef>;
  /** All reactor (life-form) templates */
  reactors: Record<string, ReactorTemplate>;
  /** Total particle count in the universe (conserved) */
  totalParticles: number;
  /** Ratio of particles initially in ambient vs in entities */
  initialAmbientRatio: number;
  /** Initial NPC counts */
  initialBeasts: number;
  initialPlants: number;
  /** Breakthrough parameters */
  breakthrough: {
    qiCostPerRealm: number;
    baseSuccessRate: number;
    maxSuccessRate: number;
    failLossRatio: number;
  };
  /** Absorb parameters per action */
  absorb: Record<string, { base: number; perRealm: number }>;
  /** Devour combat sigmoid scaling factor */
  devourPowerScaling: number;
  /** Passive drain formula */
  drainFormula: (baseDrain: number, totalParticles: number, ambientCore: number) => number;
}
