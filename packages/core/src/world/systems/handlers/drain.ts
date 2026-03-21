// ============================================================
// DrainSystem — 被动灵气流失系统 (耗散结构)
//
// 纯被动 System: 无主动 Action，只在 tick 结算当代生态耗散与坍缩。
// ============================================================

import type { EventBus } from "../../../EventBus.js";
import { UNIVERSE } from "../../config/universe.config.js";
import type { AmbientPool, Entity } from "../../types.js";

// -- Handler implementation --

export function executeDrain(
  entities: Entity[],
  ambientPool: AmbientPool,
  tick: number,
  events: EventBus,
): void {
  for (const entity of entities) {
    if (entity.status !== "alive") continue;

    const tankComp = entity.components.tank;
    if (!tankComp) continue;

    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) continue;

    const core = tankComp.coreParticle;
    // For L-type: core=ql, poison=qs. For S-type: core=qs, poison=ql.
    const poison = core === "ql" ? "qs" : "ql";

    const realm = entity.components.cultivation?.realm ?? 1;
    const realmScale = UNIVERSE.drainBase ** (realm - 1);
    const baseDrain = reactor.baseDrainRate;

    // ── Environment state ───────────────────────────────
    const ambientCap = UNIVERSE.ecology.baseAmbientCap || 200;
    const ambientPoison = ambientPool.pools[poison] ?? 0;
    const ambientTotal = (ambientPool.pools.ql ?? 0) + (ambientPool.pools.qs ?? 0);
    const density = Math.min(ambientTotal / ambientCap, 1);
    const poisonRatio = ambientTotal > 0 ? ambientPoison / ambientTotal : 0;

    // ── Mechanism 1: Poison Infiltration (煞气入体 / 灵气入体) ──
    const infiltration = Math.floor(
      baseDrain * realmScale * (Math.exp(UNIVERSE.infiltrationK * poisonRatio * density) - 1),
    );

    // ── Mechanism 2: Core Dissipation (灵气外散 / 煞气外散) ──
    const dissipation = Math.floor(
      baseDrain * realmScale * (Math.exp(UNIVERSE.dissipationK * (1 - density)) - 1),
    );

    // ── Execute Infiltration (detox equation) ──
    const detoxEq = UNIVERSE.equations.detox;
    const coreAvail = tankComp.tanks[core] ?? 0;
    const actualInfiltration = Math.min(infiltration, coreAvail, ambientPoison);

    if (actualInfiltration > 0 && detoxEq) {
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) - actualInfiltration;
      tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actualInfiltration;
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) + actualInfiltration * 2;
    }

    // ── Execute Dissipation (metabolism equation) ──
    const coreAfterDetox = tankComp.tanks[core] ?? 0;
    const actualDissipation = Math.min(dissipation, coreAfterDetox);

    if (actualDissipation > 0) {
      tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actualDissipation;
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) + actualDissipation;
    }

    const totalDrain = actualInfiltration + actualDissipation;

    if (totalDrain <= 0) {
      if ((tankComp.tanks[core] ?? 0) <= 0) {
        chainCollapse(entity, tankComp, ambientPool, tick, events);
      }
      continue;
    }

    events.emit({
      tick,
      type: "entity_drained",
      data: {
        id: entity.id,
        name: entity.name,
        drained: totalDrain,
        infiltration: actualInfiltration,
        dissipation: actualDissipation,
        qiLeft: tankComp.tanks[core] ?? 0,
      },
      message: `「${entity.name}」${actualInfiltration > 0 ? `排毒${actualInfiltration} ` : ""}${actualDissipation > 0 ? `外散${actualDissipation} ` : ""}（剩余 ${tankComp.tanks[core] ?? 0}）`,
    });

    // Death check: core particle depleted
    if ((tankComp.tanks[core] ?? 0) <= 0) {
      chainCollapse(entity, tankComp, ambientPool, tick, events);
    }
  }
}

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
