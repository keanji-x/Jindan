// ============================================================
// World — thin coordinator (owns all structured state)
//
// v6: QiPoolManager removed. Dao entity IS the qi reservoir.
//   - Entity CRUD (via StorageBackend)
//   - Dao entity holds all universe qi in its tanks
//   - EventGraph (structured event history)
// ============================================================

/** Dao entity ID — the universe's qi reservoir */
export const DAO_ENTITY_ID = "__dao__";

import { nanoid } from "nanoid";
import { EventBus } from "../EventBus.js";
import { MemoryStorage } from "../storage/MemoryStorage.js";
import type { StorageBackend } from "../storage/StorageBackend.js";
import { BeingLedger } from "./beings/BeingLedger.js";
import { BALANCE } from "./config/balance.config.js";
import { applyParams } from "./config/TunableParams.js";
import { UNIVERSE } from "./config/universe.config.js";
import { EventGraph } from "./EventGraph.js";
import { EffectPipeline } from "./effects/EffectPipeline.js";
import { GraphRegistry } from "./effects/GraphRegistry.js";
import { registerBuiltinGraphs } from "./effects/graphs/index.js";
import type { ActionOutcome, Effect } from "./effects/types.js";
import { createEntity } from "./factory.js";
import { Formatters } from "./formatters.js";

import { RelationGraph } from "./RelationGraph.js";
import { ParticleTransfer } from "./reactor/ParticleTransfer.js";
import { Reactor } from "./reactor/Reactor.js";
import { ActionRegistry } from "./systems/ActionRegistry.js";
import { DaoEventSystem } from "./systems/DaoEventSystem.js";
import { InteractionSystem } from "./systems/InteractionSystem.js";
import { LifecycleSystem } from "./systems/LifecycleSystem.js";
import { NpcSocialSystem } from "./systems/NpcSocialSystem.js";
import { RelationEventSystem } from "./systems/RelationEventSystem.js";
import { SingleEntitySystem } from "./systems/SingleEntitySystem.js";
import type { ActionContext, CanExecuteContext } from "./systems/types.js";
import type {
  ActionId,
  ActionResult,
  AvailableAction,
  Entity,
  EntityHistory,
  RelationTag,
  SpeciesType,
  WorldEvent,
  WorldEventRecord,
  WorldEventRecordType,
} from "./types.js";

export class World {
  readonly events = new EventBus();
  public readonly storage: StorageBackend;
  public readonly eventGraph: EventGraph;
  public readonly relations: RelationGraph;
  public readonly effectPipeline: EffectPipeline;
  private _tick: number = 0;

  constructor(storage?: StorageBackend) {
    // Apply SA-optimized balance params
    applyParams(BALANCE);

    this.storage = storage ?? new MemoryStorage();

    this.eventGraph = new EventGraph(this.storage, UNIVERSE.ledgerWindowSize);
    this.relations = new RelationGraph(this.storage);
    this.effectPipeline = new EffectPipeline();

    this.registerSystems();

    // Bootstrap Dao entity — the universe's qi reservoir
    // Dao holds ALL particles; entities absorb FROM Dao
    if (!this.storage.getEntity(DAO_ENTITY_ID)) {
      const dao = createEntity("天道", "dao");
      (dao as { id: string }).id = DAO_ENTITY_ID;
      const tank = dao.components.tank!;
      tank.tanks.ql = Math.floor(UNIVERSE.totalParticles / 2);
      tank.tanks.qs = Math.floor(UNIVERSE.totalParticles / 2);
      this.setEntity(dao);
    }

    // Restore tick and dynamic reactors from persisted storage
    if (storage) {
      this._tick = storage.getTick();
      const dynamicReactors = storage.getReactors();
      for (const [id, template] of Object.entries(dynamicReactors)) {
        UNIVERSE.reactors[id] = template;
      }
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
    ActionRegistry._reset();
    ActionRegistry.registerSystem(SingleEntitySystem);
    ActionRegistry.registerSystem(InteractionSystem);
    ActionRegistry.registerSystem(LifecycleSystem);
    ActionRegistry.registerSystem(DaoEventSystem);
    ActionRegistry.registerSystem(RelationEventSystem);
    ActionRegistry.registerSystem(NpcSocialSystem);
    registerBuiltinGraphs();
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
    const all = this.storage.getAllEntities().filter((e) => e.status === "alive" && e.id !== DAO_ENTITY_ID);
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

  /** Returns the Dao entity's tanks — the universe's qi reservoir */
  getDaoTanks(): Record<string, number> {
    const dao = this.getEntity(DAO_ENTITY_ID);
    if (!dao?.components.tank) throw new Error("天道实体丢失");
    return dao.components.tank.tanks;
  }

  /** Returns {pools, total} wrapping Dao tanks for backward compat with ActionContext */
  getDaoPoolState(): { pools: Record<string, number>; total: number } {
    return { pools: this.getDaoTanks(), total: UNIVERSE.totalParticles };
  }

  /** Convenience: get the Dao entity itself */
  getDaoEntity(): Entity {
    const dao = this.getEntity(DAO_ENTITY_ID);
    if (!dao) throw new Error("天道实体丢失");
    return dao;
  }

  getSnapshot() {
    return {
      tick: this._tick,
      daoTanks: { ...this.getDaoTanks() },
      entities: this.getAliveEntities(),
    };
  }

  // ── Entity Creation ──────────────────────────────────────

  createEntity(name: string, species: SpeciesType): Entity {
    // ── 生灵账本守门（全局位格 + 物种配额） ──────────────
    const aliveEntities = this.getAliveEntities();
    if (
      !BeingLedger.canAcquire(species, aliveEntities, this.getDaoPoolState(), UNIVERSE.totalParticles)
    ) {
      const reactor = UNIVERSE.reactors[species];
      throw new Error(`「${reactor?.name ?? species}」无法创建：世界位格已满或物种配额不足`);
    }

    const entity = createEntity(name, species);

    // 粒子守恒：从天道灌注 birthCost 初始粒子（转移，不创造）
    const tank = entity.components.tank;
    if (tank) {
      const reactor = UNIVERSE.reactors[species];
      if (reactor) {
        ParticleTransfer.transfer(this.getDaoTanks(), tank.tanks, {
          [tank.coreParticle]: reactor.birthCost,
        });
      }
    }

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
    action: ActionId, // actionId or graphId
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

      if (entity.components.actionGraph) {
        return this.fail("正在执行其他功法/动作", tickEvents, entityId);
      }

      let graphDef = GraphRegistry.get(action);
      if (!graphDef) {
        const actDef = ActionRegistry.get(action);
        if (!actDef) return this.fail(`未知行动/功法: ${action}`, tickEvents, entityId);
        const reactorTemplate = UNIVERSE.reactors[entity.species];
        if (!reactorTemplate?.actions.some((a) => a.id === actDef.id)) {
          const speciesName = reactorTemplate?.name ?? entity.species;
          return this.fail(`${speciesName}无法执行「${actDef.name}」`, tickEvents, entityId);
        }

        // Wrap as implicit single-node graph
        graphDef = {
          id: `single_${action}`,
          name: actDef.name,
          description: actDef.name,
          entryNode: "root",
          nodes: [{ nodeId: "root", actionId: action }],
          edges: [],
        };
      } else {
        const reactorTemplate = UNIVERSE.reactors[entity.species];
        const _isAllowed = true; // FIXME: If graphDef has species restrictions? Actually graphs are being deprecated or they don't have species restrictions directly checked against string anymore. Let's just leave it or remove the check.
        // Actually, let's keep it simple and just true, since Graph implementation might change.
        if (graphDef.species && !graphDef.species.includes(entity.species as never)) {
          const speciesName = reactorTemplate?.name ?? entity.species;
          return this.fail(`${speciesName}无法修炼功法「${graphDef.name}」`, tickEvents, entityId);
        }
      }

      entity.components.actionGraph = {
        graphId: graphDef.id,
        currentNodeId: graphDef.entryNode,
        currentRepeatCount: 0,
        ticksHeld: 0,
        targetId,
        payload,
      };

      // Store ephemeral wrapped graphs in the registry briefly if needed?
      // Easier: just pass it down if it's dynamic. We'll stick it in GraphRegistry temporarily if missing.
      if (!GraphRegistry.get(graphDef.id)) {
        GraphRegistry.register(graphDef);
      }

      // Pump immediately for synchronous expectations in single tick systems
      return this.pumpGraph(entity, tickEvents);
    } finally {
      unsub();
    }
  }

  /** 步进实体的 ActiveGraph — 跨 tick 图谱引擎引擎 */
  private pumpGraph(entity: Entity, tickEvents: WorldEvent[]): ActionResult {
    const activeGraph = entity.components.actionGraph;
    if (!activeGraph) return this.fail("实体未在执行任何行动", tickEvents, entity.id);

    const graphDef = GraphRegistry.get(activeGraph.graphId);
    if (!graphDef) {
      entity.components.actionGraph = undefined;
      return this.fail(`未知图谱: ${activeGraph.graphId}`, tickEvents, entity.id);
    }

    const node = graphDef.nodes.find((n) => n.nodeId === activeGraph.currentNodeId);
    if (!node) {
      entity.components.actionGraph = undefined;
      return this.fail(`无效图谱节点: ${activeGraph.currentNodeId}`, tickEvents, entity.id);
    }

    const actionDef = ActionRegistry.get(node.actionId);
    const handler = ActionRegistry.getHandler(node.actionId);
    if (!actionDef || !handler) {
      entity.components.actionGraph = undefined;
      return this.fail(`行动未实装: ${node.actionId}`, tickEvents, entity.id);
    }

    const cost = actionDef.qiCost;
    const tankComp = entity.components.tank;
    if (tankComp && cost > 0) {
      ParticleTransfer.transfer(tankComp.tanks, this.getDaoTanks(), {
        [tankComp.coreParticle]: cost,
      });
    }

    const ctx: ActionContext = {
      actionCost: cost,
      ambientPool: this.getDaoPoolState(),
      tick: this._tick,
      events: this.events,
      payload: activeGraph.payload,
      getRelation: (a, b) => this.relations.get(a, b),
      adjustRelation: (a, b, delta) => this.relations.adjust(a, b, delta),
    };

    let target: Entity | undefined;
    if (actionDef.needsTarget) {
      if (!activeGraph.targetId) {
        entity.components.actionGraph = undefined;
        return this.fail(`${actionDef.name}缺少目标`, tickEvents, entity.id);
      }
      target = this.getEntity(activeGraph.targetId);
      if (!target || target.status !== "alive") {
        entity.components.actionGraph = undefined;
        return this.fail("目标已消亡或失联", tickEvents, entity.id);
      }
      ctx.target = target;
    }

    const rawOutcome = handler(entity, node.actionId, ctx);
    let outcome: ActionOutcome;
    if ("status" in rawOutcome) {
      outcome = rawOutcome as unknown as ActionOutcome;
    } else {
      outcome = {
        status: rawOutcome.success ? "success" : "aborted",
        successEffects: [],
        failureEffects: [],
        abortedEffects: [],
        reason: rawOutcome.reason as string | undefined,
        newQi: rawOutcome.newQi,
        absorbed: rawOutcome.absorbed,
      };
    }

    const isSuccess = outcome.status === "success";
    // Refund cost on abort or failure
    if (!isSuccess && tankComp && cost > 0) {
      ParticleTransfer.transfer(this.getDaoTanks(), tankComp.tanks, {
        [tankComp.coreParticle]: cost,
      });
    }

    let effectsToApply: Effect[] = [];
    if (outcome.status === "success") effectsToApply = outcome.successEffects ?? [];
    else if (outcome.status === "failure") effectsToApply = outcome.failureEffects ?? [];
    else if (outcome.status === "aborted") effectsToApply = outcome.abortedEffects ?? [];

    if (effectsToApply.length > 0) {
      const finalEffects = this.effectPipeline.process(effectsToApply, {
        tick: this._tick,
        getEntity: (id) => {
          const e = this.getEntity(id);
          return e ? { id: e.id, species: e.species, status: e.status } : undefined;
        },
      });
      for (const effect of finalEffects) this.applyEffect(effect);
    }

    this.checkLifecycle();

    // Graph Topological Step
    activeGraph.currentRepeatCount++;
    const repeatTarget = node.repeat ?? 1;

    // Done repeating this node or aborted (abort breaks repetitions)
    if (activeGraph.currentRepeatCount >= repeatTarget || outcome.status === "aborted") {
      const possibleEdges = graphDef.edges.filter((e) => e.from === node.nodeId);
      const nextEdge = possibleEdges.find(
        (e) => !e.condition || e.condition === "always" || e.condition === `on_${outcome.status}`,
      );
      if (nextEdge) {
        activeGraph.currentNodeId = nextEdge.to;
        activeGraph.currentRepeatCount = 0;
      } else {
        // End of the graph
        entity.components.actionGraph = undefined;
      }
    } else {
      // Still repeating this node, do not clear component
      activeGraph.ticksHeld++;
    }

    if (!isSuccess) {
      return this.fail(outcome.reason ?? "行动执行失败", tickEvents, entity.id);
    }

    return {
      success: true,
      tick: this._tick,
      result: rawOutcome,
      events: tickEvents,
      recentEvents: this.eventGraph.getRecentForEntity(entity.id),
      availableActions: entity.status === "alive" ? this.getAvailableActions(entity.id) : [],
    };
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
    // Include Dao for internal tick processing (drain needs it as qi sink)
    const daoEntity = this.getDaoEntity();
    const aliveEntities = [daoEntity, ...this.getAliveEntities()];
    const deadEntities = this.storage.getAllEntities().filter((e) => e.status === "entombed");

    // 1. 结算所有被动法则系统 (替换旧有的 drainAll 与 runSpawnPool)
    const tickCtx = {
      tick: this._tick,
      entities: aliveEntities,
      deadEntities,
      ambientPool: this.getDaoPoolState(),
      events: this.events,
      world: this,
      addEntity: (e: Entity) => this.setEntity(e),
      reincarnateEntity: (entityId: string, newName: string, newSpecies: string) =>
        this.reincarnate(entityId, newName, newSpecies),
    };

    for (const sys of ActionRegistry.getSystems()) {
      sys.onTick?.(tickCtx);
    }

    // Auto-pump ActiveGraphs for alive entities across ticks
    for (const e of aliveEntities) {
      if (e.components.actionGraph) {
        const discardedEvents: WorldEvent[] = [];
        const unsub = this.events.onAny((ev) => discardedEvents.push(ev));
        try {
          this.pumpGraph(e, discardedEvents);
        } finally {
          unsub();
        }
      }
    }

    // 1.5 被动系统结算后的生命周期检查
    this.checkLifecycle();

    // 天道裁决现已通过 DrainSystem 标准代谢处理，极端占比由 DaoEventSystem 天劫触发

    this.events.emit({
      tick: this._tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: Formatters.tickComplete(this._tick),
    });

    // Flush dirty state to persistent storage
    // Dao state persisted via entity storage (no separate qiPool)
    this.storage.setRelations(this.relations.toJSON());
    this.storage.setReactors(UNIVERSE.reactors);
    this.storage.flush().catch((err) => {
      console.error("[World] 持久化 flush 失败:", err);
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  getAvailableActions(entityId: string, maxSamples: number = 5): AvailableAction[] {
    const entity = this.getEntity(entityId);
    if (!entity || entity.status !== "alive") return [];

    const speciesActions = ActionRegistry.forSpecies(entity.species);
    const aliveTargets = this.getAliveEntities().filter((e) => e.id !== entityId && e.id !== DAO_ENTITY_ID);
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
          // 关系区间过滤
          if (def.relationRange) {
            const rel = this.relations.get(entity.id, t.id);
            if (rel < def.relationRange[0] || rel > def.relationRange[1]) continue;
          }
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

    // Action-diversity sampling:
    // 1. ALL non-target actions always included (meditate, photosynth, rest...)
    // 2. For each target-action type, pick 1 best target (highest relation)
    // 3. Cap total at maxSamples — ensures brain sees ALL action types
    const possibleActions = allOptions.filter((a) => a.possible);
    const impossibleActions = allOptions.filter((a) => !a.possible);

    // Split into non-target (always included) and target (1 best per type)
    const nonTargetActions: AvailableAction[] = [];
    const byType = new Map<string, AvailableAction[]>();
    for (const a of possibleActions) {
      if (a.targetId) {
        const arr = byType.get(a.action) ?? [];
        arr.push(a);
        byType.set(a.action, arr);
      } else {
        nonTargetActions.push(a);
      }
    }

    // For each target-action type, pick best target by relation
    const bestTargetActions: AvailableAction[] = [];
    for (const [, actions] of byType) {
      // Sort by relation score, pick top 1
      actions.sort((a, b) => {
        const relA = this.relations.get(entityId, a.targetId!);
        const relB = this.relations.get(entityId, b.targetId!);
        return relB - relA;
      });
      bestTargetActions.push(actions[0]!);
    }

    // Combine: non-target first (guaranteed), then best targets
    const sampled = [...nonTargetActions, ...bestTargetActions].slice(0, maxSamples);

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

  private applyEffect(effect: Effect) {
    if (effect.type === "emit_event") {
      this.events.emit(effect.event);
    } else if (effect.type === "adjust_relation") {
      this.relations.adjust(effect.a, effect.b, effect.delta);
    } else if (effect.type === "transfer") {
      const getResource = (id: string) => {
        if (id === "ambient") return this.getDaoTanks();
        const e = this.getEntity(id);
        return e?.components.tank?.tanks;
      };
      const src = getResource(effect.from);
      const dst = getResource(effect.to);
      if (src && dst) {
        ParticleTransfer.transfer(src, dst, effect.amounts);
      }
    } else if (effect.type === "set_realm") {
      const e = this.getEntity(effect.entityId);
      if (e?.components.cultivation) {
        e.components.cultivation.realm = effect.realm;
      }
      // proportionLimit is a function on the ReactorTemplate, not stored on entity
    } else if (effect.type === "set_status") {
      const e = this.getEntity(effect.entityId);
      if (e) e.status = effect.status;
    } else if (effect.type === "reactor_beam") {
      const e = this.getEntity(effect.entityId);
      const tankComp = e?.components.tank;
      const cultComp = e?.components.cultivation;
      const template = e ? UNIVERSE.reactors[e.species] : undefined;

      if (e && tankComp && cultComp && template) {
        const { alive } = Reactor.processIncomingBeam(
          tankComp.tanks,
          this.getDaoTanks(),
          effect.beam,
          1, // density concept removed — Dao IS the reservoir
          effect.sourceRealm,
          template.ownPolarity,
        );
        if (!alive) {
          e.status = "lingering"; // Mark as dead if reactor explodes
        }
      }
    } else if (effect.type === "cascade") {
      // Execute the cascaded action directly (WARNING: no depth limit yet)
      this.performAction(effect.entityId, effect.actionId, effect.targetId, effect.payload);
    } else if (effect.type === "sync_tank") {
      const e = this.getEntity(effect.entityId);
      if (e?.components.tank) {
        // Replace the tank contents entirely to match resolver simulation
        e.components.tank.tanks = { ...effect.tanks };
      }
    } else if (effect.type === "sync_ambient") {
      // Replace ambient pools entirely to match resolver simulation
      Object.assign(this.getDaoTanks(), effect.pools);
    } else if (effect.type === "add_relation_tag") {
      this.relations.addTag(effect.a, effect.b, effect.tag as RelationTag);
    } else if (effect.type === "remove_relation_tag") {
      this.relations.removeTag(effect.a, effect.b, effect.tag as RelationTag);
    } else if (effect.type === "create_entity") {
      try {
        const child = this.createEntity(effect.name, effect.species);
        // Link parents via RelationTags
        if (effect.parentIds) {
          for (const parentId of effect.parentIds) {
            this.relations.addTag(parentId, child.id, "parent" as RelationTag);
            this.relations.addTag(child.id, parentId, "child" as RelationTag);
            this.relations.adjust(parentId, child.id, 50);
          }
        }
      } catch (_err) {
        // Entity creation can fail (e.g. world full) — silently skip
      }
    } else if (effect.type === "adjust_mood") {
      const e = this.getEntity(effect.entityId);
      if (e?.components.mood) {
        e.components.mood.value = Math.max(0, Math.min(1, e.components.mood.value + effect.delta));
      }
    }
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

    // 用 factory 创建一个临时蓝图获取初始组件数据（空壳，不涉及粒子）
    const blueprint = createEntity(newName, newSpecies);

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

    // 粒子守恒：从天地灌注 birthCost 粒子（转移，不创造）
    const tank = entity.components.tank;
    if (tank) {
      const reactor = UNIVERSE.reactors[newSpecies];
      if (reactor) {
        ParticleTransfer.transfer(this.getDaoTanks(), tank.tanks, {
          [tank.coreParticle]: reactor.birthCost,
        });
      }
    }

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
    // Dao state persisted via entity storage (no separate qiPool)
    this.storage.setRelations(this.relations.toJSON());
    this.storage.setReactors(UNIVERSE.reactors);
    await this.storage.flush();
  }
}
