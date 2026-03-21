import { HeuristicOptimizerBrain } from "./heuristic.js";
import type { AgentBrain } from "./types.js";

class OptimizerRegistryClass {
  private brains: Map<string, AgentBrain> = new Map();

  constructor() {
    this.register(HeuristicOptimizerBrain);
  }

  register(brain: AgentBrain) {
    this.brains.set(brain.id, brain);
  }

  get(id: string): AgentBrain | undefined {
    return this.brains.get(id);
  }
}

export const AiRegistry = new OptimizerRegistryClass();
