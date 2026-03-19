import type { ParticleId } from "../engine/types.js";
import type { ActionId } from "../entity/types.js";

/** 灵气池状态 */
export interface QiPoolState {
  /** 环境中各粒子的数量 */
  pools: Record<ParticleId, number>;
  /** 系统内固定总粒子数（宇宙常数） */
  total: number;
}

/** 账本：边类型 */
export type LedgerEventType =
  | ActionId
  | "system_created"
  | "system_died"
  | "tick_advance"
  | "report";

/** 账本：记录实体交互或事件的有向边 */
export interface LedgerEvent {
  id: string; // 唯一事件ID
  tick: number; // 发生时间
  sourceId: string; // 发起者ID，环境事件可用 "WORLD" 或 "SYSTEM"
  targetId?: string; // 受击者/目标ID
  type: LedgerEventType; // 事件类型/边类型
  data?: Record<string, unknown>; // 事件附带的复式记账数据（如 qiCost, absorbed）
}

/** 供外部查询的实体历史视图 */
export interface EntityHistory {
  entityId: string;
  // 作为发起人的行为
  actionsInitiated: LedgerEvent[];
  // 作为目标/受害人的行为
  actionsReceived: LedgerEvent[];
}
