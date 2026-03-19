// ============================================================
// Entity Factory — creating new entities with particle conservation
//
// v3: Uses ReactorTemplate to initialize TankComponent.
// ============================================================

import { nanoid } from "nanoid";
import { UNIVERSE } from "../engine/index.js";
import type { ParticleId, ReactorTemplate } from "../engine/types.js";
import type { Entity, SpeciesType } from "./types.js";

/** Minimal interface for ambient pool (avoids circular dep) */
export interface AmbientPoolRef {
  pools: Record<ParticleId, number>;
}

const BEAST_NAMES = [
  "赤焰虎",
  "碧水蛟",
  "风翼鹰",
  "玄铁熊",
  "紫电狼",
  "幽冥蛇",
  "金鬃狮",
  "霜角鹿",
  "烈焰蝠",
  "寒霜蜘蛛",
  "青鳞蟒",
  "银月狐",
  "雷云豹",
  "铁甲龟",
  "血影鹤",
];

const PLANT_NAMES = [
  "碧灵草",
  "七星莲",
  "紫薇藤",
  "玄冰花",
  "赤炎果",
  "月华兰",
  "龙血木",
  "星辰菌",
  "凝露苔",
  "灵脉根",
];

/** Helper: total core particles available from ambient */
function coreAvailable(reactor: ReactorTemplate, ambient: AmbientPoolRef): number {
  return ambient.pools[reactor.coreParticle] ?? 0;
}

/** Create a player entity, deducting initial particles from ambient */
export function createEntity(name: string, species: SpeciesType, ambient: AmbientPoolRef): Entity {
  const reactor = UNIVERSE.reactors[species]!;
  const realm = 1;
  const maxTanks = reactor.baseTanks(realm);
  const coreMax = maxTanks[reactor.coreParticle] ?? 0;
  const initialCore = Math.min(coreMax, coreAvailable(reactor, ambient));
  ambient.pools[reactor.coreParticle] = (ambient.pools[reactor.coreParticle] ?? 0) - initialCore;

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

/** Spawn a batch of NPC beasts */
export function spawnBeasts(count: number, totalCore: number, ambient: AmbientPoolRef): Entity[] {
  const perEntity = Math.floor(totalCore / count);
  const entities: Entity[] = [];
  const reactor = UNIVERSE.reactors.beast!;

  for (let i = 0; i < count; i++) {
    const rank = 1 + Math.floor(Math.random() * 3);
    const maxTanks = reactor.baseTanks(rank);
    const coreMax = maxTanks[reactor.coreParticle] ?? 0;
    const core = Math.min(perEntity, coreMax);
    ambient.pools[reactor.coreParticle] = (ambient.pools[reactor.coreParticle] ?? 0) - core;

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
      },
    });
  }
  return entities;
}

/** Spawn a batch of NPC plants */
export function spawnPlants(count: number, totalCore: number, ambient: AmbientPoolRef): Entity[] {
  const perEntity = Math.floor(totalCore / count);
  const entities: Entity[] = [];
  const reactor = UNIVERSE.reactors.plant!;

  for (let i = 0; i < count; i++) {
    const maxTanks = reactor.baseTanks(1);
    const coreMax = maxTanks[reactor.coreParticle] ?? 0;
    const core = Math.min(perEntity, coreMax);
    ambient.pools[reactor.coreParticle] = (ambient.pools[reactor.coreParticle] ?? 0) - core;

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
      },
    });
  }
  return entities;
}
