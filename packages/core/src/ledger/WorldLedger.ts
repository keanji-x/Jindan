import { nanoid } from "nanoid";
import { UNIVERSE } from "../engine/index.js";
import type { Entity } from "../entity/types.js";
import { LedgerGraph } from "./LedgerGraph.js";
import { QiPoolManager } from "./QiPoolManager.js";
import type { LedgerEvent } from "./types.js";

/**
 * WorldLedger 世界账本
 * 统管：
 * 1. 实体现状 (State)
 * 2. 灵气池现状 (QiPool)
 * 3. 互动图网络 (LedgerGraph/EventList)
 */
export class WorldLedger {
  public readonly qiPool: QiPoolManager;
  public readonly graph: LedgerGraph;

  // 替代旧版的 this.state.entities
  private entities: Map<string, Entity> = new Map();

  constructor() {
    this.qiPool = new QiPoolManager(
      100, // Barren world base capacity
      UNIVERSE.particles as { id: string }[],
    );
    this.graph = new LedgerGraph();
  }

  // --- Entity 管理 ---

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  setEntity(entity: Entity) {
    this.entities.set(entity.id, entity);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getAliveEntities(): Entity[] {
    return this.getAllEntities().filter((e) => e.alive);
  }

  removeEntity(id: string) {
    this.entities.delete(id);
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
}
