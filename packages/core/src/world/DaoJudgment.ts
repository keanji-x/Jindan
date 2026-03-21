// ============================================================
// DaoJudgment — 天道裁决引擎 (Proportion-Based Judgment)
//
// 纯函数模块：计算实体的天道占比、判定是否超标、计算回收量。
// 这是双向流系统的核心裁判。
// ============================================================

/** 天道裁决结果 */
export interface JudgmentResult {
  /** 当前占比 S = entity_qi / world_total */
  proportion: number;
  /** 物种容忍比例上限 */
  limit: number;
  /** 是否超标 */
  exceeds: boolean;
  /** 超标幅度 (> 0 时有效) */
  overflow: number;
  /** 应被回收的粒子数 */
  drainAmount: number;
}

export const DaoJudgment = {
  /**
   * 判定一个实体是否超出天道容忍。
   *
   * @param entityQi 实体核心粒子总量
   * @param worldTotal 世界粒子总量常数
   * @param speciesLimit 物种在当前 realm 的容忍比例
   * @param drainRate 天道回收比率 (0-1)
   */
  judge(
    entityQi: number,
    worldTotal: number,
    speciesLimit: number,
    drainRate: number,
  ): JudgmentResult {
    if (worldTotal <= 0 || entityQi <= 0) {
      return { proportion: 0, limit: speciesLimit, exceeds: false, overflow: 0, drainAmount: 0 };
    }

    const proportion = entityQi / worldTotal;
    const exceeds = proportion > speciesLimit;
    const overflow = Math.max(0, proportion - speciesLimit);

    // 回收量 = 超标粒子数 × drainRate
    // 超标粒子数 = overflow × worldTotal
    let drainAmount = 0;
    if (exceeds) {
      const excessQi = overflow * worldTotal;
      drainAmount = Math.max(1, Math.floor(excessQi * drainRate));
      // 不能抽取超过实体拥有的
      drainAmount = Math.min(drainAmount, entityQi);
    }

    return { proportion, limit: speciesLimit, exceeds, overflow, drainAmount };
  },

  /**
   * 计算天道实体应向众生释放的粒子量。
   * 当天道占比过高时（灵气都淤在天道身上），它主动散发。
   *
   * @param daoQi 天道当前粒子量
   * @param worldTotal 世界粒子总量
   * @param entityCount 当前存活非Dao实体数
   * @param releaseRate 释放比率 (0-1)
   */
  calcRelease(daoQi: number, worldTotal: number, entityCount: number, releaseRate: number): number {
    if (worldTotal <= 0 || daoQi <= 0 || entityCount <= 0) return 0;

    const daoProportion = daoQi / worldTotal;
    // 天道占比一般比较高（众生才刚开始修炼），
    // 当天道占比 > 0.8 时才开始释放（给新生物留空间）
    const threshold = 0.8;
    if (daoProportion <= threshold) return 0;

    const excess = (daoProportion - threshold) * worldTotal;
    return Math.max(1, Math.floor(excess * releaseRate));
  },
};
