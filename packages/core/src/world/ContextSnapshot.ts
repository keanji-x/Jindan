// ============================================================
// ContextSnapshot — 为 LLM Agent 构建的语义化上下文快照
//
// 聚合 World + EventGraph + RelationGraph → 五区块 Snapshot，
// 一站式供 LLM 消费。
// ============================================================

import { UNIVERSE } from "./config/universe.config.js";
import { ActionRegistry } from "./systems/ActionRegistry.js";
import type { AvailableAction, Entity, WorldEventRecord } from "./types.js";
import type { World } from "./World.js";
import { DAO_ENTITY_ID } from "./World.js";

// ── Types ──────────────────────────────────────────────────

export interface ThoughtRecord {
  tick: number;
  innerVoice: string;
  actions: string[];
}

export interface SelfBlock {
  id: string;
  name: string;
  species: string;
  speciesName: string;
  realm: number;
  qi: number;
  maxQi: number;
  qiPercent: number;
  mood: number;
  emotion: string;
  shortTermGoal: string;
  pastLivesArticle: string;
}

export interface NearbyEntity {
  id: string;
  name: string;
  species: string;
  speciesName: string;
  realm: number;
  qi: number;
  relation: number;
  relationTags: string[];
  threat: "harmless" | "equal" | "dangerous" | "deadly";
}

export interface PerceptionBlock {
  nearby: NearbyEntity[];
  worldTick: number;
  daoTanks: Record<string, number>;
  totalParticles: number;
}

export interface MemoryEvent {
  tick: number;
  type: string;
  summary: string;
  isMajor: boolean;
}

export interface MemoryBlock {
  majorEvents: MemoryEvent[];
  recentEvents: MemoryEvent[];
  lastThoughts: ThoughtRecord[];
}

export interface OptionsBlock {
  actions: AvailableAction[];
}

export interface HintsBlock {
  isLowQi: boolean;
  isBreakthroughReady: boolean;
  hasHostileNearby: boolean;
  isWorldQiLow: boolean;
  recentlyAttacked: boolean;
}

export interface ContextSnapshot {
  self: SelfBlock;
  perception: PerceptionBlock;
  memory: MemoryBlock;
  options: OptionsBlock;
  hints: HintsBlock;
}

// ── Helpers ────────────────────────────────────────────────

function getEntityQi(entity: Entity): { qi: number; maxQi: number; qiPercent: number } {
  const tank = entity.components.tank;
  if (!tank) return { qi: 0, maxQi: 0, qiPercent: 0 };
  const core = tank.coreParticle;
  const qi = tank.tanks[core] ?? 0;
  const reactor = UNIVERSE.reactors[entity.species];
  const realm = entity.components.cultivation?.realm ?? 1;
  const limit = reactor?.proportionLimit(realm) ?? 0.05;
  const maxQi = Math.floor(limit * UNIVERSE.totalParticles);
  const qiPercent = maxQi > 0 ? Math.round((qi / maxQi) * 100) : 0;
  return { qi, maxQi, qiPercent };
}

function getSpeciesName(species: string): string {
  return UNIVERSE.reactors[species]?.name ?? species;
}

function computeThreat(selfRealm: number, otherRealm: number): NearbyEntity["threat"] {
  const diff = otherRealm - selfRealm;
  if (diff >= 2) return "deadly";
  if (diff >= 1) return "dangerous";
  if (diff <= -2) return "harmless";
  return "equal";
}

/** 将 WorldEventRecord 转为一句话摘要 */
function formatEventSummary(event: WorldEventRecord, world: World): string {
  const sourceName = world.getEntity(event.sourceId)?.name ?? event.sourceId;
  const targetName = event.targetId
    ? (world.getEntity(event.targetId)?.name ?? event.targetId)
    : undefined;

  switch (event.type) {
    case "entity_breakthrough": {
      const newRealm = (event.data?.newRealm as number) ?? "?";
      return `${sourceName}突破至${newRealm}阶`;
    }
    case "entity_devoured":
      return targetName ? `${sourceName}吞噬了${targetName}` : `${sourceName}执行了吞噬`;
    case "entity_died":
      return `${sourceName}身故`;
    case "entity_reincarnated": {
      const newName = (event.data?.newName as string) ?? "?";
      return `${sourceName}转世为${newName}`;
    }
    case "entity_tomb":
      return `${sourceName}盖棺定论`;
    case "entity_sect_founded":
      return `${sourceName}开宗立派`;
    case "entity_enslaved":
      return targetName ? `${sourceName}奴役了${targetName}` : `${sourceName}执行了奴役`;
    case "report": {
      const text = (event.data?.text as string) ?? "";
      return `[思考] ${text.slice(0, 60)}`;
    }
    default: {
      // Fallback: use type + target
      const suffix = targetName ? ` → ${targetName}` : "";
      return `${sourceName} ${event.type}${suffix}`;
    }
  }
}

// ── Builder ────────────────────────────────────────────────

export function buildContextSnapshot(
  world: World,
  entityId: string,
  lastThoughts: ThoughtRecord[] = [],
): ContextSnapshot {
  const entity = world.getEntity(entityId);
  if (!entity) throw new Error(`Entity not found: ${entityId}`);

  const selfQi = getEntityQi(entity);
  const selfRealm = entity.components.cultivation?.realm ?? 1;

  // ── Self ──
  const self: SelfBlock = {
    id: entity.id,
    name: entity.name,
    species: entity.species,
    speciesName: getSpeciesName(entity.species),
    realm: selfRealm,
    qi: selfQi.qi,
    maxQi: selfQi.maxQi,
    qiPercent: selfQi.qiPercent,
    mood: entity.components.mood?.value ?? 0.5,
    emotion: entity.components.emotion?.tag ?? "calm",
    shortTermGoal: entity.components.shortTermGoal?.text ?? "",
    pastLivesArticle: entity.life.article,
  };

  // ── Perception ──
  const aliveEntities = world
    .getAliveEntities()
    .filter((e) => e.id !== entityId && e.id !== DAO_ENTITY_ID);

  const nearby: NearbyEntity[] = aliveEntities.map((other) => {
    const otherQi = getEntityQi(other);
    const otherRealm = other.components.cultivation?.realm ?? 1;
    const relData = world.relations.getRelationData(entityId, other.id);
    return {
      id: other.id,
      name: other.name,
      species: other.species,
      speciesName: getSpeciesName(other.species),
      realm: otherRealm,
      qi: otherQi.qi,
      relation: relData.score,
      relationTags: relData.tags.map(String),
      threat: computeThreat(selfRealm, otherRealm),
    };
  });

  const perception: PerceptionBlock = {
    nearby,
    worldTick: world.tick,
    daoTanks: { ...world.getDaoTanks() },
    totalParticles: UNIVERSE.totalParticles,
  };

  // ── Memory ──
  const recentRecords = world.eventGraph.getRecentForEntity(entityId, 15);

  const majorEvents: MemoryEvent[] = [];
  const recentEvents: MemoryEvent[] = [];

  for (const rec of recentRecords) {
    const memEvent: MemoryEvent = {
      tick: rec.tick,
      type: rec.type,
      summary: formatEventSummary(rec, world),
      isMajor: rec.isMajor ?? false,
    };
    if (rec.isMajor) {
      majorEvents.push(memEvent);
    } else {
      recentEvents.push(memEvent);
    }
  }

  // Also pull major events beyond recent window
  const allEntityHistory = world.eventGraph.getEntityHistory(entityId);
  const allEvents = [...allEntityHistory.actionsInitiated, ...allEntityHistory.actionsReceived];
  const recentIds = new Set(recentRecords.map((r) => r.id));
  for (const rec of allEvents) {
    if (rec.isMajor && !recentIds.has(rec.id)) {
      majorEvents.push({
        tick: rec.tick,
        type: rec.type,
        summary: formatEventSummary(rec, world),
        isMajor: true,
      });
    }
  }
  // Sort major events by tick descending, keep top 10
  majorEvents.sort((a, b) => b.tick - a.tick);
  majorEvents.splice(10);

  const memory: MemoryBlock = {
    majorEvents,
    recentEvents,
    lastThoughts,
  };

  // ── Options ──
  // 过滤掉 internalOnly 的内部 action（如 chat_reply），不暴露给 Agent LLM
  const options: OptionsBlock = {
    actions: world.getAvailableActions(entityId).filter((a) => {
      const def = ActionRegistry.get(a.action);
      return !def?.internalOnly;
    }),
  };

  // ── Hints ──
  const recentAttacks = recentRecords.filter(
    (r) => r.targetId === entityId && r.type === "entity_devoured",
  );
  const hostileNearby = nearby.some((n) => n.relation < -30);
  const breakthroughAction = options.actions.find((a) => a.action === "breakthrough" && a.possible);

  // World qi: check if ambient pools are low relative to total
  const daoTanks = world.getDaoTanks();
  const totalDaoQi = Object.values(daoTanks).reduce((s, v) => s + v, 0);
  const isWorldQiLow = totalDaoQi < UNIVERSE.totalParticles * 0.2;

  const hints: HintsBlock = {
    isLowQi: selfQi.qiPercent < 30,
    isBreakthroughReady: !!breakthroughAction,
    hasHostileNearby: hostileNearby,
    isWorldQiLow,
    recentlyAttacked: recentAttacks.length > 0,
  };

  return { self, perception, memory, options, hints };
}
