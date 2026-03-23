import { nanoid } from "nanoid";
import { randomPersonality } from "./brains/optimizer/PersonalityObjective.js";
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
      finalName = reactor.npcNames[Math.floor(Math.random() * reactor.npcNames.length)]!;
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

  // 按物种倾向随机生成性格（非 dao 实体才有性格）
  const personality = species !== "dao" ? randomPersonality(species) : undefined;

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
      ...(brainId ? { brain: { id: brainId, replyMode: "auto" as const } } : {}),
      ...(personality ? { personality } : {}),
    },
  };

  return entity;
}
