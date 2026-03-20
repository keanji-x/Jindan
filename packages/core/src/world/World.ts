// ============================================================
// World — thin coordinator (owns all structured state)
//
// v5: WorldLedger dissolved. World directly owns:
//   - Entity CRUD (via StorageBackend)
//   - QiPoolManager (ambient qi)
//   - EventGraph (structured event history)
// ============================================================

import { nanoid } from "nanoid";
import { EventBus } from "../EventBus.js";
import { MemoryStorage } from "../storage/MemoryStorage.js";
import type { StorageBackend } from "../storage/StorageBackend.js";
import { BALANCE } from "./config/balance.config.js";
import { applyParams } from "./config/TunableParams.js";
import { UNIVERSE } from "./config/universe.config.js";
import { EventGraph } from "./EventGraph.js";
import { createEntity } from "./factory.js";
import { Formatters } from "./formatters.js";
import { QiPoolManager } from "./QiPoolManager.js";
import { ParticleTransfer } from "./reactor/ParticleTransfer.js";
import { ActionRegistry } from "./systems/ActionRegistry.js";
import { AbsorbSystem } from "./systems/absorb/index.js";
import { BreakthroughSystem } from "./systems/breakthrough/index.js";
import { ChatSystem } from "./systems/chat/index.js";
import { DevourSystem } from "./systems/devour/index.js";
import { DrainSystem } from "./systems/drain/index.js";
import { RestSystem } from "./systems/rest/index.js";
import { SpawnSystem } from "./systems/spawn/index.js";
import type { ActionContext, CanExecuteContext } from "./systems/types.js";
import type {
  ActionId,
  ActionResult,
  AvailableAction,
  Entity,
  EntityHistory,
  SpeciesType,
  WorldEvent,
  WorldEventRecord,
  WorldEventRecordType,
} from "./types.js";

export class World {
  readonly events = new EventBus();
  public readonly storage: StorageBackend;
  public readonly qiPool: QiPoolManager;
  public readonly eventGraph: EventGraph;
  private _tick: number = 0;

  constructor(storage?: StorageBackend) {
    // Apply SA-optimized balance params
    applyParams(BALANCE);

    this.storage = storage ?? new MemoryStorage();

    // Use SA-tunable totalParticles as the initial ambient qi base
    // SpawnPool will organically generate life from this ambient qi
    this.qiPool = new QiPoolManager(
      UNIVERSE.totalParticles,
      UNIVERSE.particles as { id: string }[],
      this.storage,
    );
    this.eventGraph = new EventGraph(this.storage, UNIVERSE.ledgerWindowSize);

    this.registerSystems();

    // Restore tick from persisted storage
    if (storage) {
      this._tick = storage.getTick();
    }

    // Event interceptor: convert WorldEvents into WorldEventRecords
    this.events.onAny((event) => {
      let sourceId = "WORLD";
      let targetId: string | undefined;

      // Extract entity IDs from various event data shapes
      if (event.data.entity) sourceId = (event.data.entity as { id: string }).id;
      else if (event.data.winner) sourceId = (event.data.winner as { id: string }).id;
      else if (typeof event.data.id === "string") sourceId = event.data.id;

      if (event.data.loser) targetId = (event.data.loser as { id: string }).id;
      else if (event.data.target) targetId = (event.data.target as { id: string }).id;

      const recorded = this.recordEvent({
        tick: event.tick,
        sourceId,
        targetId,
        type: event.type as unknown as WorldEventRecordType,
        data: event.data,
      });

      // Track event ID in entity's life.events (skip entombed entities)
      const srcEntity = this.getEntity(sourceId);
      if (srcEntity && srcEntity.status !== "entombed") srcEntity.life.events.push(recorded.id);
      if (targetId) {
        const tgtEntity = this.getEntity(targetId);
        if (tgtEntity && tgtEntity.status !== "entombed") tgtEntity.life.events.push(recorded.id);
      }
    });
  }

  private registerSystems() {
    ActionRegistry.registerSystem(AbsorbSystem);
    ActionRegistry.registerSystem(BreakthroughSystem);
    ActionRegistry.registerSystem(DevourSystem);
    ActionRegistry.registerSystem(RestSystem);
    ActionRegistry.registerSystem(ChatSystem);
    ActionRegistry.registerSystem(DrainSystem);
    ActionRegistry.registerSystem(SpawnSystem);
  }

  // ── Entity Management (direct storage delegation) ──────

  getEntity(id: string): Entity | undefined {
    return this.storage.getEntity(id);
  }

  setEntity(entity: Entity) {
    this.storage.setEntity(entity);
  }

  getAllEntities(): Entity[] {
    return this.storage.getAllEntities();
  }

  getAliveEntities(species?: SpeciesType): Entity[] {
    const all = this.storage.getAllEntities().filter((e) => e.status === "alive");
    return species ? all.filter((e) => e.species === species) : all;
  }

  /** 获取所有已死的有灵智实体 (lingering + entombed) */
  getDeadEntities(): Entity[] {
    return this.storage
      .getAllEntities()
      .filter((e) => e.sentient && (e.status === "lingering" || e.status === "entombed"));
  }

  removeEntity(id: string) {
    this.storage.removeEntity(id);
  }

  // ── Event Recording ────────────────────────────────────

  /** 产生一笔新事件记录，写入事件图谱 */
  recordEvent(event: Omit<WorldEventRecord, "id">): WorldEventRecord {
    const fullEvent: WorldEventRecord = {
      ...event,
      id: nanoid(),
    };
    this.eventGraph.append(fullEvent);
    return fullEvent;
  }

  // ── Getters ──────────────────────────────────────────────

  get tick(): number {
    return this._tick;
  }

  getSnapshot() {
    return {
      tick: this._tick,
      ambientPool: { ...this.qiPool.state, pools: { ...this.qiPool.state.pools } },
      entities: this.getAliveEntities(),
    };
  }

  // ── Entity Creation ──────────────────────────────────────

  createEntity(name: string, species: SpeciesType): Entity {
    const entity = createEntity(name, species, this.qiPool.state);
    this.setEntity(entity);

    const coreCurrent = entity.components.tank?.tanks[entity.components.tank.coreParticle] ?? 0;

    this.events.emit({
      tick: this._tick,
      type: "entity_created",
      data: { entity: { ...entity } },
      message: Formatters.entityCreated(entity, coreCurrent),
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
      const entity = this.getEntity(entityId);
      if (!entity || entity.status !== "alive") {
        return this.fail("生灵不存在或已消亡", tickEvents);
      }

      const actionDef = ActionRegistry.get(action);
      if (!actionDef) {
        return this.fail(`未知行动: ${action}`, tickEvents);
      }
      if (!actionDef.species.includes(entity.species)) {
        const speciesName = UNIVERSE.reactors[entity.species]?.name ?? entity.species;
        return this.fail(`${speciesName}无法执行「${actionDef.name}」`, tickEvents);
      }

      const handler = ActionRegistry.getHandler(action);
      if (!handler) {
        return this.fail(`行动「${actionDef.name}」未实装(缺少Handler)`, tickEvents);
      }

      const cost = actionDef.qiCost;
      const tankComp = entity.components.tank;

      // Deduct action cost
      if (tankComp && cost > 0) {
        ParticleTransfer.transfer(tankComp.tanks, this.qiPool.state.pools, {
          [tankComp.coreParticle]: cost,
        });
      }

      const ctx: ActionContext = {
        actionCost: cost,
        ambientPool: this.qiPool.state,
        tick: this._tick,
        events: this.events,
        payload,
      };

      let target: Entity | undefined;
      if (actionDef.needsTarget) {
        if (!targetId) return this.fail(`${actionDef.name}需要指定目标`, tickEvents);
        target = this.getEntity(targetId);
        if (!target || target.status !== "alive")
          return this.fail("目标不存在或已消亡", tickEvents);
        ctx.target = target;
      }

      const result = handler(entity, action, ctx);

      // If action failed, refund the cost
      if (!result.success && tankComp && cost > 0) {
        ParticleTransfer.transfer(this.qiPool.state.pools, tankComp.tanks, {
          [tankComp.coreParticle]: cost,
        });
      }

      // Centralized Death / Lifecycle Check
      this.checkLifecycle();

      // If handler itself failed, propagate failure
      if (!result.success) {
        return {
          success: false,
          tick: this._tick,
          result,
          events: tickEvents,
          error: (result.reason as string) ?? "行动执行失败",
          recentEvents: this.eventGraph.getRecentForEntity(entityId),
          availableActions: entity.status === "alive" ? this.getAvailableActions(entityId) : [],
        };
      }

      return {
        success: true,
        tick: this._tick,
        result,
        events: tickEvents,
        recentEvents: this.eventGraph.getRecentForEntity(entityId),
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
    this.storage.setTick(this._tick);
    const aliveEntities = this.getAliveEntities();

    // 1. 结算所有被动法则系统 (替换旧有的 drainAll 与 runSpawnPool)
    const tickCtx = {
      tick: this._tick,
      entities: aliveEntities,
      ambientPool: this.qiPool.state,
      events: this.events,
      addEntity: (e: Entity) => this.setEntity(e),
    };

    for (const sys of ActionRegistry.getSystems()) {
      sys.onTick?.(tickCtx);
    }

    // 1.5 被动系统结算后的生命周期检查
    this.checkLifecycle();

    // 2. 动态容量结算与虚空放逐 (防刷核心机制)
    const eco = UNIVERSE.ecology;
    let maxCap = eco.baseAmbientCap;
    for (const e of aliveEntities) {
      const reactor = UNIVERSE.reactors[e.species];
      maxCap += reactor?.ambientCapContribution ?? 0;
    }
    const ambient = this.qiPool.state;
    if ((ambient.pools.ql ?? 0) > maxCap) ambient.pools.ql = maxCap;
    if ((ambient.pools.qs ?? 0) > maxCap) ambient.pools.qs = maxCap;

    this.events.emit({
      tick: this._tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: Formatters.tickComplete(this._tick),
    });

    // Flush dirty state to persistent storage
    this.storage.setQiPoolState(this.qiPool.state);
    this.storage.flush().catch((err) => {
      console.error("[World] 持久化 flush 失败:", err);
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  getAvailableActions(entityId: string, maxSamples: number = 16): AvailableAction[] {
    const entity = this.getEntity(entityId);
    if (!entity || entity.status !== "alive") return [];

    const speciesActions = ActionRegistry.forSpecies(entity.species);
    const aliveTargets = this.getAliveEntities().filter((e) => e.id !== entityId);
    const allOptions: AvailableAction[] = [];

    for (const def of speciesActions) {
      const check = this.canAct(entity, def);
      if (!check.ok) {
        // Use ActionDef.showProgress if available (e.g. breakthrough percentage)
        const progress = def.showProgress?.(entity);
        const desc = progress ? `${def.name} (${progress})` : def.name;
        allOptions.push({
          action: def.id as ActionId,
          description: desc,
          possible: false,
          reason: check.reason,
        });
        continue;
      }

      if (def.needsTarget) {
        // Use ActionDef.npcTargetFilter to decide target list
        const isNpc = !!entity.components.brain;
        const targets =
          isNpc && def.npcTargetFilter === "npc-only"
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
        const progress = def.showProgress?.(entity);
        const desc = progress ? `${def.name} (${progress})` : def.name;
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

  /** 通用前置条件校验 — 灵气检查 + 委托 ActionDef.canExecute */
  private canAct(
    entity: Entity,
    def: {
      id: string;
      qiCost: number;
      canExecute?: (entity: Entity, ctx: CanExecuteContext) => { ok: boolean; reason?: string };
    },
  ): { ok: boolean; reason?: string } {
    const tankComp = entity.components.tank;
    if (!tankComp) return { ok: false, reason: "无粒子储罐" };
    const core = tankComp.coreParticle;
    if ((tankComp.tanks[core] ?? 0) < def.qiCost) return { ok: false, reason: "灵气不足" };

    // Delegate to action-specific precondition if defined
    if (def.canExecute) {
      return def.canExecute(entity, this);
    }
    return { ok: true };
  }

  /** 集中式生命周期检查 — 粒子归零则标记为濒死 */
  private checkLifecycle(): void {
    for (const e of this.getAliveEntities()) {
      const eTank = e.components.tank;
      if (eTank) {
        const eCore = eTank.coreParticle;
        if ((eTank.tanks[eCore] ?? 0) <= 0) {
          e.status = "lingering";
        }
      }
    }
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
      recentEvents: entityId ? this.eventGraph.getRecentForEntity(entityId) : [],
      availableActions: [],
      error,
    };
  }

  // ── 坟墓系统 (Tomb System) ─────────────────────────────

  /** 查询生灵的生死状态与生平 */
  getLifeStatus(
    entityId: string,
  ): { status: string; life: import("../memory/types.js").Life } | undefined {
    const entity = this.getEntity(entityId);
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
    const entity = this.getEntity(entityId);
    if (!entity) return { success: false, error: "实体不存在" };
    if (entity.status !== "lingering") {
      return { success: false, error: `实体状态为「${entity.status}」，只有游魂才能盖棺定论` };
    }

    // 1. Snapshot: pull all events from this life
    const history = this.eventGraph.getEntityHistory(entityId);
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
      message: Formatters.entityTomb(entity),
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
    const entity = this.getEntity(entityId);
    if (!entity) return { success: false, error: "实体不存在" };
    if (entity.status !== "entombed") {
      return { success: false, error: `实体状态为「${entity.status}」，只有安息者才能转生` };
    }

    const oldName = entity.name;
    const oldSpecies = entity.species;
    const pastArticle = entity.life.article;

    // 用 factory 创建一个临时蓝图获取初始组件数据
    const blueprint = createEntity(newName, newSpecies, this.qiPool.state);

    // 原地重置：保留 id 和 soulId，重置一切其他属性
    entity.name = newName;
    entity.species = newSpecies;
    entity.sentient = blueprint.sentient;
    entity.status = "alive";
    entity.components = blueprint.components;
    entity.life = {
      article: pastArticle, // 携带前世记忆
      events: [],
    };

    this.events.emit({
      tick: this._tick,
      type: "entity_reincarnated",
      data: {
        oldEntity: { id: entity.id, name: oldName, species: oldSpecies },
        newEntity: { id: entity.id, name: newName, species: newSpecies },
        articleLength: pastArticle.length,
      },
      message: Formatters.entityReincarnated(oldName, newName, pastArticle.length),
    });

    return { success: true, entity };
  }

  // ── Persistence ────────────────────────────────────────

  /** 将当前状态刷写到持久化存储 */
  async flush(): Promise<void> {
    this.storage.setQiPoolState(this.qiPool.state);
    await this.storage.flush();
  }
}
