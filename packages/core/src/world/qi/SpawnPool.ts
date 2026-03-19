// ============================================================
// SpawnPool — 化生池 (Stateless entity genesis from ambient qi)
//
// Each tick, monitors ambient ql/qs ratios and entity population
// to probabilistically spawn new entities. Conserves total particles
// by deducting from ambient pool when creating life.
// ============================================================

import type { EventBus } from "../../EventBus.js";
import { UNIVERSE } from "../../engine/index.js";
import { spawnBeasts, spawnPlants } from "../../entity/factory.js";
import type { Entity } from "../../entity/types.js";
import type { AmbientPool } from "../types.js";

interface SpawnResult {
  spawned: Entity[];
}

/**
 * Run the spawn pool logic — stateless, called once per tick.
 *
 * Rules:
 * - qlRatio drives plant spawn chance, qsRatio drives beast spawn chance
 * - At 50/50, both have equal chance
 * - emptinessFactor increases spawn rate when population is low (anti-deadworld)
 * - New entities cost ambient qi (conservation!)
 */
export function runSpawnPool(
  ambientPool: AmbientPool,
  aliveEntities: Entity[],
  events: EventBus,
  tick: number,
): SpawnResult {
  const eco = UNIVERSE.ecology;
  const spawned: Entity[] = [];

  const ambientQl = ambientPool.pools.ql ?? 0;
  const ambientQs = ambientPool.pools.qs ?? 0;
  const ambientTotal = ambientQl + ambientQs;

  // Need minimum ambient qi to spawn anything
  if (ambientTotal < 20) return { spawned };

  const qlRatio = ambientQl / ambientTotal;
  const qsRatio = ambientQs / ambientTotal;

  // Emptiness factor: fewer entities → higher spawn chance (anti-deadworld)
  const aliveCount = aliveEntities.length;
  const emptinessFactor = Math.max(0.1, 1 - aliveCount / eco.maxEntities);

  // Check if we can afford to spawn (need enough ambient qi for entity core)
  const plantReactor = UNIVERSE.reactors.plant;
  const beastReactor = UNIVERSE.reactors.beast;
  const plantCost = plantReactor
    ? (plantReactor.baseTanks(1)[plantReactor.coreParticle] ?? 50)
    : 50;
  const beastCost = beastReactor
    ? (beastReactor.baseTanks(1)[beastReactor.coreParticle] ?? 80)
    : 80;

  // Plant spawn: driven by QL concentration
  const plantChance = eco.spawnBaseChance * qlRatio * emptinessFactor;
  if (Math.random() < plantChance && ambientQl >= plantCost) {
    // Deduct from ambient BEFORE spawning (conservation)
    ambientPool.pools.ql = ambientQl - plantCost;

    const plants = spawnPlants(1, ambientPool);
    for (const p of plants) {
      spawned.push(p);
      events.emit({
        tick,
        type: "entity_created",
        data: { id: p.id, name: p.name, species: p.species, source: "化生池" },
        message: `🌱 天地灵蕴凝聚，化生「${p.name}」`,
      });
    }
  }

  // Beast spawn: driven by QS concentration
  const beastChance = eco.spawnBaseChance * qsRatio * emptinessFactor;
  if (Math.random() < beastChance && ambientQs >= beastCost) {
    // Deduct from ambient BEFORE spawning (conservation)
    ambientPool.pools.qs = (ambientPool.pools.qs ?? 0) - beastCost;

    const beasts = spawnBeasts(1, ambientPool);
    for (const b of beasts) {
      spawned.push(b);
      events.emit({
        tick,
        type: "entity_created",
        data: { id: b.id, name: b.name, species: b.species, source: "化生池" },
        message: `🦟 煞气浓郁，化生「${b.name}」`,
      });
    }
  }

  return { spawned };
}
