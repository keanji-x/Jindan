import type { AgentBrain, BrainDecision } from "./types.js";

export const MiasmaBrain: AgentBrain = {
  id: "miasma_brain",
  decide(actions, ctx): BrainDecision | null {
    // 大自然的抗体，噬煞而生
    // 饱食负反馈：qi > 50% 时不主动捕猎，优先吸收煞气
    const hungry = ctx.qiRatio < 0.5;

    if (hungry) {
      // 饥饿状态：优先吞噬补充灵气
      const devourActions = actions.filter(
        (a) => a.action === "devour" && a.possible && a.targetId,
      );
      if (devourActions.length > 0) {
        const target = devourActions[Math.floor(Math.random() * devourActions.length)]!;
        return { action: "devour", targetId: target.targetId };
      }
    }

    // 优先级 2: 突破进化
    const brk = actions.find((a) => a.action === "breakthrough" && a.possible);
    if (brk) return { action: "breakthrough" };

    // 优先级 3: 吸收环境里的 S(煞气) 清洁世界
    const moon = actions.find((a) => a.action === "moonlight" && a.possible);
    if (moon) return { action: "moonlight" };

    // 饱食但无其他事做：偶尔也吞噬 (20% 概率)
    if (!hungry) {
      const devourActions = actions.filter(
        (a) => a.action === "devour" && a.possible && a.targetId,
      );
      if (devourActions.length > 0 && Math.random() < 0.2) {
        const target = devourActions[Math.floor(Math.random() * devourActions.length)]!;
        return { action: "devour", targetId: target.targetId };
      }
    }

    return { action: "rest" };
  },
};
