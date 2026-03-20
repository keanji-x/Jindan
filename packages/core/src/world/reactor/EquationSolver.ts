// ============================================================
// EquationSolver — generic chemical equation engine
//
// Given an equation definition and a scale factor, execute
// particle transfers between tanks and ambient pools.
// The solver NEVER knows about game-specific concepts like
// "cultivator" or "beast" — it only sees particles.
// ============================================================

import type { EquationDef, ParticleId } from "../config/types.js";

/** Particle storage — either an entity's tanks or the ambient pool */
export interface ParticleStore {
  /** Current particle amounts, keyed by particle ID */
  particles: Record<ParticleId, number>;
}

/** Result of executing an equation */
export interface SolveResult {
  /** Whether the reaction succeeded */
  success: boolean;
  /** Reason for failure */
  reason?: string;
  /** Net change to each particle in the source store */
  deltas: Record<ParticleId, number>;
  /** Total particle flow (sum of absolute deltas) — accounting metric */
  totalFlow: number;
}

/**
 * Execute a chemical equation at a given scale.
 *
 * @param eq      - The equation definition (e.g. digest_cross_l)
 * @param scale   - Multiplier applied to all coefficients
 * @param source  - The entity's particle tanks (mutated in place)
 * @param ambient - The world's ambient pool (mutated in place)
 *
 * The solver:
 * 1. Checks that `source` has enough input particles
 * 2. Deducts inputs from `source`
 * 3. For outputs where the particle matches coreParticle → add to `source`
 *    Otherwise → add to `ambient`
 * 4. Asserts conservation: Σ input === Σ output
 */
export function solve(
  eq: EquationDef,
  scale: number,
  source: ParticleStore,
  ambient: ParticleStore,
  coreParticle: ParticleId,
): SolveResult {
  // ── 0. Conservation assertion on the equation itself ────────
  const totalIn = sumValues(eq.input) * scale;
  const totalOut = sumValues(eq.output) * scale;
  if (Math.abs(totalIn - totalOut) > 0.001) {
    return {
      success: false,
      reason: `方程式不守恒: input=${totalIn} ≠ output=${totalOut}`,
      deltas: {},
      totalFlow: 0,
    };
  }

  // ── 1. Check source has enough input particles ─────────────
  for (const [pid, amount] of Object.entries(eq.input)) {
    const needed = amount * scale;
    const available = source.particles[pid] ?? 0;
    if (available < needed) {
      return {
        success: false,
        reason: `粒子不足: 需要 ${needed} ${pid}，仅有 ${available}`,
        deltas: {},
        totalFlow: 0,
      };
    }
  }

  // ── 2. Execute: deduct inputs from source ──────────────────
  const deltas: Record<ParticleId, number> = {};
  let totalFlow = 0;

  for (const [pid, amount] of Object.entries(eq.input)) {
    const qty = amount * scale;
    source.particles[pid] = (source.particles[pid] ?? 0) - qty;
    deltas[pid] = (deltas[pid] ?? 0) - qty;
    totalFlow += qty;
  }

  // ── 3. Distribute outputs ──────────────────────────────────
  // Core particle → goes to source (entity absorbs it)
  // Non-core particle → goes to ambient (waste / exhaust)
  for (const [pid, amount] of Object.entries(eq.output)) {
    const qty = amount * scale;
    if (pid === coreParticle) {
      source.particles[pid] = (source.particles[pid] ?? 0) + qty;
      deltas[pid] = (deltas[pid] ?? 0) + qty;
    } else {
      ambient.particles[pid] = (ambient.particles[pid] ?? 0) + qty;
      deltas[pid] = (deltas[pid] ?? 0) + qty;
    }
    totalFlow += qty;
  }

  return { success: true, deltas, totalFlow };
}

/**
 * Execute a metabolism (drain) equation.
 * Unlike `solve`, ALL outputs go to ambient (the entity loses everything).
 */
export function solveDrain(
  eq: EquationDef,
  scale: number,
  source: ParticleStore,
  ambient: ParticleStore,
): SolveResult {
  // Conservation check
  const totalIn = sumValues(eq.input) * scale;
  const totalOut = sumValues(eq.output) * scale;
  if (Math.abs(totalIn - totalOut) > 0.001) {
    return {
      success: false,
      reason: `方程式不守恒: input=${totalIn} ≠ output=${totalOut}`,
      deltas: {},
      totalFlow: 0,
    };
  }

  // Check availability
  for (const [pid, amount] of Object.entries(eq.input)) {
    const needed = amount * scale;
    const available = source.particles[pid] ?? 0;
    if (available < needed) {
      // Drain as much as possible
      const actualScale = available / amount;
      if (actualScale <= 0) continue;
      return solveDrain(eq, actualScale, source, ambient);
    }
  }

  const deltas: Record<ParticleId, number> = {};
  let totalFlow = 0;

  // Deduct inputs from source
  for (const [pid, amount] of Object.entries(eq.input)) {
    const qty = amount * scale;
    source.particles[pid] = (source.particles[pid] ?? 0) - qty;
    deltas[pid] = (deltas[pid] ?? 0) - qty;
    totalFlow += qty;
  }

  // ALL outputs to ambient (drain = pure loss)
  for (const [pid, amount] of Object.entries(eq.output)) {
    const qty = amount * scale;
    ambient.particles[pid] = (ambient.particles[pid] ?? 0) + qty;
    deltas[pid] = (deltas[pid] ?? 0) + qty;
    totalFlow += qty;
  }

  return { success: true, deltas, totalFlow };
}

/** Sum all values in a particle record */
function sumValues(record: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(record)) sum += v;
  return sum;
}
