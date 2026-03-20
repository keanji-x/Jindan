// ============================================================
// World — thin coordinator (delegates to systems)
//
// v3: Uses AmbientPool (multi-particle), TankComponent,
// v4: Backed by WorldLedger (CQRS Event Sourcing foundation)
// ============================================================

import { EventBus } from "../EventBus.js";
import { BALANCE } from "../engine/balance.config.js";
import { UNIVERSE } from "../engine/index.js";
import { applyParams } from "../engine/TunableParams.js";
import { doChat } from "../entity/actions/chat.js";
import { ActionRegistry } from "../entity/actions/index.js";
import type { ActionContext, ActionId } from "../entity/actions/types.js";
import { createEntity } from "../entity/factory.js";
import { SPECIES } from "../entity/index.js";
import type { Entity, Life, SpeciesType } from "../entity/types.js";
import { type EntityHistory, type LedgerEventType, WorldLedger } from "../ledger/index.js";
import type { StorageBackend } from "../storage/StorageBackend.js";
import { doAbsorb } from "./AbsorbSystem.js";
import { doBreakthrough } from "./BreakthroughSystem.js";
import { doDevour } from "./DevourSystem.js";
import { drainAll } from "./qi/index.js";
import { runSpawnPool } from "./qi/SpawnPool.js";
import type { ActionResult, AvailableAction, WorldEvent } from "./types.js";

export class World {
  readonly events = new EventBus();
  public readonly ledger: WorldLedger;
  private _tick: number = 0;

  constructor(storage?: StorageBackend) {
    // Apply SA-optimized balance params
    applyParams(BALANCE);

    this.ledger = new WorldLedger(storage);
    this.registerHandlers();

    // Restore tick from persisted storage
    if (storage) {
      this._tick = storage.getTick();
    }

    // Ledger intercepter: convert WorldEvents into LedgerEvents
    // This is the first step towards CQRS: recording the events into the Graph.
    this.events.onAny((event) => {
      let sourceId = "WORLD";
      let targetId: string | undefined;

      // Extract entity IDs from various event data shapes
      if (event.data.entity) sourceId = (event.data.entity as { id: string }).id;
      else if (event.data.winner) sourceId = (event.data.winner as { id: string }).id;
      else if (typeof event.data.id === "string") sourceId = event.data.id;

      if (event.data.loser) targetId = (event.data.loser as { id: string }).id;
      else if (event.data.target) targetId = (event.data.target as { id: string }).id;

      const recorded = this.ledger.recordEvent({
        tick: event.tick,
        sourceId,
        targetId,
        type: event.type as unknown as LedgerEventType,
        data: event.data,
      });

      // Track event ID in entity's life.events (skip entombed entities)
      const srcEntity = this.ledger.getEntity(sourceId);
      if (srcEntity && srcEntity.status !== "entombed") srcEntity.life.events.push(recorded.id);
      if (targetId) {
        const tgtEntity = this.ledger.getEntity(targetId);
        if (tgtEntity && tgtEntity.status !== "entombed") tgtEntity.life.events.push(recorded.id);
      }
    });
  }

  private registerHandlers() {
    ActionRegistry.registerHandler("meditate", doAbsorb);
    ActionRegistry.registerHandler("moonlight", doAbsorb);
    ActionRegistry.registerHandler("photosynth", doAbsorb);
    ActionRegistry.registerHandler("devour", doDevour);
    ActionRegistry.registerHandler("breakthrough", doBreakthrough);
    ActionRegistry.registerHandler("chat", doChat);
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
      return { success: true, rested: true, actionCost };
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

  /** 获取所有已死的有灵智实体 (lingering + entombed) */
  getDeadEntities(): Entity[] {
    return this.ledger
      .getAllEntities()
      .filter((e) => e.sentient && (e.status === "lingering" || e.status === "entombed"));
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

  performAction(
    entityId: string,
    action: ActionId,
    targetId?: string,
    payload?: unknown,
  ): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const entity = this.ledger.getEntity(entityId);
      if (!entity || entity.status !== "alive") {
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
        payload,
      };

      let target: Entity | undefined;
      if (actionDef.needsTarget) {
        if (!targetId) return this.fail(`${actionDef.name}需要指定目标`, tickEvents);
        target = this.ledger.getEntity(targetId);
        if (!target || target.status !== "alive")
          return this.fail("目标不存在或已消亡", tickEvents);
        ctx.target = target;
      }

      const result = handler(entity, action, ctx);

      // If handler itself failed, propagate failure
      if (!result.success) {
        return {
          success: false,
          tick: this._tick,
          result,
          events: tickEvents,
          error: (result.reason as string) ?? "行动执行失败",
          recentEvents: this.ledger.graph.getRecentForEntity(entityId),
          availableActions: entity.status === "alive" ? this.getAvailableActions(entityId) : [],
        };
      }

      return {
        success: true,
        tick: this._tick,
        result,
        events: tickEvents,
        recentEvents: this.ledger.graph.getRecentForEntity(entityId),
        availableActions: entity.status === "alive" ? this.getAvailableActions(entityId) : [],
      };
    } finally {
      unsub();
    }
  }

  // ── Tick Engine ──────────────────────────────────────────
  // settle() advances one tick. Callers inject this on their schedule:
  //   - ApiServer: setInterval(() => world.settle(), 1000)
  //   - Tests:     world.settle() called directly (deterministic)

  /** 结算一轮天道运转 — 推进一个 tick */
  settle(): void {
    this.advanceTick();
  }

  private advanceTick(): void {
    this._tick += 1;
    this.ledger.storage.setTick(this._tick);
    const aliveEntities = this.getAliveEntities();

    // 1. 结算固有消耗 (气血流失)
    drainAll(aliveEntities, this.ledger.qiPool.state, this._tick, this.events);

    // 2. 动态容量结算与虚空放逐 (防刷核心机制)
    const eco = UNIVERSE.ecology;
    let maxCap = eco.baseAmbientCap;
    for (const e of aliveEntities) {
      if (e.species === "human") maxCap += eco.ambientCapPerHuman;
      else if (e.species === "beast") maxCap += eco.ambientCapPerBeast;
      else if (e.species === "plant") maxCap += eco.ambientCapPerPlant;
    }
    const ambient = this.ledger.qiPool.state;
    if ((ambient.pools.ql ?? 0) > maxCap) ambient.pools.ql = maxCap;
    if ((ambient.pools.qs ?? 0) > maxCap) ambient.pools.qs = maxCap;

    // 3. 后台 AI (原生行为树) 现已转为 Actor 模型，由外部 (如 ApiServer) 定时驱动。

    // 4. 化生池：天地灵蕴自发凝聚为新生命
    const { spawned } = runSpawnPool(ambient, aliveEntities, this.events, this._tick);
    for (const e of spawned) this.ledger.setEntity(e);

    this.events.emit({
      tick: this._tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: `--- 第 ${this._tick} 天结束 ---`,
    });

    // Flush dirty state to persistent storage
    this.ledger.flush().catch((err) => {
      console.error("[World] 持久化 flush 失败:", err);
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  getAvailableActions(entityId: string, maxSamples: number = 16): AvailableAction[] {
    const entity = this.ledger.getEntity(entityId);
    if (!entity || entity.status !== "alive") return [];

    const speciesActions = ActionRegistry.forSpecies(entity.species);
    const aliveTargets = this.getAliveEntities().filter((e) => e.id !== entityId);
    const allOptions: AvailableAction[] = [];

    for (const def of speciesActions) {
      const check = this.canAct(entity, def);
      if (!check.ok) {
        let desc = def.name;
        if (def.id === "breakthrough") {
          const cultComp = entity.components.cultivation;
          const tankComp = entity.components.tank;
          if (cultComp && tankComp) {
            const core = tankComp.coreParticle;
            const ratio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
            desc = `${def.name} (${Math.floor(ratio * 100)}%)`;
          }
        }
        allOptions.push({
          action: def.id as ActionId,
          description: desc,
          possible: false,
          reason: check.reason,
        });
        continue;
      }

      if (def.needsTarget) {
        // NPC (has brain) should not auto-target players (no brain) for devour
        const isNpc = !!entity.components.brain;
        const targets =
          isNpc && def.id === "devour"
            ? aliveTargets.filter((t) => !!t.components.brain)
            : aliveTargets;

        for (const t of targets) {
          allOptions.push({
            action: def.id as ActionId,
            targetId: t.id,
            description: `${def.name} -> ${t.name}(${t.id}) [Role: ${t.species}]`,
            possible: true,
          });
        }
      } else {
        let desc = def.name;
        if (def.id === "breakthrough") desc = `${def.name} (Ready!)`;

        allOptions.push({
          action: def.id as ActionId,
          description: desc,
          possible: true,
        });
      }
    }

    const possibleActions = allOptions.filter((a) => a.possible);
    const impossibleActions = allOptions.filter((a) => !a.possible);

    // 随机采样 possible 的 Action
    possibleActions.sort(() => Math.random() - 0.5);
    const sampled = possibleActions.slice(0, maxSamples);

    return [...sampled, ...impossibleActions];
  }

  private canAct(
    entity: Entity,
    def: { id: string; qiCost: number; needsTarget: boolean },
  ): { ok: boolean; reason?: string } {
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const core = tankComp.coreParticle;
    if ((tankComp.tanks[core] ?? 0) < def.qiCost) return { ok: false, reason: "灵气不足" };

    if (
      def.id === "devour" &&
      this.getAliveEntities().filter((e) => e.id !== entity.id).length === 0
    ) {
      return { ok: false, reason: "没有可吞噬的目标" };
    }

    if (def.id === "breakthrough") {
      const cultComp = entity.components.cultivation;
      if (!cultComp) return { ok: false, reason: "没有修为系统" };
      const bt = UNIVERSE.breakthrough;
      const coreRatio = (tankComp.tanks[core] ?? 0) / (tankComp.maxTanks[core] ?? 1);
      if (coreRatio < bt.minQiRatio) return { ok: false, reason: "灵气未臻圆满" };
      if (cultComp.realm >= 10) return { ok: false, reason: "已是最高境界" };
    }
    return { ok: true };
  }

  private fail<T = unknown>(
    error: string,
    events: WorldEvent[],
    entityId?: string,
  ): ActionResult<T> {
    return {
      success: false,
      tick: this._tick,
      events,
      recentEvents: entityId ? this.ledger.graph.getRecentForEntity(entityId) : [],
      availableActions: [],
      error,
    };
  }

  // ── 坟墓系统 (Tomb System) ─────────────────────────────

  /** 查询生灵的生死状态与生平 */
  getLifeStatus(entityId: string): { status: string; life: Life } | undefined {
    const entity = this.ledger.getEntity(entityId);
    if (!entity) return undefined;
    return { status: entity.status, life: entity.life };
  }

  /**
   * 游魂执行盖棺定论：将 article + events 聚合为墓志铭，然后安息。
   * 只有 status === "lingering" 的实体可以执行。
   */
  performTomb(
    entityId: string,
    callerEpitaph?: string,
  ): {
    success: boolean;
    epitaph?: string;
    snapshot?: { events: string[]; history: EntityHistory };
    error?: string;
  } {
    const entity = this.ledger.getEntity(entityId);
    if (!entity) return { success: false, error: "实体不存在" };
    if (entity.status !== "lingering") {
      return { success: false, error: `实体状态为「${entity.status}」，只有游魂才能盖棺定论` };
    }

    // 1. Snapshot: pull all events from this life
    const history = this.ledger.graph.getEntityHistory(entityId);
    const allLifeEvents = entity.life.events;

    // 2. Build epitaph
    const previousArticle = entity.life.article;

    let epitaph: string;
    if (callerEpitaph) {
      // Use the caller-provided epitaph (e.g. LLM-generated)
      epitaph = previousArticle ? `${previousArticle}\n\n---\n\n${callerEpitaph}` : callerEpitaph;
    } else {
      // Fallback: aggregate raw event summary
      const eventSummaryLines: string[] = [];
      const allEvents = [...history.actionsInitiated, ...history.actionsReceived];
      allEvents.sort((a, b) => a.tick - b.tick);
      for (const evt of allEvents) {
        const direction = evt.sourceId === entityId ? "→" : "←";
        const other = evt.sourceId === entityId ? (evt.targetId ?? "天地") : evt.sourceId;
        const dataStr = evt.data ? JSON.stringify(evt.data) : "";
        eventSummaryLines.push(`[第${evt.tick}天] ${direction} ${evt.type} (${other}) ${dataStr}`);
      }
      const lifeChapter = eventSummaryLines.join("\n");
      epitaph = previousArticle ? `${previousArticle}\n\n---\n\n${lifeChapter}` : lifeChapter;
    }

    // 3. Entomb: update entity state
    entity.status = "entombed";
    entity.life.article = epitaph;
    entity.life.events = [];

    // 4. Emit event
    this.events.emit({
      tick: this._tick,
      type: "entity_tomb",
      data: {
        entity: { id: entity.id, name: entity.name, species: entity.species },
        epitaph,
      },
      message: `🪦「${entity.name}」盖棺定论，魂归安息`,
    });

    return {
      success: true,
      epitaph,
      snapshot: { events: allLifeEvents, history },
    };
  }

  /**
   * 转生：从安息实体的墓志铭创建新生灵，继承前世 article。
   * 只有 status === "entombed" 的实体可以转生。
   */
  reincarnate(
    entityId: string,
    newName: string,
    newSpecies: SpeciesType,
  ): { success: boolean; entity?: Entity; error?: string } {
    const oldEntity = this.ledger.getEntity(entityId);
    if (!oldEntity) return { success: false, error: "实体不存在" };
    if (oldEntity.status !== "entombed") {
      return { success: false, error: `实体状态为「${oldEntity.status}」，只有安息者才能转生` };
    }

    // Create new entity
    const newEntity = createEntity(newName, newSpecies, this.ledger.qiPool.state);
    // Inherit soul identity and article from past life
    newEntity.soulId = oldEntity.soulId;
    newEntity.life.article = oldEntity.life.article;
    this.ledger.setEntity(newEntity);

    this.events.emit({
      tick: this._tick,
      type: "entity_reincarnated",
      data: {
        oldEntity: { id: oldEntity.id, name: oldEntity.name, species: oldEntity.species },
        newEntity: { id: newEntity.id, name: newEntity.name, species: newEntity.species },
        articleLength: newEntity.life.article.length,
      },
      message: `🔄「${oldEntity.name}」转生为「${newName}」，携带前世记忆（${newEntity.life.article.length}字）`,
    });

    return { success: true, entity: newEntity };
  }
}
