// ============================================================
// World — the tick-driven world engine
// ============================================================

import { nanoid } from "nanoid";
import { MVP_CONFIG } from "./config.js";
import { EventBus } from "./EventBus.js";
import { CombatSystem } from "./systems/CombatSystem.js";
import { CultivationSystem } from "./systems/CultivationSystem.js";
import { ResourceSystem } from "./systems/ResourceSystem.js";
import type {
  ActionResult,
  AvailableAction,
  Beast,
  CombatResult,
  Cultivator,
  WorldEvent,
  WorldState,
} from "./types.js";

const BEAST_NAMES = [
  "赤焰虎",
  "碧水蛟",
  "风翼鹰",
  "玄铁熊",
  "紫电狼",
  "幽冥蛇",
  "金鬃狮",
  "霜角鹿",
  "烈焰蝠",
  "寒霜蜘蛛",
  "青鳞蟒",
  "银月狐",
  "雷云豹",
  "铁甲龟",
  "血影鹤",
];

export class World {
  readonly events = new EventBus();
  readonly resourceSystem: ResourceSystem;
  readonly cultivationSystem: CultivationSystem;
  readonly combatSystem: CombatSystem;

  private state: WorldState;

  constructor(private readonly config = MVP_CONFIG) {
    this.resourceSystem = new ResourceSystem(config, this.events);
    this.cultivationSystem = new CultivationSystem(config, this.events);
    this.combatSystem = new CombatSystem(config, this.events, this.resourceSystem);

    this.state = {
      tick: 0,
      resources: this.resourceSystem.createInitialResources(),
      cultivators: new Map(),
      beasts: new Map(),
    };

    // 初始化: 生成一批妖兽
    this.spawnBeasts(config.beast.respawnThreshold);
  }

  // ── Getters ──────────────────────────────────────────────

  get tick(): number {
    return this.state.tick;
  }

  getState(): WorldState {
    return this.state;
  }

  getCultivator(id: string): Cultivator | undefined {
    return this.state.cultivators.get(id);
  }

  getAliveCultivators(): Cultivator[] {
    return [...this.state.cultivators.values()].filter((c) => c.alive);
  }

  getAliveBeasts(): Beast[] {
    return [...this.state.beasts.values()].filter((b) => b.alive);
  }

  getSnapshot() {
    return {
      tick: this.state.tick,
      resources: { ...this.state.resources },
      cultivators: this.getAliveCultivators(),
      beasts: this.getAliveBeasts(),
    };
  }

  // ── Entity Creation ──────────────────────────────────────

  createCultivator(name: string): Cultivator {
    const cfg = this.config.cultivator;
    const realm = 1;
    const cultivator: Cultivator = {
      id: `c_${nanoid(8)}`,
      name,
      realm,
      exp: 0,
      expToNext: cfg.expToNext(realm),
      power: cfg.basePower(realm) + Math.floor(Math.random() * 3),
      qi: 0,
      maxQi: cfg.maxQi(realm),
      spiritStones: cfg.initialStones,
      alive: true,
      age: 0,
      lifespan: cfg.lifespan(realm),
    };

    this.state.cultivators.set(cultivator.id, cultivator);

    this.events.emit({
      tick: this.state.tick,
      type: "cultivator_created",
      data: { cultivator },
      message: `修士「${name}」入世！境界 ${realm} 阶，战力 ${cultivator.power}`,
    });

    return cultivator;
  }

  private spawnBeast(rank?: number): Beast {
    const cfg = this.config.beast;
    const r = rank ?? randomInt(cfg.spawnRankMin, cfg.spawnRankMax);
    const name = BEAST_NAMES[Math.floor(Math.random() * BEAST_NAMES.length)]!;

    const beast: Beast = {
      id: `b_${nanoid(8)}`,
      name: `${r}阶${name}`,
      rank: r,
      power: cfg.basePower(r) + Math.floor(Math.random() * r * 2),
      qi: r * 20,
      coreSpiritStones: cfg.coreValue(r),
      alive: true,
      age: 0,
      lifespan: cfg.lifespan(r),
    };

    this.state.beasts.set(beast.id, beast);

    this.events.emit({
      tick: this.state.tick,
      type: "beast_spawned",
      data: { beast },
      message: `妖兽「${beast.name}」出现！战力 ${beast.power}`,
    });

    return beast;
  }

  private spawnBeasts(count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnBeast();
    }
  }

  // ── Actions (called by API) ──────────────────────────────

  /** 修炼 */
  actionCultivate(cultivatorId: string): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const c = this.state.cultivators.get(cultivatorId);
      if (!c || !c.alive) {
        return this.failResult("修士不存在或已陨落", tickEvents);
      }

      const result = this.cultivationSystem.cultivate(c, this.state.resources, this.state.tick);

      if (!result.success) {
        return this.failResult("区域灵气不足，无法修炼", tickEvents);
      }

      this.advanceTick();

      return {
        success: true,
        tick: this.state.tick,
        result,
        events: tickEvents,
        availableActions: this.getAvailableActions(cultivatorId),
      };
    } finally {
      unsub();
    }
  }

  /** 尝试突破 */
  actionBreakthrough(cultivatorId: string): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const c = this.state.cultivators.get(cultivatorId);
      if (!c || !c.alive) {
        return this.failResult("修士不存在或已陨落", tickEvents);
      }

      const result = this.cultivationSystem.tryBreakthrough(c, this.state.tick);
      this.advanceTick();

      return {
        success: result.success,
        tick: this.state.tick,
        result,
        events: tickEvents,
        availableActions: this.getAvailableActions(cultivatorId),
        error: result.success ? undefined : "突破失败，火候不足",
      };
    } finally {
      unsub();
    }
  }

  /** 打怪 (随机选择一只妖兽) */
  actionFightBeast(cultivatorId: string, beastId?: string): ActionResult<CombatResult> {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const c = this.state.cultivators.get(cultivatorId);
      if (!c || !c.alive) {
        return this.failResult("修士不存在或已陨落", tickEvents);
      }

      const beasts = this.getAliveBeasts();
      if (beasts.length === 0) {
        return this.failResult("附近没有妖兽", tickEvents);
      }

      const target = beastId
        ? beasts.find((b) => b.id === beastId)
        : beasts[Math.floor(Math.random() * beasts.length)];

      if (!target) {
        return this.failResult("目标妖兽不存在", tickEvents);
      }

      const result = this.combatSystem.fightBeast(c, target, this.state.resources, this.state.tick);

      this.advanceTick();

      return {
        success: true,
        tick: this.state.tick,
        result,
        events: tickEvents,
        availableActions: c.alive ? this.getAvailableActions(cultivatorId) : [],
      };
    } finally {
      unsub();
    }
  }

  /** PvP */
  actionFightPvP(attackerId: string, defenderId: string): ActionResult<CombatResult> {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const a = this.state.cultivators.get(attackerId);
      const d = this.state.cultivators.get(defenderId);
      if (!a?.alive || !d?.alive) {
        return this.failResult("修士不存在或已陨落", tickEvents);
      }

      const result = this.combatSystem.fightPvP(a, d, this.state.resources, this.state.tick);

      this.advanceTick();

      return {
        success: true,
        tick: this.state.tick,
        result,
        events: tickEvents,
        availableActions: a.alive ? this.getAvailableActions(attackerId) : [],
      };
    } finally {
      unsub();
    }
  }

  /** 拾取无主灵石 */
  actionPickupStones(cultivatorId: string): ActionResult {
    const tickEvents: WorldEvent[] = [];
    const unsub = this.events.onAny((e) => tickEvents.push(e));

    try {
      const c = this.state.cultivators.get(cultivatorId);
      if (!c || !c.alive) {
        return this.failResult("修士不存在或已陨落", tickEvents);
      }

      const stones = this.state.resources.unclaimedStones;
      if (stones <= 0) {
        return this.failResult("没有可拾取的灵石", tickEvents);
      }

      // 拾取一半 (留些给别人)
      const picked = Math.ceil(stones / 2);
      this.state.resources.unclaimedStones -= picked;
      c.spiritStones += picked;

      this.events.emit({
        tick: this.state.tick,
        type: "pickup_stones",
        data: { cultivatorId, picked, remaining: this.state.resources.unclaimedStones },
        message: `「${c.name}」拾取 ${picked} 枚灵石`,
      });

      this.advanceTick();

      return {
        success: true,
        tick: this.state.tick,
        result: { picked },
        events: tickEvents,
        availableActions: this.getAvailableActions(cultivatorId),
      };
    } finally {
      unsub();
    }
  }

  // ── Tick Engine ──────────────────────────────────────────

  /** 推进世界时间 1 tick (called after every player action) */
  private advanceTick(): void {
    this.state.tick += 1;
    const tick = this.state.tick;
    const resources = this.state.resources;

    // Step 1: 灵脉产出
    this.resourceSystem.produceQi(resources, tick);

    // Step 3: 妖兽被动消耗
    for (const beast of this.getAliveBeasts()) {
      this.resourceSystem.drainBeastQi(beast, resources, tick);
    }

    // Step 4: 老化
    for (const c of this.state.cultivators.values()) {
      if (c.alive) c.age += 1;
    }
    for (const b of this.state.beasts.values()) {
      if (b.alive) b.age += 1;
    }

    // Step 5: 死亡检查 (寿终)
    for (const c of this.getAliveCultivators()) {
      if (c.age >= c.lifespan) {
        this.resourceSystem.recycleCultivator(c, resources, tick, "寿元耗尽，坐化归去");
      }
    }
    for (const b of this.getAliveBeasts()) {
      if (b.age >= b.lifespan) {
        this.resourceSystem.recycleBeast(b, resources, tick, "寿元耗尽，化为尘土");
      }
    }

    // Step 6: 溢出凝结
    this.resourceSystem.condenseOverflow(resources, tick);

    // Step 7: 生态刷新
    const aliveBeasts = this.getAliveBeasts().length;
    if (aliveBeasts < this.config.beast.respawnThreshold) {
      this.spawnBeasts(this.config.beast.respawnCount);
    }

    // Step 8: tick 完成事件
    this.events.emit({
      tick,
      type: "tick_complete",
      data: this.getSnapshot(),
      message: `--- 第 ${tick} 天结束 ---`,
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  private getAvailableActions(cultivatorId: string): AvailableAction[] {
    const c = this.state.cultivators.get(cultivatorId);
    if (!c || !c.alive) return [];

    const { resources } = this.state;
    const hasQi = resources.ambientQi.current >= this.config.cultivator.cultivateQiCost;
    const hasBeasts = this.getAliveBeasts().length > 0;
    const hasStones = resources.unclaimedStones > 0;
    const canBreakthrough = c.exp >= c.expToNext && c.qi >= c.maxQi * 0.5;

    return [
      {
        action: "cultivate",
        description: "修炼 — 吸收灵气，增长修为",
        possible: hasQi,
        reason: hasQi ? undefined : "区域灵气不足",
      },
      {
        action: "breakthrough",
        description: `突破 — 尝试提升境界 (${c.exp}/${c.expToNext})`,
        possible: canBreakthrough,
        reason: canBreakthrough ? undefined : "经验或灵力不足",
      },
      {
        action: "combat_beast",
        description: `狩猎妖兽 (${this.getAliveBeasts().length} 只)`,
        possible: hasBeasts,
        reason: hasBeasts ? undefined : "没有妖兽",
      },
      {
        action: "pickup_stones",
        description: `拾取灵石 (${resources.unclaimedStones} 枚)`,
        possible: hasStones,
        reason: hasStones ? undefined : "没有无主灵石",
      },
      {
        action: "rest",
        description: "休息 — 跳过本回合",
        possible: true,
      },
    ];
  }

  private failResult<T = unknown>(error: string, events: WorldEvent[]): ActionResult<T> {
    return {
      success: false,
      tick: this.state.tick,
      events,
      availableActions: [],
      error,
    };
  }
}

// ── Utility ────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
