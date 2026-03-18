// ============================================================
// World — thin coordinator (delegates to systems)
//
// 灵气守恒: Q_total = Q_ambient + Σ Q_entity = 恒定
// ============================================================

import { EventBus } from "../EventBus.js";
import { ActionRegistry } from "../entity/actions/index.js";
import type { ActionId } from "../entity/actions/types.js";
import { createEntity, spawnBeasts, spawnPlants } from "../entity/factory.js";
import { SPECIES } from "../entity/index.js";
import type { Entity, SpeciesType } from "../entity/types.js";
import { doAbsorb } from "./AbsorbSystem.js";
import { doBreakthrough } from "./BreakthroughSystem.js";
import { WORLD_CONFIG } from "./config.js";
import { doDevour } from "./DevourSystem.js";
import { QI_CONFIG, drainAll } from "./qi/index.js";
import type { ActionResult, AvailableAction, WorldEvent, WorldState } from "./types.js";
import type { ActionContext } from "../entity/actions/types.js";


export class World {
  readonly events = new EventBus();
  private readonly state: WorldState;
  private readonly rngRules: Record<SpeciesType, (t: number) => number> = {
    beast: (t) => (t % 15 === 0 ? 0.3 : 0),
    human: (t) => (t % 10 === 0 ? 0.5 : 0.05),
    plant: (t) => (t % 5 === 0 ? 0.8 : 0.1),
  };

  constructor() {
    const totalQi = QI_CONFIG.totalQi;
    const ambientQi = Math.floor(totalQi * QI_CONFIG.initialAmbientRatio);

    this.state = {
      tick: 0,
      qiFlux: 0,
      ambientQi: { current: ambientQi, total: totalQi },
      entities: new Map(),
    };

    const reservedQi = totalQi - ambientQi;
    for (const b of spawnBeasts(
      WORLD_CONFIG.initialBeastCount,
      reservedQi * 0.7,
      this.state.ambientQi,
    )) {
      this.state.entities.set(b.id, b);
    }
    for (const p of spawnPlants(
      WORLD_CONFIG.initialPlantCount,
      reservedQi * 0.3,
      this.state.ambientQi,
    )) {
      this.state.entities.set(p.id, p);
    }
    this.registerHandlers();
  }

  private registerHandlers() {
    ActionRegistry.registerHandler("meditate", doAbsorb);
    ActionRegistry.registerHandler("moonlight", doAbsorb);
    ActionRegistry.registerHandler("photosynth", doAbsorb);
    ActionRegistry.registerHandler("devour", doDevour);
    ActionRegistry.registerHandler("breakthrough", doBreakthrough);
    ActionRegistry.registerHandler("rest", (entity, _actionId, ctx) => {
      const { actionCost, ambientQi } = ctx;
      const qiComp = entity.components.qi;
      if (!qiComp) return { success: false, reason: "实体没有灵气组件" };

      if (qiComp.current <= actionCost) {
        return { success: false, reason: "灵气不足以执行休息" };
      }
      qiComp.current -= actionCost;
      ambientQi.current += actionCost;
      return { success: true, rested: true, actionCost, flux: actionCost };
    });
  }

  // ── Getters ──────────────────────────────────────────────

  get tick(): number {
    return this.state.tick;
  }

  getEntity(id: string): Entity | undefined {
    return this.state.entities.get(id);
  }

  getAliveEntities(species?: SpeciesType): Entity[] {
    const all = [...this.state.entities.values()].filter((e) => e.alive);
    return species ? all.filter((e) => e.species === species) : all;
  }

  getSnapshot() {
    return {
      tick: this.state.tick,
      ambientQi: { ...this.state.ambientQi },
      entities: this.getAliveEntities(),
    };
  }

  // ── Entity Creation ──────────────────────────────────────

  createEntity(name: string, species: SpeciesType): Entity {
    const entity = createEntity(name, species, this.state.ambientQi);
    this.state.entities.set(entity.id, entity);

    const template = SPECIES[species]!;
    this.events.emit({
      tick: this.state.tick,
      type: "entity_created",
      data: { entity: { ...entity } },
      message: `${template.name}「${name}」现世！灵气 ${entity.components.qi?.current ?? 0}`,
    });

    return entity;
  }

  // ── Unified Action Dispatch ──────────────────────────────

  performAction(entityId: string, action: ActionId, targetId?: string): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const entity = this.state.entities.get(entityId);
      if (!entity?.alive) {
        return this.fail("生灵不存在或已消亡", tickEvents);
      }

      // 从 registry 检查物种是否可用此 action
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
        ambientQi: this.state.ambientQi,
        tick: this.state.tick,
        events: this.events
      };

      let target: Entity | undefined;
      if (actionDef.needsTarget) {
        if (!targetId) return this.fail(`${actionDef.name}需要指定目标`, tickEvents);
        target = this.state.entities.get(targetId);
        if (!target?.alive) return this.fail("目标不存在或已消亡", tickEvents);
        ctx.target = target;
      }

      const result = handler(entity, action, ctx);

      // 基于灵气波动的 Tick 推进
      if (result.success && typeof result.flux === "number") {
        this.accumulateFlux(result.flux);
      } else if (result.success && action === "rest") { // rest 也得给点基础时间流逝，比如就是它的 cost
        this.accumulateFlux(ctx.actionCost);
      }

      return {
        success: true,
        tick: this.state.tick,
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
    this.state.qiFlux += amount;
    const threshold = QI_CONFIG.totalQi * 0.01; // 1%
    while (this.state.qiFlux >= threshold) {
      this.state.qiFlux -= threshold;
      this.advanceTick();
    }
  }

  private advanceTick(): void {
    this.state.tick += 1;
    drainAll(this.getAliveEntities(), this.state.ambientQi, this.state.tick, this.events);
    this.events.emit({
      tick: this.state.tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: `--- 第 ${this.state.tick} 天结束 ---`,
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  getAvailableActions(entityId: string): AvailableAction[] {
    const entity = this.state.entities.get(entityId);
    if (!entity?.alive) return [];

    // Get actions from registry based on species
    const speciesActions = ActionRegistry.forSpecies(entity.species);
    const targetCount = this.getAliveEntities().filter((e) => e.id !== entityId).length;

    return speciesActions.map((def) => {
      // Dynamic description enrichment
      let desc = def.description;
      if (def.id === "devour") desc = `${def.name} (${targetCount} 目标)`;
      const cultComp = entity.components.cultivation;
      if (def.id === "breakthrough" && cultComp) {
        const qiComp = entity.components.qi;
        if (qiComp) {
          desc = `${def.name} (${Math.floor((qiComp.current / qiComp.max) * 100)}%)`;
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
    const qiComp = entity.components.qi;
    if (!qiComp || qiComp.current <= def.qiCost) return { ok: false, reason: "灵气不足" };
    
    if (
      def.id === "devour" &&
      this.getAliveEntities().filter((e) => e.id !== entity.id).length === 0
    ) {
      return { ok: false, reason: "没有可吞噬的目标" };
    }
    
    if (def.id === "breakthrough") {
      const cultComp = entity.components.cultivation;
      if (!cultComp) return { ok: false, reason: "没有修为系统" };
      if (qiComp.current / qiComp.max < 0.9) return { ok: false, reason: "灵气未臻圆满" };
      if (cultComp.realm >= 10) return { ok: false, reason: "已是最高境界" };
    }
    return { ok: true };
  }

  private fail<T = unknown>(error: string, events: WorldEvent[]): ActionResult<T> {
    return {
      success: false,
      tick: this.state.tick,
      events,
      availableActions: [],
      error,
    };
  }
}
