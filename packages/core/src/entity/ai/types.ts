import type { AvailableAction } from "../../world/types.js";
import type { ActionId } from "../actions/types.js";

export interface BrainDecision {
  action: ActionId;
  targetId?: string;
}

export interface AgentBrain {
  id: string; // 注入给实体的独一无二的大脑型号，如 weed_brain
  decide(actions: AvailableAction[]): BrainDecision | null;
}
