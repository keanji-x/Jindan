// ============================================================
// Entity Factory — creating new entities (empty vessels)
//
// 第一守恒定律：粒子只能通过 ParticleTransfer 在容器间转移。
// 生灵诞生只分配空壳（ID + 空 tank），不创造也不消耗粒子。
// 新生灵必须通过打坐/光合等 action 从天地吸取第一口灵气。
// ============================================================

import { nanoid } from "nanoid";
import type { ParticleId } from "./config/types.js";
import { UNIVERSE } from "./config/universe.config.js";
import type { Entity, SpeciesType } from "./types.js";

/** Create a player entity — empty vessel, 0 particles */
export function createEntity(name: string, species: SpeciesType): Entity {
  const reactor = UNIVERSE.reactors[species]!;
  const realm = 1;
  const maxTanks = reactor.baseTanks(realm);

  // 所有粒子槽初始为 0 — 粒子守恒：不凭空创造
  const tanks: Record<ParticleId, number> = {};
  for (const p of UNIVERSE.particles) {
    tanks[p.id] = 0;
  }

  return {
    id: `${species[0]}_${nanoid(8)}`,
    soulId: nanoid(10),
    name,
    species,
    status: "alive",
    sentient: true,
    life: { article: "", events: [] },
    components: {
      tank: { tanks, maxTanks: { ...maxTanks }, coreParticle: reactor.coreParticle },
      cultivation: { realm },
    },
  };
}

/**
 * 通用 NPC 化生工厂 — 空壳 + brain。
 * 粒子守恒：NPC 出生时 tank 为空，由 brain AI 驱动吸纳第一口灵气。
 */
export function spawnNpc(species: string): Entity {
  const reactor = UNIVERSE.reactors[species];
  if (!reactor) throw new Error(`Unknown species: ${species}`);
  if (!reactor.npcNames || reactor.npcNames.length === 0) {
    throw new Error(`Species "${species}" has no npcNames — cannot auto-spawn`);
  }

  const rank = 1 + Math.floor(Math.random() * 2);
  const maxTanks = reactor.baseTanks(rank);

  const tanks: Record<ParticleId, number> = {};
  for (const p of UNIVERSE.particles) {
    tanks[p.id] = 0;
  }

  const name = reactor.npcNames[Math.floor(Math.random() * reactor.npcNames.length)]!;
  const displayName = rank > 1 ? `${rank}阶${name}` : name;

  return {
    id: `${species[0]}_${nanoid(8)}`,
    soulId: nanoid(10),
    name: displayName,
    species,
    status: "alive",
    sentient: false,
    life: { article: "", events: [] },
    components: {
      tank: { tanks, maxTanks: { ...maxTanks }, coreParticle: reactor.coreParticle },
      cultivation: { realm: rank },
      ...(reactor.npcBrainId ? { brain: { id: reactor.npcBrainId } } : {}),
    },
  };
}
