import type { ActionId, AvailableAction } from "../types.js";

/** Lightweight context passed to NPC brains for decision-making */
export interface BrainContext {
  /** Current raw qi */
  qiCurrent: number;
  /** Max raw qi */
  qiMax: number;
  /** Core qi ratio: current / max (0..1) */
  qiRatio: number;
  /** Notification: recent events affecting this entity */
  recentEvents?: import("../types.js").WorldEventRecord[];
}

export interface BrainDecision {
  action: ActionId;
  targetId?: string;
  payload?: unknown;
}

export interface AgentBrain {
  id: string; // 注入给实体的独一无二的大脑型号，如 weed_brain
  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null;
}
