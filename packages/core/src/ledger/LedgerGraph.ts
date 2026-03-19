import type { EntityHistory, LedgerEvent } from "./types.js";

/**
 * 有向图数据库/事件流账本
 * 以 Append-only 方式管理全量事件历史，并提供快速的关系查询
 */
export class LedgerGraph {
  private events: LedgerEvent[] = [];

  // 简单索引，通过 entityId 快速查询
  private bySource: Map<string, LedgerEvent[]> = new Map();
  private byTarget: Map<string, LedgerEvent[]> = new Map();

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
  }

  /** 获取单体的全量历史 (作为施动者和受动者) */
  getEntityHistory(entityId: string): EntityHistory {
    return {
      entityId,
      actionsInitiated: this.bySource.get(entityId) || [],
      actionsReceived: this.byTarget.get(entityId) || [],
    };
  }

  /** 查询两个实体之间的有向互动关系 A -> B */
  getRelations(sourceId: string, targetId: string): LedgerEvent[] {
    const initiated = this.bySource.get(sourceId) || [];
    return initiated.filter((e) => e.targetId === targetId);
  }

  /** 获取整个世界的全量历史 */
  getAllEvents(): readonly LedgerEvent[] {
    return this.events;
  }

  /** 按 Tick 范围查询 */
  getEventsByTick(startTick: number, endTick: number): LedgerEvent[] {
    // 因为 events 是按顺序追加的，可以直接二分查找，这里用简单 filter
    return this.events.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }
}
