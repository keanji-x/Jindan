// ============================================================
// DramaDirector — 剧情导演
//
// 预编写冲突剧情模板，每 tick 检查前置条件，满足则
// 注入 Effect 链制造戏剧冲突。零 LLM，纯规则驱动。
// ============================================================

import type { Effect } from "../effects/types.js";
import type { Entity, WorldEventRecord } from "../types.js";
import type { World } from "../World.js";

/** 剧情上下文 — DramaDirector 传给模板的只读世界快照 */
export interface DramaContext {
  entities: Entity[];
  getRelation: (a: string, b: string) => number;
  daoTanks: Record<string, number>;
  tick: number;
  recentEvents: WorldEventRecord[];
  totalParticles: number;
}

/** 一次剧情的演员表 */
export interface DramaCast {
  /** 角色映射，如 { attacker: Entity, victim: Entity, rescuer: Entity } */
  actors: Record<string, Entity>;
  /** 模板生成的一句话标题 */
  headline: string;
}

/** 剧情模板定义 */
export interface PlotTemplate {
  id: string;
  name: string;
  /** 同一剧情的冷却（tick 数） */
  cooldownTicks: number;
  /** 全局最多触发几次（-1 = 无限） */
  maxFirings: number;
  /** 前置条件：返回匹配的演员表（空数组 = 不满足） */
  match: (ctx: DramaContext) => DramaCast[];
  /** 产出 Effect 链 */
  produce: (cast: DramaCast, tick: number) => Effect[];
}

/** 剧情触发记录 */
interface FiringRecord {
  lastTick: number;
  totalFirings: number;
}

/** 剧情导演引擎 */
export class DramaDirector {
  private readonly templates: PlotTemplate[] = [];
  private readonly firingHistory = new Map<string, FiringRecord>();

  /** 注册一个剧情模板 */
  register(template: PlotTemplate): void {
    this.templates.push(template);
  }

  /** 批量注册 */
  registerAll(templates: PlotTemplate[]): void {
    for (const t of templates) this.register(t);
  }

  /**
   * 每 tick 调用：扫描所有模板，返回应注入的 Effect 数组。
   * 每个模板每 tick 最多触发一次。
   */
  evaluate(world: World, tick: number): Effect[] {
    const ctx = this.buildContext(world, tick);
    const allEffects: Effect[] = [];

    for (const template of this.templates) {
      // 冷却检查
      const history = this.firingHistory.get(template.id);
      if (history) {
        if (tick - history.lastTick < template.cooldownTicks) continue;
        if (template.maxFirings >= 0 && history.totalFirings >= template.maxFirings) continue;
      }

      // 条件匹配
      const casts = template.match(ctx);
      if (casts.length === 0) continue;

      // 取第一个匹配（避免同一模板同 tick 多次触发）
      const cast = casts[0]!;
      const effects = template.produce(cast, tick);

      if (effects.length > 0) {
        allEffects.push(...effects);

        // 更新触发记录
        const prev = this.firingHistory.get(template.id);
        this.firingHistory.set(template.id, {
          lastTick: tick,
          totalFirings: (prev?.totalFirings ?? 0) + 1,
        });
      }
    }

    return allEffects;
  }

  private buildContext(world: World, tick: number): DramaContext {
    const entities = world.getAliveEntities();
    const daoTanks = world.getDaoTanks();
    const recentEvents = world.eventGraph.getEventsByTick(Math.max(0, tick - 3), tick);

    return {
      entities,
      getRelation: (a, b) => world.relations.get(a, b),
      daoTanks,
      tick,
      recentEvents,
      totalParticles: world.getWorldTotal(),
    };
  }

  /** 获取触发历史（调试/测试用） */
  getHistory(): ReadonlyMap<string, FiringRecord> {
    return this.firingHistory;
  }
}
