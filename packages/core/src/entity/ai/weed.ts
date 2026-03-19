import type { AgentBrain, BrainDecision } from "./types.js";

export const WeedBrain: AgentBrain = {
  id: "weed_brain",
  decide(actions): BrainDecision | null {
    // 草是极其简单的灵力累积器
    // 优先级 1: 尝试突破
    const brk = actions.find((a) => a.action === "breakthrough" && a.possible);
    if (brk) return { action: "breakthrough" };

    // 优先级 2: 光合吞吐 (吸收环境养分)
    const photo = actions.find((a) => a.action === "photosynth" && a.possible);
    if (photo) return { action: "photosynth" };

    return { action: "rest" };
  },
};
