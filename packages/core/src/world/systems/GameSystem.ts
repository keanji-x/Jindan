// ============================================================
// GameSystem — 统一的 System + N Actions 范式
//
// 每个 System 是一个独立的游戏机制，拥有多个 Action，
// 也可以定义全局生命周期 (如 onTick) 执行被动逻辑。
// ============================================================

import type { EventBus } from "../../EventBus.js";
import type { AmbientPool, Entity } from "../types.js";
import type { ActionDef, ActionResolver } from "./types.js";

// Forward reference to World to avoid circular imports
// Systems that need World access should use `context.world`
type WorldRef = import("../World.js").World;

/** 每次 Tick 发送给系统的全局上下文 */
export interface WorldTickContext {
  tick: number;
  entities: Entity[]; // 所有存活的实体
  deadEntities: Entity[]; // 所有已安息实体（轮回候选）
  ambientPool: AmbientPool; // 天地灵气池
  events: EventBus; // 全局事件总线
  world: WorldRef; // 世界实例引用（用于关系图访问、performAction 等）

  /** 允许被动机制（如化生法则）往世界注入新实体 */
  addEntity: (entity: Entity) => void;
  /** 允许被动机制触发轮回（原地重生已死实体） */
  reincarnateEntity: (
    entityId: string,
    newName: string,
    newSpecies: string,
  ) => { success: boolean; entity?: Entity; error?: string };
}

/** 游戏系统 — System + N Actions 的一等公民范式 */
export interface GameSystem {
  /** 系统唯一 ID */
  id: string;
  /** 系统显示名 */
  name: string;
  /** 此系统主动提供的 Action 定义 (如无主动 action 可为空数组) */
  actions: ActionDef[];
  /** 主动 Action 的统一执行器 — 如果 actions 不为空则必须提供 (支持新/旧版本签名) */
  handler?: ActionResolver;

  /**
   * [可选] 被动机制：世界每次 tick 结算时触发的逻辑
   * 适用于：灵气耗散、刷怪、天气变化、世界任务等
   */
  onTick?: (context: WorldTickContext) => void;
}
