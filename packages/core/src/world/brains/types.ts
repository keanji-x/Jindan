import type { ActionId, AvailableAction } from "../types.js";
import type { Personality } from "./optimizer/PersonalityObjective.js";

/** Lightweight context passed to NPC brains for decision-making */
export interface BrainContext {
  /** Current raw qi */
  qiCurrent: number;
  /** Max raw qi */
  qiMax: number;
  /** Core qi ratio: current / max (0..1) */
  qiRatio: number;
  /** Current mood (0..1, default 0.5) */
  mood: number;
  /** Notification: recent events affecting this entity */
  recentEvents?: import("../types.js").WorldEventRecord[];
  /** 性格向量 — 影响多目标优化权重 */
  personality?: Personality;
  /** Average relation score with known entities (-1..1) */
  avgRelation?: number;
  /** Per-species brain lookahead depth (defaults to ACTIONS_PER_TICK) */
  brainDepth?: number;
}

export interface BrainDecision {
  action: ActionId;
  targetId?: string;
  payload?: unknown;
}

export interface AgentBrain {
  id: string; // 注入给实体的独一无二的大脑型号，如 weed_brain
  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null;
  /** Returns a multi-action plan for a single tick (optional, defaults to single decide) */
  decidePlan?(actions: AvailableAction[], ctx: BrainContext): BrainDecision[];
}
