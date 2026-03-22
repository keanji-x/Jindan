// ============================================================
// DrainSystem — 被动灵气流失 (entity → Dao)
//
// v2: Simplified — Dao IS the qi reservoir. No ambient pool.
//   1. Dissipation: entity core qi → Dao core qi (linear drain)
//   2. Death check: core depleted → chainCollapse (all qi → Dao)
//
// No infiltration, no Dao harvest. Equilibrium is automatic:
//   Dao.qi is finite → entities can only absorb what Dao has.
// ============================================================

import type { EventBus } from "../../../EventBus.js";
import { DAO_ENTITY_ID } from "../../World.js";
import { UNIVERSE } from "../../config/universe.config.js";
import type { Entity } from "../../types.js";

// -- Handler implementation --

export function executeDrain(
  entities: Entity[],
  _ambientPool: { pools: Record<string, number>; total: number },
  tick: number,
  events: EventBus,
): void {
  // Find Dao entity — it's the universe's qi sink
  const daoEntity = entities.find((e) => e.id === DAO_ENTITY_ID);
  if (!daoEntity?.components.tank) return;
  const daoTanks = daoEntity.components.tank.tanks;

  for (const entity of entities) {
    if (entity.status !== "alive") continue;
    if (entity.id === DAO_ENTITY_ID) continue; // Dao doesn't drain to itself

    const tankComp = entity.components.tank;
    if (!tankComp) continue;

    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) continue;

    const core = tankComp.coreParticle;

    const realm = entity.components.cultivation?.realm ?? 1;
    const realmScale = UNIVERSE.drainBase ** (realm - 1);
    const baseDrain = reactor.baseDrainRate * UNIVERSE.drainScale;

    // Simple linear dissipation: entity qi flows back to Dao
    const dissipation = Math.floor(baseDrain * realmScale);

    const coreQi = tankComp.tanks[core] ?? 0;
    const actualDissipation = Math.min(dissipation, coreQi);

    if (actualDissipation > 0) {
      tankComp.tanks[core] = coreQi - actualDissipation;
      daoTanks[core] = (daoTanks[core] ?? 0) + actualDissipation;
    }

    if (actualDissipation > 0) {
      events.emit({
        tick,
        type: "entity_drained",
        data: {
          id: entity.id,
          name: entity.name,
          drained: actualDissipation,
          dissipation: actualDissipation,
          qiLeft: tankComp.tanks[core] ?? 0,
        },
        message: `「${entity.name}」外散${actualDissipation}（剩余 ${tankComp.tanks[core] ?? 0}）`,
      });
    }

    // ── Mood natural decay (孤独消磨心境) ──
    const moodComp = entity.components.mood;
    if (moodComp) {
      moodComp.value = Math.max(0, moodComp.value - 0.01);
    }

    // Death check: core particle depleted
    if ((tankComp.tanks[core] ?? 0) <= 0) {
      chainCollapse(entity, tankComp, daoTanks, tick, events);
    }
  }
}

function chainCollapse(
  entity: Entity,
  tankComp: { tanks: Record<string, number>; coreParticle: string },
  daoTanks: Record<string, number>,
  tick: number,
  events: EventBus,
): void {
  // Dump all remaining particles to Dao
  for (const [pid, amount] of Object.entries(tankComp.tanks)) {
    if (amount > 0) {
      daoTanks[pid] = (daoTanks[pid] ?? 0) + amount;
      tankComp.tanks[pid] = 0;
    }
  }

  entity.status = "lingering";

  events.emit({
    tick,
    type: "entity_died",
    data: {
      id: entity.id,
      name: entity.name,
      species: entity.species,
      cause: "链式极性坍缩",
    },
    message: `💀「${entity.name}」反应炉约束场崩塌，化为一阵剧毒煞气狂风，瞬间消散在天地间`,
  });
}

// -- System Export --
