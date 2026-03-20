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
  /** Passive drain rate (particles leaked to ambient per tick) */
  baseDrainRate: number;
  /** 自身拥有的极性配释（主燃料） */
  ownPolarity: Record<ParticleId, number>;
  /** 废气/排异的对冲极性配释 */
  oppositePolarity: Record<ParticleId, number>;
  /** Available action IDs for this species */
  actions: string[];
  /** Amount this species increases the global ambient capacity */
  ambientCapContribution: number;
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
  /** QS infiltration exp factor: infiltration = baseDrain × (exp(k × qs_ratio × density) - 1) */
  infiltrationK: number;
  /** QL dissipation exp factor: dissipation = baseDrain × (exp(k × (1 - density)) - 1) */
  dissipationK: number;
  /** Absorb parameters per action */
  absorb: Record<string, { base: number; perRealm: number }>;
  /** Passive drain formula */
  drainFormula: (baseDrain: number, totalParticles: number, ambientCore: number) => number;
  /** Ecology auto-regulation parameters */
  ecology: {
    /** Base ambient pool capacity (without entities) */
    baseAmbientCap: number;
    /** Ambient density limit */
    ambientDensity: number;
    /** SpawnPool: base chance per tick for entity generation */
    spawnBaseChance: number;
    /** SpawnPool: max entities in world (controls emptiness factor) */
    maxEntities: number;
  };
}
