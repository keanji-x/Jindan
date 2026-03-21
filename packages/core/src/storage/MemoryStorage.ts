// ============================================================
// MemoryStorage — 内存存储后端（原有逻辑的包装）
// ============================================================

import type { ReactorTemplate } from "../world/config/types.js";
import type { Entity, QiPoolState, RelationData, WorldEventRecord } from "../world/types.js";
import type { StorageBackend, UserRecord } from "./StorageBackend.js";

export class MemoryStorage implements StorageBackend {
  private entities: Map<string, Entity> = new Map();
  private events: WorldEventRecord[] = [];
  private bySource: Map<string, WorldEventRecord[]> = new Map();
  private byTarget: Map<string, WorldEventRecord[]> = new Map();
  private qiPool: QiPoolState = { pools: {}, total: 0 };
  private tick = 0;

  // User & Secret storage
  private users: Map<string, UserRecord> = new Map();
  private secrets: Map<string, string> = new Map(); // entityId → hashedSecret
  private secretIndex: Map<string, string> = new Map(); // hashedSecret → entityId

  // ── Lifecycle ──────────────────────────────────────────

  async init(): Promise<void> {
    // No-op for memory backend
  }

  async close(): Promise<void> {
    // No-op for memory backend
  }

  // ── Entity CRUD ────────────────────────────────────────

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  setEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  removeEntity(id: string): void {
    this.entities.delete(id);
  }

  // ── Event Append / Query ───────────────────────────────

  appendEvent(event: WorldEventRecord): void {
    this.events.push(event);

    let sourceEvents = this.bySource.get(event.sourceId);
    if (!sourceEvents) {
      sourceEvents = [];
      this.bySource.set(event.sourceId, sourceEvents);
    }
    sourceEvents.push(event);

    if (event.targetId) {
      let targetEvents = this.byTarget.get(event.targetId);
      if (!targetEvents) {
        targetEvents = [];
        this.byTarget.set(event.targetId, targetEvents);
      }
      targetEvents.push(event);
    }
  }

  getEventsBySource(sourceId: string): WorldEventRecord[] {
    return this.bySource.get(sourceId) || [];
  }

  getEventsByTarget(targetId: string): WorldEventRecord[] {
    return this.byTarget.get(targetId) || [];
  }

  getEventsByTick(startTick: number, endTick: number): WorldEventRecord[] {
    return this.events.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }

  getAllEvents(): WorldEventRecord[] {
    return this.events;
  }

  getEventCount(): number {
    return this.events.length;
  }

  compactEvents(keepCount: number): void {
    this.events = this.events.slice(-keepCount);

    // Rebuild indexes
    this.bySource.clear();
    this.byTarget.clear();

    for (const event of this.events) {
      let sourceEvents = this.bySource.get(event.sourceId);
      if (!sourceEvents) {
        sourceEvents = [];
        this.bySource.set(event.sourceId, sourceEvents);
      }
      sourceEvents.push(event);

      if (event.targetId) {
        let targetEvents = this.byTarget.get(event.targetId);
        if (!targetEvents) {
          targetEvents = [];
          this.byTarget.set(event.targetId, targetEvents);
        }
        targetEvents.push(event);
      }
    }
  }

  // ── QiPool ─────────────────────────────────────────────

  getQiPoolState(): QiPoolState {
    return this.qiPool;
  }

  setQiPoolState(state: QiPoolState): void {
    this.qiPool = state;
  }

  // ── Tick ────────────────────────────────────────────────

  getTick(): number {
    return this.tick;
  }

  setTick(tick: number): void {
    this.tick = tick;
  }

  // ── User Accounts ──────────────────────────────────────

  getUser(username: string): UserRecord | undefined {
    return this.users.get(username);
  }

  setUser(username: string, record: UserRecord): void {
    this.users.set(username, record);
  }

  hasUser(username: string): boolean {
    return this.users.has(username);
  }

  // ── Entity Secrets ─────────────────────────────────────

  getSecret(entityId: string): string | undefined {
    return this.secrets.get(entityId);
  }

  setSecret(entityId: string, hashedSecret: string): void {
    this.secrets.set(entityId, hashedSecret);
    this.secretIndex.set(hashedSecret, entityId);
  }

  getEntityIdBySecret(hashedSecret: string): string | undefined {
    return this.secretIndex.get(hashedSecret);
  }

  // ── Relations ──────────────────────────────────────────

  private relationsData: Record<string, RelationData> = {};

  getRelations(): Record<string, RelationData> {
    return this.relationsData;
  }

  setRelations(relations: Record<string, RelationData>): void {
    this.relationsData = relations;
  }

  // ── Dynamic Reactors ───────────────────────────────────

  private reactorsData: Record<string, ReactorTemplate> = {};

  getReactors(): Record<string, ReactorTemplate> {
    return this.reactorsData;
  }

  setReactors(reactors: Record<string, ReactorTemplate>): void {
    this.reactorsData = reactors;
  }

  // ── Persistence Flush ──────────────────────────────────

  async flush(): Promise<void> {
    // No-op for memory backend
  }
}
