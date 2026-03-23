// ============================================================
// Drama Templates — 5 个内置冲突剧情模板
//
// 所有模板都是纯函数/纯数据，不调用 LLM。
// 通过 Effect 链与 World 交互。
// ============================================================

import { UNIVERSE } from "../config/universe.config.js";
import type { Effect } from "../effects/types.js";
import type { DramaCast, DramaContext, PlotTemplate } from "./DramaDirector.js";

// ── 辅助函数 ──────────────────────────────────────────────

/** 获取实体核心灵气 */
function coreQi(entity: {
  components: { tank?: { tanks: Record<string, number>; coreParticle: string } };
}): number {
  const tank = entity.components.tank;
  if (!tank) return 0;
  return tank.tanks[tank.coreParticle] ?? 0;
}

/** 获取实体境界 */
function realm(entity: { components: { cultivation?: { realm: number } } }): number {
  return entity.components.cultivation?.realm ?? 1;
}

/** 获取实体最大灵气（占比上限 × 总量） */
function maxQi(species: string, entityRealm: number): number {
  const reactor = UNIVERSE.reactors[species];
  if (!reactor) return 1000;
  return Math.floor(reactor.proportionLimit(entityRealm) * UNIVERSE.totalParticles);
}

/** 灵气比率 */
function qiRatio(entity: {
  species: string;
  components: {
    tank?: { tanks: Record<string, number>; coreParticle: string };
    cultivation?: { realm: number };
  };
}): number {
  const qi = coreQi(entity);
  const max = maxQi(entity.species, realm(entity));
  return max > 0 ? qi / max : 0;
}

// ============================================================
// 模板 1: 虎口夺食
// 条件: A 灵气 < 20%,  B 与 A 关系 > 50，B 境界 ≥ 附近威胁的境界
// 效果: B 对威胁实体发起 devour（见义勇为）
// ============================================================

const RESCUE: PlotTemplate = {
  id: "rescue",
  name: "虎口夺食",
  cooldownTicks: 10,
  maxFirings: -1,

  match(ctx: DramaContext): DramaCast[] {
    const casts: DramaCast[] = [];
    for (const victim of ctx.entities) {
      if (qiRatio(victim) > 0.2) continue; // 不够惨
      if (victim.species === "dao" || victim.species === "sect") continue;

      // 找最近的吞噬者（通过近期事件）
      const attacker = ctx.entities.find((e) => {
        if (e.id === victim.id) return false;
        return ctx.recentEvents.some(
          (ev) =>
            ev.type === "entity_devoured" && ev.sourceId === e.id && ev.targetId === victim.id,
        );
      });
      if (!attacker) continue;

      // 找救援者: 与 victim 关系 > 50, 境界 ≥ attacker, 不是 attacker 自己
      const rescuer = ctx.entities.find((e) => {
        if (e.id === victim.id || e.id === attacker.id) return false;
        const rel = ctx.getRelation(e.id, victim.id);
        return rel > 50 && realm(e) >= realm(attacker);
      });
      if (!rescuer) continue;

      casts.push({
        actors: { victim, attacker, rescuer },
        headline: `「${rescuer.name}」见义勇为，出手救助「${victim.name}」`,
      });
    }
    return casts;
  },

  produce(cast: DramaCast, tick: number): Effect[] {
    const { rescuer, attacker, victim } = cast.actors;
    return [
      // 救援者情绪激昂
      { type: "adjust_mood", entityId: rescuer!.id, delta: 0.2 },
      // 救援者与受害者关系加深
      { type: "adjust_relation", a: rescuer!.id, b: victim!.id, delta: 20 },
      // 救援者与攻击者关系恶化
      { type: "adjust_relation", a: rescuer!.id, b: attacker!.id, delta: -30 },
      // 记录戏剧性事件
      {
        type: "emit_event",
        event: {
          tick,
          type: "drama_rescue",
          data: {
            rescuer: { id: rescuer!.id, name: rescuer!.name },
            victim: { id: victim!.id, name: victim!.name },
            attacker: { id: attacker!.id, name: attacker!.name },
          },
          message: cast.headline,
        },
      },
    ];
  },
};

// ============================================================
// 模板 2: 天妒英才
// 条件: 实体刚突破 且 占比 > proportionLimit × 1.5
// 效果: 额外的负面 effect（心境骤降 + 灵气损失）
// ============================================================

const HEAVENLY_JEALOUSY: PlotTemplate = {
  id: "heavenly_jealousy",
  name: "天妒英才",
  cooldownTicks: 5,
  maxFirings: -1,

  match(ctx: DramaContext): DramaCast[] {
    const casts: DramaCast[] = [];
    for (const entity of ctx.entities) {
      if (entity.species === "dao") continue;
      const reactor = UNIVERSE.reactors[entity.species];
      if (!reactor) continue;

      const entityRealm = realm(entity);
      const limit = reactor.proportionLimit(entityRealm);
      const proportion = ctx.totalParticles > 0 ? coreQi(entity) / ctx.totalParticles : 0;

      // 占比超标 1.5 倍
      if (proportion <= limit * 1.5) continue;

      // 近期刚突破
      const justBroke = ctx.recentEvents.some(
        (ev) => ev.type === "entity_breakthrough" && ev.sourceId === entity.id,
      );
      if (!justBroke) continue;

      casts.push({
        actors: { prodigy: entity },
        headline: `天妒英才：「${entity.name}」修为太过耀眼，引天道注目`,
      });
    }
    return casts;
  },

  produce(cast: DramaCast, tick: number): Effect[] {
    const prodigy = cast.actors.prodigy!;
    return [
      { type: "adjust_mood", entityId: prodigy.id, delta: -0.3 },
      {
        type: "emit_event",
        event: {
          tick,
          type: "drama_heavenly_jealousy",
          data: { entity: { id: prodigy.id, name: prodigy.name } },
          message: cast.headline,
        },
      },
    ];
  },
};

// ============================================================
// 模板 3: 背叛
// 条件: A 与 B 关系 > 60, 但 A 灵气 < 15%（绝望中铤而走险）
// 效果: 关系骤降 + 情绪事件
// ============================================================

const BETRAYAL: PlotTemplate = {
  id: "betrayal",
  name: "背叛",
  cooldownTicks: 15,
  maxFirings: -1,

  match(ctx: DramaContext): DramaCast[] {
    const casts: DramaCast[] = [];
    for (const betrayer of ctx.entities) {
      if (betrayer.species === "dao" || betrayer.species === "sect") continue;
      if (qiRatio(betrayer) > 0.15) continue; // 不够绝望

      // 20% 概率触发（不是每次都背叛）
      if (Math.random() > 0.2) continue;

      // 找一个高好感目标
      const friend = ctx.entities.find((e) => {
        if (e.id === betrayer.id) return false;
        if (e.species === "dao") return false;
        return ctx.getRelation(betrayer.id, e.id) > 60;
      });
      if (!friend) continue;

      casts.push({
        actors: { betrayer, friend },
        headline: `「${betrayer.name}」在绝望中背叛了「${friend.name}」`,
      });
    }
    return casts;
  },

  produce(cast: DramaCast, tick: number): Effect[] {
    const { betrayer, friend } = cast.actors;
    return [
      // 关系崩塌
      { type: "adjust_relation", a: betrayer!.id, b: friend!.id, delta: -80 },
      // 背叛者心境动荡
      { type: "adjust_mood", entityId: betrayer!.id, delta: -0.2 },
      // 被背叛者心境受挫
      { type: "adjust_mood", entityId: friend!.id, delta: -0.15 },
      {
        type: "emit_event",
        event: {
          tick,
          type: "drama_betrayal",
          data: {
            betrayer: { id: betrayer!.id, name: betrayer!.name },
            friend: { id: friend!.id, name: friend!.name },
          },
          message: cast.headline,
        },
      },
    ];
  },
};

// ============================================================
// 模板 4: 灵气风暴
// 条件: 天道灵气占比 > 80%（大量实体死亡后灵气回流）
// 效果: 所有存活实体心境提升（天降甘露感）
// ============================================================

const QI_STORM: PlotTemplate = {
  id: "qi_storm",
  name: "灵气风暴",
  cooldownTicks: 20,
  maxFirings: -1,

  match(ctx: DramaContext): DramaCast[] {
    const daoQl = ctx.daoTanks.ql ?? 0;
    const daoQs = ctx.daoTanks.qs ?? 0;
    const daoTotal = daoQl + daoQs;
    const ratio = ctx.totalParticles > 0 ? daoTotal / ctx.totalParticles : 0;

    if (ratio < 0.8) return [];

    // 需要至少有 2 个存活实体才有意义
    const nonDao = ctx.entities.filter((e) => e.species !== "dao");
    if (nonDao.length < 2) return [];

    return [
      {
        actors: {},
        headline: "灵气风暴：天地灵气四溢，万物沐浴灵光",
      },
    ];
  },

  produce(cast: DramaCast, tick: number): Effect[] {
    // 全体心境提升的 Effect（具体实体在 World.applyEffect 时实现）
    return [
      {
        type: "emit_event",
        event: {
          tick,
          type: "drama_qi_storm",
          data: {},
          message: cast.headline,
        },
      },
    ];
  },
};

// ============================================================
// 模板 5: 宗门危机
// 条件: 宗门灵气 < 30% 且有弟子存在
// 效果: 弟子关系下降（被压榨感）+ 宗门心境事件
// ============================================================

const SECT_CRISIS: PlotTemplate = {
  id: "sect_crisis",
  name: "宗门危机",
  cooldownTicks: 10,
  maxFirings: -1,

  match(ctx: DramaContext): DramaCast[] {
    const casts: DramaCast[] = [];
    for (const sect of ctx.entities) {
      if (sect.species !== "sect") continue;
      if (qiRatio(sect) > 0.3) continue; // 宗门还没到危机

      // 找弟子（与宗门关系 > 30 的实体）
      const disciples = ctx.entities.filter((e) => {
        if (e.id === sect.id || e.species === "dao") return false;
        return ctx.getRelation(e.id, sect.id) > 30;
      });
      if (disciples.length === 0) continue;

      casts.push({
        actors: { sect, disciple: disciples[0]! },
        headline: `宗门「${sect.name}」灵气告急，弟子人心惶惶`,
      });
    }
    return casts;
  },

  produce(cast: DramaCast, tick: number): Effect[] {
    const { sect, disciple } = cast.actors;
    return [
      // 弟子对宗门不满
      { type: "adjust_relation", a: disciple!.id, b: sect!.id, delta: -15 },
      // 弟子心境下降
      { type: "adjust_mood", entityId: disciple!.id, delta: -0.1 },
      {
        type: "emit_event",
        event: {
          tick,
          type: "drama_sect_crisis",
          data: {
            sect: { id: sect!.id, name: sect!.name },
            disciple: { id: disciple!.id, name: disciple!.name },
          },
          message: cast.headline,
        },
      },
    ];
  },
};

// ── 导出所有内置模板 ──────────────────────────────────────

export const BUILTIN_PLOTS: PlotTemplate[] = [
  RESCUE,
  HEAVENLY_JEALOUSY,
  BETRAYAL,
  QI_STORM,
  SECT_CRISIS,
];
