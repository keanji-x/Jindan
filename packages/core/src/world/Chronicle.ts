// ============================================================
// Chronicle — 编年史（tick 聚合叙事摘要）
//
// 每 tick 结束后从 EventGraph 聚合事件，生成模板化的
// 叙事条目。零 LLM，纯模板 + 统计驱动。
// 每个 tick 必定产出一条条目（平淡 tick 用世态总结）。
// ============================================================

import { UNIVERSE } from "./config/universe.config.js";
import type { WorldEventRecord } from "./types.js";
import type { World } from "./World.js";
import { DAO_ENTITY_ID } from "./World.js";

/** 一条编年史条目 */
export interface ChronicleEntry {
  tick: number;
  /** 一句话标题 */
  headline: string;
  /** 2-3 句模板聚合描述 */
  body: string;
  /** 重要度 0-1 */
  intensity: number;
  /** 相关实体 ID */
  involvedIds: string[];
}

// ── 戏剧性事件权重（用于 intensity 计算）─────────────────
const EVENT_WEIGHTS: Record<string, number> = {
  entity_died: 3,
  entity_breakthrough: 4,
  entity_devoured: 2,
  entity_reincarnated: 3,
  entity_created: 1,
  entity_chat: 0.3,
  entity_sect_founded: 3,
  entity_enslaved: 2,
  entity_tomb: 1,
  entity_courted: 0.5,
  entity_spawned_offspring: 1.5,
  entity_mated: 1,
  entity_recruited: 1,
  entity_released: 0.5,
  entity_absorbed: 0.05,
  entity_drained: 0.05,
  // Drama events
  drama_rescue: 4,
  drama_heavenly_jealousy: 3,
  drama_betrayal: 4,
  drama_qi_storm: 2,
  drama_sect_crisis: 2,
};

/** 从事件中提取可读名字 */
function extractName(event: WorldEventRecord): string {
  const d = event.data as Record<string, unknown>;
  if (d.entity && typeof (d.entity as Record<string, unknown>).name === "string") {
    return (d.entity as Record<string, unknown>).name as string;
  }
  if (typeof d.name === "string") return d.name;
  return event.sourceId.slice(0, 6);
}

function extractTargetName(event: WorldEventRecord): string {
  const d = event.data as Record<string, unknown>;
  if (d.target && typeof (d.target as Record<string, unknown>).name === "string") {
    return (d.target as Record<string, unknown>).name as string;
  }
  if (d.loser && typeof (d.loser as Record<string, unknown>).name === "string") {
    return (d.loser as Record<string, unknown>).name as string;
  }
  return event.targetId ?? "未知";
}

/** 编年史系统 */
export class Chronicle {
  private readonly entries: ChronicleEntry[] = [];
  private static readonly MAX_ENTRIES = 500;

  /**
   * 分析本 tick 的事件并生成编年史条目。
   * 每个 tick 必定产出一条（平淡 tick 用世态总结）。
   */
  summarizeTick(world: World, tick: number): ChronicleEntry {
    const events = world.eventGraph.getEventsByTick(tick, tick);
    // 过滤掉 tick_complete 和系统内部事件
    const meaningful = events.filter(
      (e) => e.type !== "tick_complete" && e.sourceId !== DAO_ENTITY_ID,
    );

    // ── 统计 ──────────────────────────────────────────────
    const typeCounts: Record<string, WorldEventRecord[]> = {};
    for (const e of meaningful) {
      if (!typeCounts[e.type]) typeCounts[e.type] = [];
      typeCounts[e.type]!.push(e);
    }

    const deaths = typeCounts["entity_died"] ?? [];
    const breakthroughs = typeCounts["entity_breakthrough"] ?? [];
    const devours = typeCounts["entity_devoured"] ?? [];
    const created = typeCounts["entity_created"] ?? [];
    const sectFounded = typeCounts["entity_sect_founded"] ?? [];
    const chats = typeCounts["entity_chat"] ?? [];
    const offspring = typeCounts["entity_spawned_offspring"] ?? [];
    const courted = typeCounts["entity_courted"] ?? [];
    const dramaEvents = meaningful.filter((e) => e.type.startsWith("drama_"));

    // ── 计算重要度 ────────────────────────────────────────
    let rawScore = 0;
    for (const e of meaningful) {
      rawScore += EVENT_WEIGHTS[e.type] ?? 0.05;
    }
    const intensity = Math.min(1, rawScore / 10);

    // ── 生成标题和正文 ────────────────────────────────────
    const headlines: string[] = [];
    const bodyLines: string[] = [];
    const involvedIds = new Set<string>();

    // ── 戏剧性事件优先 ──
    for (const e of dramaEvents) {
      const d = e.data as Record<string, unknown> | undefined;
      const msg = typeof d?.message === "string" ? d.message : "剧变!";
      headlines.push(msg);
      involvedIds.add(e.sourceId);
      if (e.targetId) involvedIds.add(e.targetId);
    }

    // 大批死亡
    if (deaths.length >= 3) {
      headlines.push("天地浩劫");
      bodyLines.push(`本日 ${deaths.length} 位生灵陨落。`);
      for (const e of deaths) {
        involvedIds.add(e.sourceId);
        if (e.targetId) involvedIds.add(e.targetId);
      }
    } else if (deaths.length > 0) {
      for (const e of deaths) {
        const name = extractName(e);
        headlines.push(`「${name}」陨落`);
        bodyLines.push(`「${name}」陨落。`);
        involvedIds.add(e.sourceId);
      }
    }

    // 突破
    for (const e of breakthroughs) {
      const name = extractName(e);
      const d = e.data as Record<string, unknown>;
      const newRealm = d.newRealm ?? d.realm ?? "?";
      headlines.push(`「${name}」突破至 ${newRealm} 阶`);
      bodyLines.push(`「${name}」突破成功，修为精进。`);
      involvedIds.add(e.sourceId);
    }

    // 吞噬
    for (const e of devours) {
      const winner = extractName(e);
      const loser = extractTargetName(e);
      bodyLines.push(`「${winner}」吞噬了「${loser}」。`);
      involvedIds.add(e.sourceId);
      if (e.targetId) involvedIds.add(e.targetId);
    }

    // 新生
    if (created.length > 0) {
      bodyLines.push(`${created.length} 位新生灵降生天地间。`);
    }

    // 繁衍
    if (offspring.length > 0) {
      bodyLines.push(`${offspring.length} 位生灵繁衍后代。`);
    }

    // 宗门
    for (const e of sectFounded) {
      bodyLines.push(`「${extractName(e)}」创立宗门。`);
      involvedIds.add(e.sourceId);
    }

    // 社交活动
    if (chats.length > 0) {
      bodyLines.push(`${chats.length} 次传音对话。`);
    }
    if (courted.length > 0) {
      bodyLines.push(`${courted.length} 对修士结伴游历。`);
    }

    // ── 世态总结（总是附加）──────────────────────────────
    const aliveCount = world.getAliveEntities().length;
    const daoTanks = world.getDaoTanks();
    const daoQl = daoTanks.ql ?? 0;
    const daoQs = daoTanks.qs ?? 0;
    const daoTotal = daoQl + daoQs;
    const daoPercent = UNIVERSE.totalParticles > 0 ? daoTotal / UNIVERSE.totalParticles : 0;

    // 灵气状况一句话
    const qiStatus =
      daoPercent > 0.9
        ? "灵气充盈"
        : daoPercent > 0.7
          ? "灵气丰盛"
          : daoPercent > 0.5
            ? "灵气平稳"
            : daoPercent > 0.3
              ? "灵气渐薄"
              : "灵气匮乏";

    bodyLines.push(`存活 ${aliveCount} 生灵，${qiStatus}（${Math.round(daoPercent * 100)}%）。`);

    // ── 组装标题 ──
    let headline: string;
    if (headlines.length > 0) {
      headline = headlines[0]!;
    } else if (intensity >= 0.1) {
      headline = "世事变迁";
    } else {
      headline = "天下太平";
    }

    const entry: ChronicleEntry = {
      tick,
      headline,
      body: bodyLines.join(""),
      intensity,
      involvedIds: Array.from(involvedIds),
    };

    this.entries.push(entry);
    if (this.entries.length > Chronicle.MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - Chronicle.MAX_ENTRIES);
    }

    return entry;
  }

  /** 获取最近 N 条编年史 */
  getRecent(limit = 20): ChronicleEntry[] {
    return this.entries.slice(-limit);
  }

  /** 按 tick 范围查询 */
  getByTickRange(startTick: number, endTick: number): ChronicleEntry[] {
    return this.entries.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }

  /** 获取全部条目 */
  getAll(): readonly ChronicleEntry[] {
    return this.entries;
  }
}
