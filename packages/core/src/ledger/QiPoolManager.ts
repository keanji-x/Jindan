import type { ParticleId } from "../engine/types.js";
import type { QiPoolState } from "./types.js";

export class QiPoolManager {
  public state: QiPoolState;

  constructor(baseCapacity: number, particles: { id: string }[]) {
    const pools: Record<string, number> = {};
    for (const p of particles) pools[p.id] = 0;

    // The universe starts barren with a base capacity, e.g. 100 ql, 10 sz
    if (particles.find((p) => p.id === "ql")) pools.ql = baseCapacity;
    if (particles.find((p) => p.id === "sz")) pools.sz = Math.floor(baseCapacity * 0.1);

    this.state = {
      pools,
      total: baseCapacity * 1.1, // Now total is just a tracked snapshot value or kept for legacy
    };
  }

  getSnapshot(): QiPoolState {
    return {
      total: this.state.total,
      pools: { ...this.state.pools },
    };
  }

  getAmount(particle: ParticleId): number {
    return this.state.pools[particle] || 0;
  }

  add(particle: ParticleId, amount: number): void {
    const current = this.state.pools[particle] || 0;
    this.state.pools[particle] = current + amount;
  }

  take(particle: ParticleId, amount: number): boolean {
    const current = this.state.pools[particle] || 0;
    if (current < amount) return false;
    this.state.pools[particle] = current - amount;
    return true;
  }
}
