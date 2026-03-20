import type { StorageBackend } from "../storage/StorageBackend.js";
import type { EntityHistory, LedgerEvent } from "./types.js";

/**
 * 有向图数据库/事件流账本
 * 以 Append-only 方式管理事件历史，维护遗忘窗口自动淘汰旧事件，
 * 并提供快速的关系查询。
 *
 * v5: 委托给 StorageBackend 做实际存储。
 */
export class LedgerGraph {
  private readonly storage: StorageBackend;
  private readonly maxEvents: number;

  constructor(storage: StorageBackend, maxEvents = 2000) {
    this.storage = storage;
    this.maxEvents = maxEvents;
  }

  append(event: LedgerEvent): void {
    this.storage.appendEvent(event);

    // 遗忘窗口：超过上限时截断
    if (this.storage.getEventCount() > this.maxEvents) {
      this.compact();
    }
  }

  /** 获取单体的全量历史 (作为施动者和受动者) */
  getEntityHistory(entityId: string): EntityHistory {
    return {
      entityId,
      actionsInitiated: this.storage.getEventsBySource(entityId),
      actionsReceived: this.storage.getEventsByTarget(entityId),
    };
  }

  /** 获取实体相关的最近 N 条事件 (合并施动+受动，按 tick 降序) */
  getRecentForEntity(entityId: string, limit = 20): LedgerEvent[] {
    const initiated = this.storage.getEventsBySource(entityId);
    const received = this.storage.getEventsByTarget(entityId);

    // 合并并去重 (同一事件可能同时在 source 和 target 里)
    const seen = new Set<string>();
    const merged: LedgerEvent[] = [];
    for (const e of [...initiated, ...received]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }

    // 按 tick 降序 (最新在前)
    merged.sort((a, b) => b.tick - a.tick);
    return merged.slice(0, limit);
  }

  /** 查询两个实体之间的有向互动关系 A -> B */
  getRelations(sourceId: string, targetId: string): LedgerEvent[] {
    const initiated = this.storage.getEventsBySource(sourceId);
    return initiated.filter((e) => e.targetId === targetId);
  }

  /** 获取窗口内全量历史 */
  getAllEvents(): readonly LedgerEvent[] {
    return this.storage.getAllEvents();
  }

  /** 按 Tick 范围查询 */
  getEventsByTick(startTick: number, endTick: number): LedgerEvent[] {
    return this.storage.getEventsByTick(startTick, endTick);
  }

  /** 当前存储的事件数量 */
  get size(): number {
    return this.storage.getEventCount();
  }

  // ── 遗忘窗口淘汰 ──────────────────────────────────────────

  /** 保留最新的一半事件，丢弃更早的 */
  private compact(): void {
    const keepCount = Math.floor(this.maxEvents / 2);
    this.storage.compactEvents(keepCount);
  }
}
