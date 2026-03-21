// ============================================================
// System types — ActionDef, ActionHandler, ActionContext
//
// Core type definitions for the GameSystem framework.
// ============================================================

import type { ParticleId } from "../config/types.js";
import type { Entity, WorldEvent } from "../types.js";

/** 动态传入的上下文环境，解耦具体的 World 类 */
export interface ActionContext {
  actionCost: number;
  ambientPool: { pools: Record<ParticleId, number>; total: number };
  tick: number;
  events: { emit: (event: Omit<WorldEvent, "index">) => void };
  target?: Entity;
  payload?: unknown;
  /** 查询两个实体之间的关系值 (-100 ~ +100)，默认 0 */
  getRelation(a: string, b: string): number;
  /** 修改两个实体之间的关系值（增量），返回 clamp 后的新值 */
  adjustRelation(a: string, b: string, delta: number): number;
}

/** 统一的 Action 执行器 (旧版，待迁移) */
export type ActionHandler = (
  entity: Entity,
  actionId: string,
  context: ActionContext,
) => { success: boolean; [key: string]: unknown };

import type { ActionOutcome } from "../effects/types.js";

/** 新版基于声明式 Effect 的解析器 */
export type ActionResolver = (
  entity: Entity,
  actionId: string,
  context: ActionContext,
) => ActionOutcome;

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
  /** 是否需要目标 */
  needsTarget: boolean;
  /** 所属系统 ID (注册时由 ActionRegistry 自动填充) */
  systemId?: string;
  /** 在 UI 中显示进度信息 (如突破百分比)，返回 undefined 表示不显示 */
  showProgress?: (entity: Entity) => string | undefined;
  /** NPC 选择目标时的过滤策略 */
  npcTargetFilter?: "npc-only";
  /** 对目标的关系值合法区间 [min, max]，目标关系不在范围内则不可选 */
  relationRange?: [number, number];
  /**
   * [可选] 前置条件校验 — 由各 System 自行判定该 Action 是否可执行。
   * World.canAct 会在通用检查（灵气足够等）之后调用此钩子。
   * 返回 { ok: false, reason } 表示不可执行。
   */
  canExecute?: (entity: Entity, ctx: CanExecuteContext) => { ok: boolean; reason?: string };

  /**
   * 图谱组装约束（黑名单）
   * 用于动态拼接 ActionGraph 时的合法性校验
   */
  constraints?: {
    /** 不可以连接在哪些 action 之后执行 (例如：突破后不能紧接休息) */
    cannotFollow?: string[];
    /** 不可以连接在哪些 action 之前执行 (例如：死亡前不能触发吸收) */
    cannotPrecede?: string[];
  };
}

/** canExecute 回调的最小世界上下文 — 避免 Action 反向依赖 World 实例 */
export interface CanExecuteContext {
  getAliveEntities(): Entity[];
}
