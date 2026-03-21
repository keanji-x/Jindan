// ============================================================
// SpawnSystem — 化生法则 (Stateless entity genesis)
//
// 纯被动 System: 无主动 Action，只在 tick 结算新生命的诞生。
// 委托 BeingLedger 做生态平衡决策，自身只负责执行。
//
// 粒子守恒：化生时从 ambient 通过 ParticleTransfer 注入粒子，
// 绝不凭空创造——粒子从天地转移到实体，总量不变。
// ============================================================

import { BeingLedger } from "../../beings/BeingLedger.js";
import { UNIVERSE } from "../../config/universe.config.js";
import { spawnNpc } from "../../factory.js";
import { ParticleTransfer } from "../../reactor/ParticleTransfer.js";
import type { Entity } from "../../types.js";
import type { GameSystem, WorldTickContext } from "../GameSystem.js";

/** 从 ambient 转移粒子填满新生灵的 tank（守恒） */
function fillFromAmbient(entity: Entity, context: WorldTickContext): void {
  const tank = entity.components.tank;
  if (!tank) return;
  // 将 maxTanks 作为转移请求量 — 实际转移量受 ambient 余额限制
  ParticleTransfer.transfer(context.ambientPool.pools, tank.tanks, { ...tank.maxTanks });
}

function executeSpawn(context: WorldTickContext): void {
  const { ambientPool, entities, deadEntities, events, tick, addEntity, reincarnateEntity } =
    context;
  const eco = UNIVERSE.ecology;

  // 概率守门 — 不是每个 tick 都化生
  if (Math.random() > eco.spawnBaseChance) return;

  // 问地府：该化生什么？
  const decision = BeingLedger.acquire(
    ambientPool,
    entities,
    deadEntities,
    UNIVERSE.totalParticles,
  );
  if (!decision) return;

  const reactor = UNIVERSE.reactors[decision.species];
  if (!reactor) return;

  if (decision.reincarnateFrom) {
    // ── 轮回 ──────────────────────────────────────────────
    const npcNames = reactor.npcNames ?? [];
    const newName = npcNames[Math.floor(Math.random() * npcNames.length)] ?? "无名";
    const result = reincarnateEntity(decision.reincarnateFrom, newName, decision.species);

    if (result.success && result.entity) {
      // 转世后从天地灌注粒子
      fillFromAmbient(result.entity, context);

      events.emit({
        tick,
        type: "entity_created",
        data: {
          id: result.entity.id,
          name: result.entity.name,
          species: result.entity.species,
          source: "轮回",
        },
        message: `🔄 亡灵转世，「${result.entity.name}」重返人间`,
      });
    }
  } else {
    // ── 新生（从天地灌注粒子，守恒转移） ─────────────────
    const entity = spawnNpc(decision.species);
    fillFromAmbient(entity, context);
    addEntity(entity);

    events.emit({
      tick,
      type: "entity_created",
      data: {
        id: entity.id,
        name: entity.name,
        species: entity.species,
        source: "化生池",
      },
      message: `🌱 天地灵蕴凝聚，化生「${entity.name}」`,
    });
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
