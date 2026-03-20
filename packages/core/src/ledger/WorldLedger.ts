import { nanoid } from "nanoid";
import { UNIVERSE } from "../engine/index.js";
import type { Entity } from "../entity/types.js";
import { MemoryStorage } from "../storage/MemoryStorage.js";
import type { StorageBackend } from "../storage/StorageBackend.js";
import { LedgerGraph } from "./LedgerGraph.js";
import { QiPoolManager } from "./QiPoolManager.js";
import type { LedgerEvent } from "./types.js";

/**
 * WorldLedger 世界账本
 * 统管：
 * 1. 实体现状 (State)
 * 2. 灵气池现状 (QiPool)
 * 3. 互动图网络 (LedgerGraph/EventList)
 *
 * v5: 委托给 StorageBackend 做持久化。
 */
export class WorldLedger {
  public readonly qiPool: QiPoolManager;
  public readonly graph: LedgerGraph;
  public readonly storage: StorageBackend;

  constructor(storage?: StorageBackend) {
    this.storage = storage ?? new MemoryStorage();

    // Use SA-tunable totalParticles as the initial ambient qi base
    // SpawnPool will organically generate life from this ambient qi
    this.qiPool = new QiPoolManager(
      UNIVERSE.totalParticles,
      UNIVERSE.particles as { id: string }[],
      this.storage,
    );
    this.graph = new LedgerGraph(this.storage, UNIVERSE.ledgerWindowSize);
  }

  // --- Entity 管理 ---

  getEntity(id: string): Entity | undefined {
    return this.storage.getEntity(id);
  }

  setEntity(entity: Entity) {
    this.storage.setEntity(entity);
  }

  getAllEntities(): Entity[] {
    return this.storage.getAllEntities();
  }

  getAliveEntities(): Entity[] {
    return this.getAllEntities().filter((e) => e.status === "alive");
  }

  removeEntity(id: string) {
    this.storage.removeEntity(id);
  }

  // --- 事件写入 ---

  /** 产生一笔新事件，写入图库 */
  recordEvent(event: Omit<LedgerEvent, "id">): LedgerEvent {
    const fullEvent: LedgerEvent = {
      ...event,
      id: nanoid(),
    };
    this.graph.append(fullEvent);
    return fullEvent;
  }

  // --- 持久化 ---

  /** 将当前状态刷写到持久化存储 */
  async flush(): Promise<void> {
    this.storage.setQiPoolState(this.qiPool.state);
    await this.storage.flush();
  }
}
