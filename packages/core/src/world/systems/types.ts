// ============================================================
// System types — ActionDef, ActionHandler, ActionContext
//
// Core type definitions for the GameSystem framework.
// ============================================================

import type { ParticleId } from "../config/types.js";
import type { Entity, SpeciesType, WorldEvent } from "../types.js";

/** 动态传入的上下文环境，解耦具体的 World 类 */
export interface ActionContext {
  actionCost: number;
  ambientPool: { pools: Record<ParticleId, number>; total: number };
  tick: number;
  events: { emit: (event: Omit<WorldEvent, "index">) => void };
  target?: Entity;
  payload?: unknown;
}

/** 统一的 Action 执行器 */
export type ActionHandler = (
  entity: Entity,
  actionId: string,
  context: ActionContext,
) => { success: boolean; [key: string]: unknown };

/** 完整的 Action 定义 */
export interface ActionDef {
  /** 唯一标识 */
  id: string;
  /** 显示名 (中文) */
  name: string;
  /** 一句话描述 */
  description: string;
  /** CLI 快捷命令名 */
  cliCommand?: string;
  /** CLI 帮助行 */
  cliHelp?: string;
  /** 执行消耗灵气 (回归天地) */
  qiCost: number;
  /** 哪些物种可用 */
  species: SpeciesType[];
  /** 是否需要目标 */
  needsTarget: boolean;
  /** 所属系统 ID (注册时由 ActionRegistry 自动填充) */
  systemId?: string;
  /** 在 UI 中显示进度信息 (如突破百分比)，返回 undefined 表示不显示 */
  showProgress?: (entity: Entity) => string | undefined;
  /** NPC 选择目标时的过滤策略 */
  npcTargetFilter?: "npc-only";
  /**
   * [可选] 前置条件校验 — 由各 System 自行判定该 Action 是否可执行。
   * World.canAct 会在通用检查（灵气足够等）之后调用此钩子。
   * 返回 { ok: false, reason } 表示不可执行。
   */
  canExecute?: (entity: Entity, ctx: CanExecuteContext) => { ok: boolean; reason?: string };
}

/** canExecute 回调的最小世界上下文 — 避免 Action 反向依赖 World 实例 */
export interface CanExecuteContext {
  getAliveEntities(): Entity[];
}
