// ============================================================
// StorageBackend — 持久化存储抽象接口
// ============================================================

import type { Entity } from "../entity/types.js";
import type { LedgerEvent, QiPoolState } from "../ledger/types.js";

/**
 * 存储后端接口。
 * 运行时 WorldLedger 通过此接口读写实体、事件和灵气池状态。
 * 内存后端 (MemoryStorage) 和 PG 后端 (PgStorage) 均实现此接口。
 */
export interface StorageBackend {
  // ── Lifecycle ──────────────────────────────────────────

  /** 初始化存储（建表、加载已有数据等） */
  init(): Promise<void>;

  /** 关闭存储连接 */
  close(): Promise<void>;

  // ── Entity CRUD ────────────────────────────────────────

  getEntity(id: string): Entity | undefined;
  setEntity(entity: Entity): void;
  getAllEntities(): Entity[];
  removeEntity(id: string): void;

  // ── Event Append / Query ───────────────────────────────

  appendEvent(event: LedgerEvent): void;
  getEventsBySource(sourceId: string): LedgerEvent[];
  getEventsByTarget(targetId: string): LedgerEvent[];
  getEventsByTick(startTick: number, endTick: number): LedgerEvent[];
  getAllEvents(): LedgerEvent[];
  getEventCount(): number;

  /** 遗忘窗口：保留最新的 keepCount 条事件，丢弃更早的 */
  compactEvents(keepCount: number): void;

  // ── QiPool ─────────────────────────────────────────────

  getQiPoolState(): QiPoolState;
  setQiPoolState(state: QiPoolState): void;

  // ── Tick ────────────────────────────────────────────────

  getTick(): number;
  setTick(tick: number): void;

  // ── Persistence Flush ──────────────────────────────────

  /** 将内存缓存批量写入持久化存储（Memory 后端为 no-op） */
  flush(): Promise<void>;
}
