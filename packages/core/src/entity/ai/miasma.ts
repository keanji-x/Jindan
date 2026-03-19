import type { AgentBrain, BrainDecision } from "./types.js";

export const MiasmaBrain: AgentBrain = {
  id: "miasma_brain",
  decide(actions): BrainDecision | null {
    // 大自然的抗体，噬煞而生
    // 优先级 1: 消灭一切可以被吞噬的薄弱目标
    const devourActions = actions.filter((a) => a.action === "devour" && a.possible && a.targetId);
    if (devourActions.length > 0) {
      // 随机挑选一个幸运儿清剿
      const target = devourActions[Math.floor(Math.random() * devourActions.length)]!;
      return { action: "devour", targetId: target.targetId };
    }

    // 优先级 2: 突破进化
    const brk = actions.find((a) => a.action === "breakthrough" && a.possible);
    if (brk) return { action: "breakthrough" };

    // 优先级 3: 吸收环境里的 S(煞气) 清洁世界
    const moon = actions.find((a) => a.action === "moonlight" && a.possible);
    if (moon) return { action: "moonlight" };

    return { action: "rest" };
  },
};
