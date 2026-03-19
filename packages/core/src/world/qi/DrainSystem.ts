// ============================================================
// DrainSystem — 被动灵气流失 (耗散结构)
//
// v3: Uses metabolism equation via solveDrain. Death check
// uses core particle depletion + chain collapse logic.
// ============================================================

import type { EventBus } from "../../EventBus.js";
import { solveDrain } from "../../engine/EquationSolver.js";
import { UNIVERSE } from "../../engine/index.js";
import type { Entity } from "../../entity/types.js";
import type { AmbientPool } from "../types.js";

/** Apply passive drain to all alive entities. Returns list of entities that died. */
export function drainAll(
  entities: Entity[],
  ambientPool: AmbientPool,
  tick: number,
  events: EventBus,
): Entity[] {
  const died: Entity[] = [];

  for (const entity of entities) {
    if (!entity.alive) continue;

    const tankComp = entity.components.tank;
    if (!tankComp) continue;

    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) continue;

    const core = tankComp.coreParticle;
    const eq = UNIVERSE.equations[reactor.metabolismEq];
    if (!eq) continue;

    // Calculate drain scale based on formula
    const ambientCore = ambientPool.pools[core] ?? 0;
    const drainAmount = UNIVERSE.drainFormula(
      reactor.baseDrainRate,
      ambientPool.total,
      ambientCore,
    );
    const actualDrain = Math.min(Math.floor(drainAmount), tankComp.tanks[core] ?? 0);

    if (actualDrain <= 0) {
      // Check for chain collapse death even with 0 drain
      if ((tankComp.tanks[core] ?? 0) <= 0) {
        chainCollapse(entity, tankComp, ambientPool, tick, events);
        died.push(entity);
      }
      continue;
    }

    // Run the metabolism equation (all outputs → ambient)
    const scale = actualDrain / (eq.input[core] ?? 1);
    solveDrain(
      eq,
      Math.floor(scale),
      { particles: tankComp.tanks },
      { particles: ambientPool.pools },
    );

    events.emit({
      tick,
      type: "entity_drained",
      data: {
        id: entity.id,
        name: entity.name,
        drained: actualDrain,
        qiLeft: tankComp.tanks[core] ?? 0,
      },
      message: `「${entity.name}」灵气流失 ${actualDrain}（剩余 ${tankComp.tanks[core] ?? 0}）`,
    });

    // Death check: core particle depleted
    if ((tankComp.tanks[core] ?? 0) <= 0) {
      chainCollapse(entity, tankComp, ambientPool, tick, events);
      died.push(entity);
    }
  }

  return died;
}

/**
 * Chain-reaction meltdown: when core particle reaches 0,
 * the reactor's containment field collapses. ALL remaining
 * particles in tanks dump to ambient as waste.
 */
function chainCollapse(
  entity: Entity,
  tankComp: { tanks: Record<string, number>; coreParticle: string },
  ambientPool: AmbientPool,
  tick: number,
  events: EventBus,
): void {
  // Dump all remaining particles to ambient
  for (const [pid, amount] of Object.entries(tankComp.tanks)) {
    if (amount > 0) {
      ambientPool.pools[pid] = (ambientPool.pools[pid] ?? 0) + amount;
      tankComp.tanks[pid] = 0;
    }
  }

  entity.alive = false;

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
