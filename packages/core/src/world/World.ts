// ============================================================
// World — thin coordinator (delegates to systems)
//
// v3: Uses AmbientPool (multi-particle), TankComponent,
// v4: Backed by WorldLedger (CQRS Event Sourcing foundation)
// ============================================================

import { EventBus } from "../EventBus.js";
import { UNIVERSE } from "../engine/index.js";
import { ActionRegistry } from "../entity/actions/index.js";
import type { ActionContext, ActionId } from "../entity/actions/types.js";
import { createEntity, spawnBeasts, spawnPlants } from "../entity/factory.js";
import { SPECIES } from "../entity/index.js";
import type { Entity, SpeciesType } from "../entity/types.js";
import { type LedgerEventType, WorldLedger } from "../ledger/index.js";
import { doAbsorb } from "./AbsorbSystem.js";
import { doBreakthrough } from "./BreakthroughSystem.js";
import { WORLD_CONFIG } from "./config.js";
import { doDevour } from "./DevourSystem.js";
import { drainAll } from "./qi/index.js";
import type { ActionResult, AvailableAction, WorldEvent } from "./types.js";

export class World {
  readonly events = new EventBus();
  public readonly ledger: WorldLedger;
  private qiFlux: number = 0;
  private _tick: number = 0;

  constructor() {
    this.ledger = new WorldLedger();

    const totalParticles = UNIVERSE.totalParticles;
    const ambientTotal = Math.floor(totalParticles * UNIVERSE.initialAmbientRatio);
    const reservedParticles = totalParticles - ambientTotal;

    // Spawn NPCs
    for (const b of spawnBeasts(
      WORLD_CONFIG.initialBeastCount,
      reservedParticles * 0.7,
      this.ledger.qiPool.state,
    )) {
      this.ledger.setEntity(b);
    }
    for (const p of spawnPlants(
      WORLD_CONFIG.initialPlantCount,
      reservedParticles * 0.3,
      this.ledger.qiPool.state,
    )) {
      this.ledger.setEntity(p);
    }
    this.registerHandlers();

    // Ledger intercepter: convert WorldEvents into LedgerEvents
    // This is the first step towards CQRS: recording the events into the Graph.
    this.events.onAny((event) => {
      let sourceId = "WORLD";
      let targetId: string | undefined;

      if (event.data.entity) sourceId = (event.data.entity as { id: string }).id;
      else if (event.data.winner) sourceId = (event.data.winner as { id: string }).id;

      if (event.data.loser) targetId = (event.data.loser as { id: string }).id;
      else if (event.data.target) targetId = (event.data.target as { id: string }).id;

      this.ledger.recordEvent({
        tick: event.tick,
        sourceId,
        targetId,
        type: event.type as unknown as LedgerEventType,
        data: event.data,
      });
    });
  }

  private registerHandlers() {
    ActionRegistry.registerHandler("meditate", doAbsorb);
    ActionRegistry.registerHandler("moonlight", doAbsorb);
    ActionRegistry.registerHandler("photosynth", doAbsorb);
    ActionRegistry.registerHandler("devour", doDevour);
    ActionRegistry.registerHandler("breakthrough", doBreakthrough);
    ActionRegistry.registerHandler("rest", (entity, _actionId, ctx) => {
      const { actionCost, ambientPool } = ctx;
      const tankComp = entity.components.tank;
      if (!tankComp) return { success: false, reason: "实体没有粒子储罐" };

      const core = tankComp.coreParticle;
      if ((tankComp.tanks[core] ?? 0) <= actionCost) {
        return { success: false, reason: "灵气不足以执行休息" };
      }
      tankComp.tanks[core] = (tankComp.tanks[core] ?? 0) - actionCost;
      ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + actionCost;
      return { success: true, rested: true, actionCost, flux: actionCost };
    });
  }

  // ── Getters ──────────────────────────────────────────────

  get tick(): number {
    return this._tick;
  }

  getEntity(id: string): Entity | undefined {
    return this.ledger.getEntity(id);
  }

  getAliveEntities(species?: SpeciesType): Entity[] {
    const all = this.ledger.getAliveEntities();
    return species ? all.filter((e) => e.species === species) : all;
  }

  getSnapshot() {
    return {
      tick: this._tick,
      ambientPool: { ...this.ledger.qiPool.state, pools: { ...this.ledger.qiPool.state.pools } },
      entities: this.getAliveEntities(),
    };
  }

  // ── Entity Creation ──────────────────────────────────────

  createEntity(name: string, species: SpeciesType): Entity {
    const entity = createEntity(name, species, this.ledger.qiPool.state);
    this.ledger.setEntity(entity);

    const reactor = UNIVERSE.reactors[species];
    const displayName = reactor?.name ?? species;
    const coreCurrent = entity.components.tank?.tanks[entity.components.tank.coreParticle] ?? 0;

    this.events.emit({
      tick: this._tick,
      type: "entity_created",
      data: { entity: { ...entity } },
      message: `${displayName}「${name}」现世！灵气 ${coreCurrent}`,
    });

    return entity;
  }

  // ── Unified Action Dispatch ──────────────────────────────

  performAction(entityId: string, action: ActionId, targetId?: string): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const entity = this.ledger.getEntity(entityId);
      if (!entity?.alive) {
        return this.fail("生灵不存在或已消亡", tickEvents);
      }

      const actionDef = ActionRegistry.get(action);
      if (!actionDef) {
        return this.fail(`未知行动: ${action}`, tickEvents);
      }
      if (!actionDef.species.includes(entity.species)) {
        const speciesName = SPECIES[entity.species]?.name ?? entity.species;
        return this.fail(`${speciesName}无法执行「${actionDef.name}」`, tickEvents);
      }

      const handler = ActionRegistry.getHandler(action);
      if (!handler) {
        return this.fail(`行动「${actionDef.name}」未实装(缺少Handler)`, tickEvents);
      }

      const cost = actionDef.qiCost;
      const ctx: ActionContext = {
        actionCost: cost,
        ambientPool: this.ledger.qiPool.state,
        tick: this._tick,
        events: this.events,
      };

      let target: Entity | undefined;
      if (actionDef.needsTarget) {
        if (!targetId) return this.fail(`${actionDef.name}需要指定目标`, tickEvents);
        target = this.ledger.getEntity(targetId);
        if (!target?.alive) return this.fail("目标不存在或已消亡", tickEvents);
        ctx.target = target;
      }

      const result = handler(entity, action, ctx);

      // Flux-based tick advancement
      if (result.success && typeof result.flux === "number") {
        this.accumulateFlux(result.flux);
      } else if (result.success && action === "rest") {
        this.accumulateFlux(ctx.actionCost);
      }

      return {
        success: true,
        tick: this._tick,
        result,
        events: tickEvents,
        availableActions: entity.alive ? this.getAvailableActions(entityId) : [],
      };
    } finally {
      unsub();
    }
  }

  // ── Tick Engine ──────────────────────────────────────────

  private accumulateFlux(amount: number) {
    this.qiFlux += amount;
    const threshold = UNIVERSE.totalParticles * 0.01; // 1%
    while (this.qiFlux >= threshold) {
      this.qiFlux -= threshold;
      this.advanceTick();
    }
  }

  private advanceTick(): void {
    this._tick += 1;
    drainAll(this.getAliveEntities(), this.ledger.qiPool.state, this._tick, this.events);
    this.events.emit({
      tick: this._tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: `--- 第 ${this._tick} 天结束 ---`,
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  getAvailableActions(entityId: string): AvailableAction[] {
    const entity = this.ledger.getEntity(entityId);
    if (!entity?.alive) return [];

    const speciesActions = ActionRegistry.forSpecies(entity.species);
    const targetCount = this.getAliveEntities().filter((e) => e.id !== entityId).length;

    return speciesActions.map((def) => {
      let desc = def.description;
      if (def.id === "devour") desc = `${def.name} (${targetCount} 目标)`;
      const cultComp = entity.components.cultivation;
      if (def.id === "breakthrough" && cultComp) {
        const tankComp = entity.components.tank;
        if (tankComp) {
          const core = tankComp.coreParticle;
          const ratio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
          desc = `${def.name} (${Math.floor(ratio * 100)}%)`;
        }
      }

      const check = this.canAct(entity, def);
      return {
        action: def.id as ActionId,
        description: desc,
        possible: check.ok,
        reason: check.ok ? undefined : check.reason,
      };
    });
  }

  private canAct(
    entity: Entity,
    def: { id: string; qiCost: number; needsTarget: boolean },
  ): { ok: boolean; reason?: string } {
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const core = tankComp.coreParticle;
    if ((tankComp.tanks[core] ?? 0) <= def.qiCost) return { ok: false, reason: "灵气不足" };

    if (
      def.id === "devour" &&
      this.getAliveEntities().filter((e) => e.id !== entity.id).length === 0
    ) {
      return { ok: false, reason: "没有可吞噬的目标" };
    }

    if (def.id === "breakthrough") {
      const cultComp = entity.components.cultivation;
      if (!cultComp) return { ok: false, reason: "没有修为系统" };
      const coreRatio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
      if (coreRatio < 0.9) return { ok: false, reason: "灵气未臻圆满" };
      if (cultComp.realm >= 10) return { ok: false, reason: "已是最高境界" };
    }
    return { ok: true };
  }

  private fail<T = unknown>(error: string, events: WorldEvent[]): ActionResult<T> {
    return {
      success: false,
      tick: this._tick,
      events,
      availableActions: [],
      error,
    };
  }
}
