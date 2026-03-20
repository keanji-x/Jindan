import type { StorageBackend } from "../storage/StorageBackend.js";
import type { ParticleId } from "./config/types.js";
import type { QiPoolState } from "./types.js";

export class QiPoolManager {
  public state: QiPoolState;

  constructor(baseCapacity: number, particles: { id: string }[], storage?: StorageBackend) {
    // Check if storage has persisted qi pool data
    if (storage) {
      const persisted = storage.getQiPoolState();
      if (persisted.total > 0) {
        this.state = persisted;
        return;
      }
    }

    // Fresh initialization
    const pools: Record<string, number> = {};
    for (const p of particles) pools[p.id] = 0;

    // The universe starts barren with a base capacity: ql (L-type) and qs (S-type)
    if (particles.find((p) => p.id === "ql")) pools.ql = baseCapacity;
    if (particles.find((p) => p.id === "qs")) pools.qs = Math.floor(baseCapacity * 0.1);

    this.state = {
      pools,
      total: baseCapacity + Math.floor(baseCapacity * 0.1),
    };

    // Persist initial state to storage
    if (storage) {
      storage.setQiPoolState(this.state);
    }
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
