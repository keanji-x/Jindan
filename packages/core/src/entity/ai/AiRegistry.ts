import { MiasmaBrain } from "./miasma.js";
import type { AgentBrain } from "./types.js";
import { WeedBrain } from "./weed.js";

class AiRegistryClass {
  private brains: Map<string, AgentBrain> = new Map();

  constructor() {
    this.register(WeedBrain);
    this.register(MiasmaBrain);
  }

  register(brain: AgentBrain) {
    this.brains.set(brain.id, brain);
  }

  get(id: string): AgentBrain | undefined {
    return this.brains.get(id);
  }
}

export const AiRegistry = new AiRegistryClass();
