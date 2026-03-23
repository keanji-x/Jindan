// ============================================================
// Agent Types — LLM 决策包和工作记忆类型
// ============================================================

/** LLM 返回的决策包 */
export interface DecisionPacket {
  innerVoice: string;
  emotion: string;
  shortTermGoal: string;
  plan: PlanStep[];
}

/** 行动计划的一步 */
export interface PlanStep {
  action: string;
  targetId?: string;
  message?: string;  // chat 时的消息内容
  reason: string;
}

/** 工作记忆中的一条思考记录 */
export interface ThoughtRecord {
  tick: number;
  innerVoice: string;
  plan: PlanStep[];
  outcomes: Array<{ action: string; success: boolean }>;
}

/** 有效的情绪标签 */
export const EMOTION_TAGS = [
  "calm",
  "happy",
  "angry",
  "sad",
  "fearful",
  "surprised",
  "eager",
  "disgusted",
  "confused",
  "tired",
] as const;

export type EmotionTag = (typeof EMOTION_TAGS)[number];
