import type { EntityHistory, LedgerEvent } from "./types.js";

/**
 * 有向图数据库/事件流账本
 * 以 Append-only 方式管理事件历史，维护遗忘窗口自动淘汰旧事件，
 * 并提供快速的关系查询。
 */
export class LedgerGraph {
  private events: LedgerEvent[] = [];
  private readonly maxEvents: number;

  // 简单索引，通过 entityId 快速查询
  private bySource: Map<string, LedgerEvent[]> = new Map();
  private byTarget: Map<string, LedgerEvent[]> = new Map();

  constructor(maxEvents = 2000) {
    this.maxEvents = maxEvents;
  }

  append(event: LedgerEvent): void {
    this.events.push(event);

    // 建立 source 索引
    let sourceEvents = this.bySource.get(event.sourceId);
    if (!sourceEvents) {
      sourceEvents = [];
      this.bySource.set(event.sourceId, sourceEvents);
    }
    sourceEvents.push(event);

    // 建立 target 索引
    if (event.targetId) {
      let targetEvents = this.byTarget.get(event.targetId);
      if (!targetEvents) {
        targetEvents = [];
        this.byTarget.set(event.targetId, targetEvents);
      }
      targetEvents.push(event);
    }

    // 遗忘窗口：超过上限时截断并重建索引
    if (this.events.length > this.maxEvents) {
      this.compact();
    }
  }

  /** 获取单体的全量历史 (作为施动者和受动者) */
  getEntityHistory(entityId: string): EntityHistory {
    return {
      entityId,
      actionsInitiated: this.bySource.get(entityId) || [],
      actionsReceived: this.byTarget.get(entityId) || [],
    };
  }

  /** 获取实体相关的最近 N 条事件 (合并施动+受动，按 tick 降序) */
  getRecentForEntity(entityId: string, limit = 20): LedgerEvent[] {
    const initiated = this.bySource.get(entityId) || [];
    const received = this.byTarget.get(entityId) || [];

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
    const initiated = this.bySource.get(sourceId) || [];
    return initiated.filter((e) => e.targetId === targetId);
  }

  /** 获取窗口内全量历史 */
  getAllEvents(): readonly LedgerEvent[] {
    return this.events;
  }

  /** 按 Tick 范围查询 */
  getEventsByTick(startTick: number, endTick: number): LedgerEvent[] {
    return this.events.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }

  /** 当前存储的事件数量 */
  get size(): number {
    return this.events.length;
  }

  // ── 遗忘窗口淘汰 ──────────────────────────────────────────

  /** 保留最新的一半事件，丢弃更早的，重建索引 */
  private compact(): void {
    const keepCount = Math.floor(this.maxEvents / 2);
    this.events = this.events.slice(-keepCount);

    // 重建索引
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
}
