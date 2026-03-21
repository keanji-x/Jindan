// ============================================================
// RelationGraph — 实体关系图 (Entity Relation Graph)
//
// 与 QiPoolManager（粒子守恒）、EventGraph（事件图谱）对称的
// 世界级状态管理器。管理任意两实体之间 -100 ~ +100 的关系值。
//
// 关系键为无序对 "id_a:id_b"（字典序小的在前），保证对称性。
// ============================================================

import type { StorageBackend } from "../storage/StorageBackend.js";
import { makeRelationKey } from "./types.js";

const MIN = -100;
const MAX = 100;

export class RelationGraph {
  /** "entityA:entityB" → score */
  private relations: Map<string, number>;

  constructor(storage?: StorageBackend) {
    this.relations = new Map();
    if (storage) {
      const persisted = storage.getRelations();
      if (persisted) {
        for (const [k, v] of Object.entries(persisted)) {
          this.relations.set(k, v);
        }
      }
    }
  }

  /** 获取两个实体之间的关系值，默认 0（陌生人） */
  get(a: string, b: string): number {
    return this.relations.get(makeRelationKey(a, b)) ?? 0;
  }

  /** 修改关系值（增量），自动 clamp 到 [-100, +100] */
  adjust(a: string, b: string, delta: number): number {
    const key = makeRelationKey(a, b);
    const current = this.relations.get(key) ?? 0;
    const next = Math.max(MIN, Math.min(MAX, current + delta));
    this.relations.set(key, next);
    return next;
  }

  /** 直接设置关系值 */
  set(a: string, b: string, value: number): void {
    const key = makeRelationKey(a, b);
    this.relations.set(key, Math.max(MIN, Math.min(MAX, value)));
  }

  /** 获取某实体与所有其他实体的关系列表 */
  getAll(entityId: string): Array<{ otherId: string; score: number }> {
    const result: Array<{ otherId: string; score: number }> = [];
    for (const [key, score] of this.relations) {
      const [a, b] = key.split(":");
      if (a === entityId) result.push({ otherId: b!, score });
      else if (b === entityId) result.push({ otherId: a!, score });
    }
    return result;
  }

  /** 清除某个实体的所有关系（实体永久移除时可选调用） */
  removeEntity(entityId: string): void {
    for (const key of [...this.relations.keys()]) {
      if (key.startsWith(`${entityId}:`) || key.endsWith(`:${entityId}`)) {
        this.relations.delete(key);
      }
    }
  }

  /** 序列化为 Record，用于持久化 */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.relations);
  }
}
