// ============================================================
// SpawnSystem — 化生法则 (Stateless entity genesis)
//
// 纯被动 System: 无主动 Action，只在 tick 结算新生命的诞生。
// ============================================================

import { UNIVERSE } from "../../config/universe.config.js";
import { spawnBeasts, spawnPlants } from "../../factory.js";
import type { GameSystem, WorldTickContext } from "../GameSystem.js";

// -- Handler implementation --

function executeSpawn(context: WorldTickContext): void {
  const { ambientPool, entities, events, tick, addEntity } = context;
  const eco = UNIVERSE.ecology;

  const ambientQl = ambientPool.pools.ql ?? 0;
  const ambientQs = ambientPool.pools.qs ?? 0;
  const ambientTotal = ambientQl + ambientQs;

  // Need minimum ambient qi to spawn anything
  if (ambientTotal < 20) return;

  const qlRatio = ambientQl / ambientTotal;
  const qsRatio = ambientQs / ambientTotal;

  // Emptiness factor: fewer entities → higher spawn chance (anti-deadworld)
  const aliveCount = entities.length;
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
      addEntity(p);
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
      addEntity(b);
      events.emit({
        tick,
        type: "entity_created",
        data: { id: b.id, name: b.name, species: b.species, source: "化生池" },
        message: `🦟 煞气浓郁，化生「${b.name}」`,
      });
    }
  }
}

// -- System Export --

export const SpawnSystem: GameSystem = {
  id: "spawn",
  name: "化生法则",
  actions: [], // 纯被动系统
  onTick: (context) => {
    executeSpawn(context);
  },
};
