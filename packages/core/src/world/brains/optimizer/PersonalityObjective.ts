// ============================================================
// PersonalityObjective — 性格驱动的多目标评估函数
//
// 委托 evaluateState() 做综合评分。
// 本模块保留 Personality 接口 / randomPersonality 工厂。
// ============================================================

import type { EntityState } from "./entity.js";
import { evaluateState } from "./evaluator.js";
import type { ObjectiveFunction } from "./types.js";

/**
 * 四维性格向量。每个维度 0-1：
 * - aggression:   倾向吞噬/攻击 vs 和平修炼
 * - ambition:     倾向突破/扩容 vs 安于现状
 * - sociability:  倾向社交（chat/court/treat） vs 独修
 * - greed:        倾向囤积灵气 vs 愿意消耗
 */
export interface Personality {
  aggression: number;
  ambition: number;
  sociability: number;
  greed: number;
}

/** 默认性格（近似旧 QiRatioObjective 的行为） */
export const DEFAULT_PERSONALITY: Personality = {
  aggression: 0.3,
  ambition: 0.5,
  sociability: 0.4,
  greed: 0.5,
};

/** 按物种生成随机性格（正态分布截断至 [0,1]） */
export function randomPersonality(speciesHint?: string): Personality {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const gauss = (mean: number, std: number) =>
    clamp01(mean + std * (Math.random() + Math.random() + Math.random() - 1.5) * 0.8165);

  switch (speciesHint) {
    case "beast":
      return {
        aggression: gauss(0.7, 0.2),
        ambition: gauss(0.5, 0.2),
        sociability: gauss(0.2, 0.15),
        greed: gauss(0.4, 0.2),
      };
    case "plant":
      return {
        aggression: gauss(0.1, 0.1),
        ambition: gauss(0.3, 0.2),
        sociability: gauss(0.1, 0.1),
        greed: gauss(0.7, 0.15),
      };
    case "human":
      return {
        aggression: gauss(0.3, 0.25),
        ambition: gauss(0.6, 0.25),
        sociability: gauss(0.6, 0.25),
        greed: gauss(0.4, 0.25),
      };
    default:
      return {
        aggression: gauss(0.3, 0.2),
        ambition: gauss(0.5, 0.2),
        sociability: gauss(0.4, 0.2),
        greed: gauss(0.5, 0.2),
      };
  }
}

/**
 * 性格驱动的多目标评估函数。
 * 委托 evaluateState() 做具体计算。
 */
export class PersonalityObjective implements ObjectiveFunction<EntityState> {
  constructor(private readonly personality: Personality) {}

  evaluate(state: EntityState): number {
    return evaluateState(state, this.personality);
  }
}
