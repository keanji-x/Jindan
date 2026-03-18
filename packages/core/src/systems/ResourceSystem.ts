// ============================================================
// ResourceSystem — 灵脉产出 / 灵气凝结 / 死亡回收
// ============================================================

import type { MVP_CONFIG } from "../config.js";
import type { EventBus } from "../EventBus.js";
import type { Beast, Cultivator, WorldResources } from "../types.js";

export class ResourceSystem {
  constructor(
    private readonly config: typeof MVP_CONFIG,
    private readonly events: EventBus,
  ) {}

  /** 创建初始世界资源 */
  createInitialResources(): WorldResources {
    const { vein, zone } = this.config;
    return {
      spiritVein: {
        grade: vein.grade,
        outputPerTick: vein.outputPerTick,
        maxCapacity: vein.maxCapacity,
        remaining: vein.maxCapacity,
      },
      ambientQi: {
        current: zone.qiCapacity * 0.8, // 初始 80% 灵气浓度
        capacity: zone.qiCapacity,
      },
      unclaimedStones: 0,
    };
  }

  // ── Step 1: 灵脉产出 ──────────────────────────────────────

  /** 灵脉向区域注入灵气 */
  produceQi(resources: WorldResources, tick: number): void {
    const { spiritVein, ambientQi } = resources;

    if (spiritVein.remaining <= 0) {
      // 灵脉枯竭
      this.events.emit({
        tick,
        type: "vein_depleted",
        data: {},
        message: "⚠️ 灵脉枯竭，天地灵气断绝！末法时代降临！",
      });
      return;
    }

    const output = Math.min(spiritVein.outputPerTick, spiritVein.remaining);
    spiritVein.remaining -= output;
    ambientQi.current += output;

    this.events.emit({
      tick,
      type: "vein_output",
      data: { output, remaining: spiritVein.remaining },
      message: `灵脉吐纳，注入灵气 ${output}（剩余储量 ${spiritVein.remaining}）`,
    });
  }

  // ── Step 6: 溢出凝结 ──────────────────────────────────────

  /** 灵气超过区域容量 → 凝结灵石 */
  condenseOverflow(resources: WorldResources, tick: number): void {
    const { ambientQi } = resources;
    if (ambientQi.current <= ambientQi.capacity) return;

    const overflow = ambientQi.current - ambientQi.capacity;
    const stones = Math.floor(overflow / this.config.zone.qiToStoneRatio);

    ambientQi.current = ambientQi.capacity;
    resources.unclaimedStones += stones;

    if (stones > 0) {
      this.events.emit({
        tick,
        type: "qi_overflow",
        data: { overflow, stonesCondensed: stones },
        message: `灵气溢出凝结，产生 ${stones} 枚灵石`,
      });
    }
  }

  // ── 死亡回收 ──────────────────────────────────────────────

  /** 修士死亡 → 灵力释放 + 灵石掉落 */
  recycleCultivator(
    cultivator: Cultivator,
    resources: WorldResources,
    tick: number,
    cause: string,
  ): void {
    resources.ambientQi.current += cultivator.qi;
    resources.unclaimedStones += cultivator.spiritStones;

    this.events.emit({
      tick,
      type: "cultivator_died",
      data: {
        id: cultivator.id,
        name: cultivator.name,
        cause,
        qiReleased: cultivator.qi,
        stonesDropped: cultivator.spiritStones,
      },
      message: `修士「${cultivator.name}」${cause}，灵力 ${cultivator.qi} 回归天地，${cultivator.spiritStones} 灵石散落`,
    });

    cultivator.alive = false;
    cultivator.qi = 0;
    cultivator.spiritStones = 0;
  }

  /** 妖兽死亡 → 灵力释放 + 妖丹掉落 */
  recycleBeast(beast: Beast, resources: WorldResources, tick: number, cause: string): number {
    resources.ambientQi.current += beast.qi;
    const droppedStones = beast.coreSpiritStones;

    this.events.emit({
      tick,
      type: "beast_died",
      data: {
        id: beast.id,
        name: beast.name,
        cause,
        qiReleased: beast.qi,
        stonesDropped: droppedStones,
      },
      message: `妖兽「${beast.name}」${cause}，灵力 ${beast.qi} 回归天地，掉落妖丹价值 ${droppedStones} 灵石`,
    });

    beast.alive = false;
    beast.qi = 0;
    return droppedStones;
  }

  // ── 妖兽被动消耗 ──────────────────────────────────────────

  /** 妖兽每 tick 被动消耗灵气, 灵气不足则饿死 */
  drainBeastQi(beast: Beast, resources: WorldResources, tick: number): boolean {
    const drain = this.config.beast.qiDrain(beast.rank);

    if (resources.ambientQi.current < drain) {
      // 灵气不足，妖兽饿死
      this.recycleBeast(beast, resources, tick, "灵气不足，化为灰烬");
      return false;
    }

    resources.ambientQi.current -= drain;
    return true;
  }
}
