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
import type { Entity } from "./types.js";

export interface SpawnOptions {
  realm?: number;
  brainId?: string | null;
  sentient?: boolean;
}

/** Create a new entity. If name is empty, it generates one based on the species config. */
export function createEntity(name: string, species: string, options: SpawnOptions = {}): Entity {
  const reactor = UNIVERSE.reactors[species];
  if (!reactor) throw new Error(`Unknown species: ${species}`);

  const realm = options.realm ?? 1;

  // Name resolution
  let finalName = name;
  if (!finalName) {
    if (reactor.npcNames && reactor.npcNames.length > 0) {
      const baseName = reactor.npcNames[Math.floor(Math.random() * reactor.npcNames.length)]!;
      finalName = realm > 1 ? `${realm}阶${baseName}` : baseName;
    } else {
      finalName = `无名${reactor.name || species}`;
    }
  }

  // 所有粒子槽初始为 0 — 粒子守恒：不凭空创造
  const tanks: Record<ParticleId, number> = {};
  for (const p of UNIVERSE.particles) {
    tanks[p.id] = 0;
  }

  // 默认挂载物种配置的AI大脑，除非显式覆盖
  const brainId = options.brainId !== undefined ? options.brainId : reactor.npcBrainId;

  const entity: Entity = {
    id: `${species[0]}_${nanoid(8)}`,
    soulId: nanoid(10),
    name: finalName,
    species,
    status: "alive",
    sentient: options.sentient ?? true,
    life: { article: "", events: [] },
    components: {
      tank: { tanks, coreParticle: reactor.coreParticle },
      cultivation: { realm },
      mood: { value: 0.5 },
      ...(brainId ? { brain: { id: brainId } } : {}),
    },
  };

  return entity;
}
