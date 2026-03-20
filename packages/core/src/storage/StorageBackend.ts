import type { Entity } from "../entity/types.js";
import type { LedgerEvent, QiPoolState } from "../ledger/types.js";

/** 用户账户记录 */
export interface UserRecord {
  passwordHash: string;
  entityIds: string[];
}

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

  // ── User Accounts ──────────────────────────────────────

  /** 获取用户记录 */
  getUser(username: string): UserRecord | undefined;
  /** 保存/更新用户记录 */
  setUser(username: string, record: UserRecord): void;
  /** 检查用户是否存在 */
  hasUser(username: string): boolean;

  // ── Entity Secrets ─────────────────────────────────────

  /** 获取 entityId 对应的 hashed secret */
  getSecret(entityId: string): string | undefined;
  /** 保存 entity secret (hashed) */
  setSecret(entityId: string, hashedSecret: string): void;
  /** 通过 hashed secret 反查 entityId */
  getEntityIdBySecret(hashedSecret: string): string | undefined;

  // ── Persistence Flush ──────────────────────────────────

  /** 将内存缓存批量写入持久化存储（Memory 后端为 no-op） */
  flush(): Promise<void>;
}
