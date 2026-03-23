// ============================================================
// evaluateState — 统一评分函数
//
// 将 qi / mood / relation 三维融合为单一 utility score，
// 每一维由 Personality 加权。qi 使用 tanh 边际递减，
// 解决"永远打坐最优"的问题。
//
// 调优方向: 提升社交/关系维度权重，让 chat/court/devour 真正
// 能竞争过 meditate，从而增加行动丰富度和剧情触发率。
// ============================================================

import type { EntityState } from "./entity.js";
import type { Personality } from "./PersonalityObjective.js";

/**
 * 综合评分：
 *
 *   score = wSurvival  × tanh(k × ratio)        // qi 饱和曲线
 *         + wSocial    × mood                    // 心境
 *         + wBond      × avgRelation             // 人际关系均值
 *         + wAmbition  × log₂(qiMax) × 0.05     // 容量增长
 *
 * 死亡惩罚: qi ≤ 0 → -99999
 * 生死线惩罚: ratio < 20% → 额外负分
 */
export function evaluateState(state: EntityState, p: Personality): number {
  if (state.qiCurrent <= 0) return -99999;

  const ratio = state.qiMax > 0 ? state.qiCurrent / state.qiMax : 0;

  // ── qi 生存维度（tanh 边际递减）────────────────────────
  // 降低上限: greed 高的实体仍更重视 qi，但社交可以真正竞争
  const wSurvival = 0.2 + p.greed * 0.3; // [0.2, 0.5] (原 [0.3, 0.8])
  const survivalScore = Math.tanh(3 * ratio) * wSurvival;

  // ── 心境维度 ──────────────────────────────────────────
  // 大幅提升: 让 chat/court 等改善心境的动作有竞争力
  const wSocial = 0.2 + p.sociability * 0.7; // [0.2, 0.9] (原 [0.1, 0.6])
  const socialScore = state.mood * wSocial;

  // ── 人际关系维度 ──────────────────────────────────────
  // avgRelation 范围约 [-1, 1]，归一化到 [0, 1]
  // 大幅提升: 让社交行动的关系增益成为真实驱动力
  const normalizedRelation = (state.avgRelation + 1) / 2;
  const wBond = 0.1 + p.sociability * 0.5; // [0.1, 0.6] (原 [0.05, 0.30])
  const bondScore = normalizedRelation * wBond;

  // ── 野心维度（容量增长） ──────────────────────────────
  const wAmbition = p.ambition * 0.4; // [0, 0.4] (原 0.5)
  const maxBonus = state.qiMax > 0 ? Math.log2(state.qiMax) * 0.05 : 0;
  const ambitionScore = maxBonus * wAmbition;

  // ── 生死线惩罚: ratio < 20% 重罚 ─────────────────────
  const dangerPenalty = ratio < 0.2 ? -5 * (0.2 - ratio) : 0;

  return survivalScore + socialScore + bondScore + ambitionScore + dangerPenalty;
}
