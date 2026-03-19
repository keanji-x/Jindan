import type { AvailableAction } from "../../world/types.js";
import type { ActionId } from "../actions/types.js";

export interface BrainDecision {
  action: ActionId;
  targetId?: string;
}

/** Lightweight context passed to NPC brains for decision-making */
export interface BrainContext {
  /** Core qi ratio: current / max (0..1) */
  qiRatio: number;
}

export interface AgentBrain {
  id: string; // 注入给实体的独一无二的大脑型号，如 weed_brain
  decide(actions: AvailableAction[], ctx: BrainContext): BrainDecision | null;
}
