import type { ParticleId } from "../engine/types.js";
import type { QiPoolState } from "./types.js";

export class QiPoolManager {
  public state: QiPoolState;

  constructor(totalParticles: number, initialAmbientRatio: number, particles: { id: string }[]) {
    const ambientTotal = Math.floor(totalParticles * initialAmbientRatio);
    const pools: Record<string, number> = {};
    for (const p of particles) pools[p.id] = 0;

    if (particles.length > 0) {
      pools[particles[0]!.id] = ambientTotal;
    }

    this.state = {
      pools,
      total: totalParticles,
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
