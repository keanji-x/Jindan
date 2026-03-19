// ============================================================
// Entity Factory — creating new entities with Yin-Yang Conservation
//
// v4: Yin-Yang (L vs S) Duality injection.
// ============================================================

import { nanoid } from "nanoid";
import { UNIVERSE } from "../engine/index.js";
import type { ParticleId } from "../engine/types.js";
import type { Entity, SpeciesType } from "./types.js";

/** Minimal interface for ambient pool (avoids circular dep) */
export interface AmbientPoolRef {
  pools: Record<ParticleId, number>;
}

const BEAST_NAMES = ["噬煞蝇", "变异黑蝇", "巨型噬煞蝇", "群居幼蝇", "煞气巡回蝇"];

const PLANT_NAMES = ["碧灵草", "矮壮碧灵草", "幽光碧灵草", "簇生碧草", "变异碧草"];

/** 阴阳同界注入：出生物质的等量逆向反噬 */
function applyYinYangBirth(coreParticle: ParticleId, amount: number, ambient: AmbientPoolRef) {
  const opposite = coreParticle === "ql" ? "sz" : "ql";
  ambient.pools[opposite] = (ambient.pools[opposite] ?? 0) + amount;
}

/** Create a player entity, triggering Yin-Yang inflation */
export function createEntity(name: string, species: SpeciesType, ambient: AmbientPoolRef): Entity {
  const reactor = UNIVERSE.reactors[species]!;
  const realm = 1;
  const maxTanks = reactor.baseTanks(realm);
  const initialCore = Math.floor((maxTanks[reactor.coreParticle] ?? 100) * 0.2);

  // Apply Yin-Yang pollution
  applyYinYangBirth(reactor.coreParticle, initialCore, ambient);

  const tanks: Record<ParticleId, number> = {};
  for (const p of UNIVERSE.particles) {
    tanks[p.id] = p.id === reactor.coreParticle ? initialCore : 0;
  }

  const hasCombat = species === "human" || species === "beast";

  return {
    id: `${species[0]}_${nanoid(8)}`,
    name,
    species,
    alive: true,
    components: {
      tank: { tanks, maxTanks: { ...maxTanks }, coreParticle: reactor.coreParticle },
      cultivation: { realm },
      ...(hasCombat && {
        combat: { power: reactor.basePower(realm) + Math.floor(Math.random() * 3) },
      }),
    },
  };
}

/** Spawn a batch of NPC beasts with brains */
export function spawnBeasts(count: number, ambient: AmbientPoolRef): Entity[] {
  const entities: Entity[] = [];
  const reactor = UNIVERSE.reactors.beast!;

  for (let i = 0; i < count; i++) {
    const rank = 1 + Math.floor(Math.random() * 2);
    const maxTanks = reactor.baseTanks(rank);
    const core = maxTanks[reactor.coreParticle] ?? 100;

    applyYinYangBirth(reactor.coreParticle, core, ambient);

    const tanks: Record<ParticleId, number> = {};
    for (const p of UNIVERSE.particles) {
      tanks[p.id] = p.id === reactor.coreParticle ? core : 0;
    }

    const name = BEAST_NAMES[Math.floor(Math.random() * BEAST_NAMES.length)]!;
    entities.push({
      id: `b_${nanoid(8)}`,
      name: `${rank}阶${name}`,
      species: "beast",
      alive: true,
      components: {
        tank: { tanks, maxTanks: { ...maxTanks }, coreParticle: reactor.coreParticle },
        combat: { power: reactor.basePower(rank) + Math.floor(Math.random() * rank * 2) },
        cultivation: { realm: rank },
        brain: { id: "miasma_brain" },
      },
    });
  }
  return entities;
}

/** Spawn a batch of NPC plants with brains */
export function spawnPlants(count: number, ambient: AmbientPoolRef): Entity[] {
  const entities: Entity[] = [];
  const reactor = UNIVERSE.reactors.plant!;

  for (let i = 0; i < count; i++) {
    const maxTanks = reactor.baseTanks(1);
    const core = maxTanks[reactor.coreParticle] ?? 50;

    applyYinYangBirth(reactor.coreParticle, core, ambient);

    const tanks: Record<ParticleId, number> = {};
    for (const p of UNIVERSE.particles) {
      tanks[p.id] = p.id === reactor.coreParticle ? core : 0;
    }

    const name = PLANT_NAMES[Math.floor(Math.random() * PLANT_NAMES.length)]!;
    entities.push({
      id: `p_${nanoid(8)}`,
      name,
      species: "plant",
      alive: true,
      components: {
        tank: { tanks, maxTanks: { ...maxTanks }, coreParticle: reactor.coreParticle },
        cultivation: { realm: 1 },
        brain: { id: "weed_brain" },
      },
    });
  }
  return entities;
}
