// ============================================================
// RelationGraph — 实体关系图 (Entity Relation Graph)
//
// 与 QiPoolManager（粒子守恒）、EventGraph（事件图谱）对称的
// 世界级状态管理器。管理任意两实体之间 -100 ~ +100 的关系值。
//
// 关系键为无序对 "id_a:id_b"（字典序小的在前），保证对称性。
// ============================================================

import type { StorageBackend } from "../storage/StorageBackend.js";
import type { RelationData, RelationTag } from "./types.js";
import { makeRelationKey } from "./types.js";

const MIN = -100;
const MAX = 100;

export class RelationGraph {
  /** "entityA:entityB" → RelationData */
  private relations: Map<string, RelationData>;

  constructor(storage?: StorageBackend) {
    this.relations = new Map();
    if (storage) {
      const persisted = storage.getRelations();
      if (persisted) {
        for (const [k, v] of Object.entries(persisted)) {
          // Convert array of tags back to Set could be done, but type is currently array
          this.relations.set(k, { score: v.score, tags: v.tags ? [...v.tags] : [] });
        }
      }
    }
  }

  /** 获取关系数据对象 */
  getRelationData(a: string, b: string): RelationData {
    const key = makeRelationKey(a, b);
    let data = this.relations.get(key);
    if (!data) {
      data = { score: 0, tags: [] };
      this.relations.set(key, data);
    }
    return data;
  }

  /** 获取两个实体之间的关系值，默认 0（陌生人） */
  get(a: string, b: string): number {
    return this.relations.get(makeRelationKey(a, b))?.score ?? 0;
  }

  /** 修改关系值（增量），自动 clamp 到 [-100, +100] */
  adjust(a: string, b: string, delta: number): number {
    const data = this.getRelationData(a, b);
    data.score = Math.max(MIN, Math.min(MAX, data.score + delta));
    return data.score;
  }

  /** 直接设置关系值 */
  set(a: string, b: string, value: number): void {
    const data = this.getRelationData(a, b);
    data.score = Math.max(MIN, Math.min(MAX, value));
  }

  /** 添加一个关系标签 */
  addTag(a: string, b: string, tag: RelationTag): void {
    const data = this.getRelationData(a, b);
    if (!data.tags.includes(tag)) {
      data.tags.push(tag);
    }
  }

  /** 移除一个关系标签 */
  removeTag(a: string, b: string, tag: RelationTag): void {
    const data = this.getRelationData(a, b);
    data.tags = data.tags.filter((t) => t !== tag);
  }

  /** 检查是否拥有特定关系标签 */
  hasTag(a: string, b: string, tag: RelationTag): boolean {
    const data = this.relations.get(makeRelationKey(a, b));
    return data?.tags?.includes(tag) ?? false;
  }

  /** 获取某实体与所有其他实体的关系列表 */
  getAll(entityId: string): Array<{ otherId: string; data: RelationData }> {
    const result: Array<{ otherId: string; data: RelationData }> = [];
    for (const [key, data] of this.relations) {
      const [a, b] = key.split(":");
      if (a === entityId) result.push({ otherId: b!, data });
      else if (b === entityId) result.push({ otherId: a!, data });
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
  toJSON(): Record<string, RelationData> {
    return Object.fromEntries(this.relations);
  }
}
