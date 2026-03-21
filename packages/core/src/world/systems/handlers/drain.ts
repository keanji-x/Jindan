// ============================================================
// DrainSystem — 被动灵气流失 + 天道裁决 (双向流Release端)
//
// 纯被动 System: 无主动 Action，只在 tick 结算：
//   1. 基础代谢（生命消耗）
//   2. 天道占比判定 → 超标释放（Drain to counterparty）
//   3. 天道释放（天恩 → 众生）
// ============================================================

import type { EventBus } from "../../../EventBus.js";
import { UNIVERSE } from "../../config/universe.config.js";
import { DaoJudgment } from "../../DaoJudgment.js";
import type { AmbientPool, Entity } from "../../types.js";

// -- Handler implementation --

export function executeDrain(
  entities: Entity[],
  ambientPool: AmbientPool,
  tick: number,
  events: EventBus,
): void {
  const worldTotal = ambientPool.total;

  // ── Phase 1: 基础代谢 + 天道裁决（对每个非Dao实体） ──
  for (const entity of entities) {
    if (entity.status !== "alive") continue;
    if (entity.species === "dao") continue; // 天道自身不参与普通drain

    const tankComp = entity.components.tank;
    if (!tankComp) continue;

    const reactor = UNIVERSE.reactors[entity.species];
    if (!reactor) continue;

    const core = tankComp.coreParticle;
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

    // ── Execute Infiltration ──
    const coreAvail = tankComp.tanks[core] ?? 0;
    const actualInfiltration = Math.min(infiltration, coreAvail, ambientPoison);

    if (actualInfiltration > 0) {
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) - actualInfiltration;
      tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actualInfiltration;
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) + actualInfiltration * 2;
    }

    // ── Execute Dissipation ──
    const coreAfterDetox = tankComp.tanks[core] ?? 0;
    const actualDissipation = Math.min(dissipation, coreAfterDetox);

    if (actualDissipation > 0) {
      tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actualDissipation;
      ambientPool.pools[poison] = (ambientPool.pools[poison] ?? 0) + actualDissipation;
    }

    const totalDrain = actualInfiltration + actualDissipation;

    if (totalDrain > 0) {
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
    }

    // ── Phase 2: 天道裁决 — 占比超标则强制释放回天道 ──
    const currentCoreQi = tankComp.tanks[core] ?? 0;
    if (currentCoreQi > 0) {
      const speciesLimit = reactor.proportionLimit(realm);
      const judgment = DaoJudgment.judge(
        currentCoreQi,
        worldTotal,
        speciesLimit,
        UNIVERSE.daoJudgment.drainRate,
      );

      if (judgment.exceeds && judgment.drainAmount > 0) {
        // 超标粒子强制归还天道（ambient pool）
        const actualDrainBack = Math.min(judgment.drainAmount, tankComp.tanks[core] ?? 0);
        tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actualDrainBack;
        ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + actualDrainBack;

        events.emit({
          tick,
          type: "system_warning",
          data: {
            id: entity.id,
            name: entity.name,
            proportion: judgment.proportion,
            limit: judgment.limit,
            drainAmount: actualDrainBack,
          },
          message: `⚡「${entity.name}」夺天地造化（占比${(judgment.proportion * 100).toFixed(1)}%>${(judgment.limit * 100).toFixed(1)}%），天道降罚回收 ${actualDrainBack} 灵气`,
        });
      }
    }

    // Death check: core particle depleted
    if ((tankComp.tanks[core] ?? 0) <= 0) {
      chainCollapse(entity, tankComp, ambientPool, tick, events);
    }
  }

  // ── Phase 3: 天道释放（天恩雨露） ──
  // 当天道（ambient）占比过高，向众生均匀释放粒子
  const nonDaoEntities = entities.filter(
    (e) => e.status === "alive" && e.species !== "dao" && e.components.tank,
  );

  if (nonDaoEntities.length > 0) {
    const daoQi = (ambientPool.pools.ql ?? 0) + (ambientPool.pools.qs ?? 0);
    const releaseTotal = DaoJudgment.calcRelease(
      daoQi,
      worldTotal,
      nonDaoEntities.length,
      UNIVERSE.daoJudgment.releaseRate,
    );

    if (releaseTotal > 0) {
      // 均分给所有存活非Dao实体，每个实体获得其核心粒子
      const perEntity = Math.floor(releaseTotal / nonDaoEntities.length);
      if (perEntity > 0) {
        for (const e of nonDaoEntities) {
          const tank = e.components.tank!;
          const core = tank.coreParticle;
          const available = ambientPool.pools[core] ?? 0;
          const actual = Math.min(perEntity, available);
          if (actual > 0) {
            ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) - actual;
            tank.tanks[core] = (tank.tanks[core] ?? 0) + actual;
          }
        }

        events.emit({
          tick,
          type: "system_warning",
          data: { releaseTotal, perEntity, entityCount: nonDaoEntities.length },
          message: `🌧️ 天道恩泽，灵气雨露普降，每位生灵获得 ${perEntity} 灵气`,
        });
      }
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
