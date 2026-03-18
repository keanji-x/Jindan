// ============================================================
// CultivationSystem — 修炼 / 突破
// ============================================================

import type { MVP_CONFIG } from "../config.js";
import type { EventBus } from "../EventBus.js";
import type { Cultivator, WorldResources } from "../types.js";

export class CultivationSystem {
  constructor(
    private readonly config: typeof MVP_CONFIG,
    private readonly events: EventBus,
  ) {}

  /** 修炼一次: 从区域吸收灵气 → 转化为体内灵力 + 经验 */
  cultivate(
    cultivator: Cultivator,
    resources: WorldResources,
    tick: number,
  ): { success: boolean; expGained: number; qiAbsorbed: number } {
    const cost = this.config.cultivator.cultivateQiCost;

    // 灵气不足
    if (resources.ambientQi.current < cost) {
      return { success: false, expGained: 0, qiAbsorbed: 0 };
    }

    // 吸收灵气
    const qiAbsorbed = Math.min(cost, cultivator.maxQi - cultivator.qi);
    resources.ambientQi.current -= cost; // 消耗区域灵气
    cultivator.qi += qiAbsorbed;

    // 获得经验 (悟性加成: 随机波动 ±30%)
    const fluctuation = 0.7 + Math.random() * 0.6;
    const expGained = Math.floor(this.config.cultivator.cultivateExpBase * fluctuation);
    cultivator.exp += expGained;

    this.events.emit({
      tick,
      type: "cultivator_cultivated",
      data: {
        id: cultivator.id,
        name: cultivator.name,
        expGained,
        qiAbsorbed,
        totalExp: cultivator.exp,
        expToNext: cultivator.expToNext,
        ambientQiLeft: resources.ambientQi.current,
      },
      message: `「${cultivator.name}」吐纳修炼，吸收灵气 ${qiAbsorbed}，获得经验 ${expGained}（${cultivator.exp}/${cultivator.expToNext}）`,
    });

    return { success: true, expGained, qiAbsorbed };
  }

  /** 尝试突破: 经验足够且有灵力储备则升级 */
  tryBreakthrough(cultivator: Cultivator, tick: number): { success: boolean; newRealm?: number } {
    if (cultivator.exp < cultivator.expToNext) {
      return { success: false };
    }

    if (cultivator.realm >= 10) {
      return { success: false }; // 已是最高境界
    }

    // 突破消耗所有灵力
    const qiCost = Math.floor(cultivator.maxQi * 0.5);
    if (cultivator.qi < qiCost) {
      return { success: false };
    }

    // 突破成功率: 基础 70% + 灵力充盈加成
    const qiRatio = cultivator.qi / cultivator.maxQi;
    const successRate = 0.7 + qiRatio * 0.2;

    if (Math.random() > successRate) {
      // 突破失败, 损失部分经验和灵力
      const expLoss = Math.floor(cultivator.expToNext * 0.2);
      cultivator.exp -= expLoss;
      cultivator.qi -= qiCost;
      return { success: false };
    }

    // 突破成功!
    cultivator.qi -= qiCost;
    cultivator.exp -= cultivator.expToNext;
    cultivator.realm += 1;

    // 更新衍生属性
    const cfg = this.config.cultivator;
    cultivator.expToNext = cfg.expToNext(cultivator.realm);
    cultivator.maxQi = cfg.maxQi(cultivator.realm);
    cultivator.power =
      cfg.basePower(cultivator.realm) + Math.floor(Math.random() * cultivator.realm * 2);
    cultivator.lifespan = cfg.lifespan(cultivator.realm);

    this.events.emit({
      tick,
      type: "cultivator_breakthrough",
      data: {
        id: cultivator.id,
        name: cultivator.name,
        newRealm: cultivator.realm,
        power: cultivator.power,
      },
      message: `✨「${cultivator.name}」突破成功！境界提升至 ${cultivator.realm} 阶，战力 ${cultivator.power}`,
    });

    return { success: true, newRealm: cultivator.realm };
  }
}
