// ============================================================
// Action type definitions
// ============================================================

import type { SpeciesType, Entity } from "../types.js";

/** 动态传入的上下文环境，解耦具体的 World 类 */
export interface ActionContext {
  actionCost: number;
  ambientQi: { current: number; total: number };
  tick: number;
  events: { emit: (event: any) => void };
  target?: Entity;
}

/** 统一的 Action 执行器 */
export type ActionHandler = (
  entity: Entity,
  actionId: string,
  context: ActionContext,
) => { success: boolean; flux?: number; [key: string]: unknown };

/** Action 唯一标识 */
export type ActionId = "meditate" | "moonlight" | "photosynth" | "devour" | "breakthrough" | "rest";

/** 完整的 Action 定义 */
export interface ActionDef {
  /** 唯一标识 */
  id: ActionId;
  /** 显示名 (中文) */
  name: string;
  /** 一句话描述 */
  description: string;
  /** CLI 快捷命令名 (比如 jindan meditate) */
  cliCommand: string;
  /** CLI 帮助行 */
  cliHelp: string;
  /** 执行消耗灵气 (回归天地) */
  qiCost: number;
  /** 哪些物种可用 */
  species: SpeciesType[];
  /** 是否需要目标 */
  needsTarget: boolean;
}
